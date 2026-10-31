import { z } from 'zod';
import { getDb, authoring, media, DomainError } from '@lms/db';
import { allLessons, findLesson, mediaSceneOf, reactionScenes, isRichTextEmpty, mediaPresentationStale, type MediaRef } from '@lms/course-schema';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { MEDIA_NODE_TYPES, backgroundExtras, directedPartialReuse, draftFingerprint, scenePresentationFingerprint, getMediaConfig, recomposeAlphaKey, recomposeJobInput, resolveSceneProduction, sceneRequestFromPresentation, spokenTextOfNode } from '@/server/media';
import { mediaBudgetCheck } from '@/server/spend';

const QuoteSchema = z.object({
  /** restringe às aulas (vazio/ausente = todas) */
  lessonIds: z.array(z.string().min(1).max(64)).max(500).optional(),
  /** restringe às cenas (ids de nó; vazio/ausente = todas as elegíveis). Cenas listadas entram mesmo com vídeo atualizado. */
  nodeIds: z.array(z.string().min(1).max(64)).max(1000).optional(),
  /** incluir cenas com vídeo desatualizado (stale) além das sem vídeo */
  includeStale: z.boolean().default(true),
});

/**
 * Orçamento de produção (auditoria P0-2): resolve cada cena elegível no
 * servidor, confere direção/fala como o pedido avulso, identifica as que
 * reaproveitam um vídeo já pago (custo 0) e devolve o total estimado com um
 * `quoteId` de validade curta. Nada é criado nem cobrado aqui.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, QuoteSchema);
    const db = getDb();
    const draft = await authoring.getDraft(db, courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const doc = draft.document;
    const cfg = getMediaConfig();
    if (!doc.presentation.avatarId) throw new DomainError('VALIDATION', 'Escolha um apresentador no passo "Apresentação" antes de calcular o orçamento');
    if (doc.presentation.background.type !== 'color' && doc.presentation.background.assetId) {
      const bg = await media.getAsset(db, doc.presentation.background.assetId);
      if (!bg || bg.workspaceId !== viewer.workspace.id || bg.kind !== 'image') throw new DomainError('VALIDATION', 'A imagem de fundo da apresentação é inválida; escolha outra no passo "Apresentação"');
    }
    const lessonFilter = body.lessonIds?.length ? new Set(body.lessonIds) : null;
    const nodeFilter = body.nodeIds?.length ? new Set(body.nodeIds) : null;

    // cenas elegíveis: com texto falado, sem vídeo (ou desatualizado, se includeStale), ou explicitamente pedidas
    const candidates: Array<{ lessonId: string; nodeId: string; title: string; lessonTitle: string }> = [];
    for (const l of allLessons(doc)) {
      if (lessonFilter && !lessonFilter.has(l.id)) continue;
      // cenas do grafo + as reações da instrutora a cada resposta (cenas sintéticas "decisão~opção"; reaction.ts)
      for (const n of [...l.graph.nodes, ...reactionScenes(l.graph)]) {
        if (!MEDIA_NODE_TYPES.has(n.type)) continue;
        if (nodeFilter && !nodeFilter.has(n.id)) continue;
        const text = 'narration' in n && typeof n.narration === 'string' && n.narration.trim() ? n.narration : spokenTextOfNode(n as never);
        if (!text.trim() || ('body' in n && isRichTextEmpty(n.body as never) && !('narration' in n && n.narration))) {
          if (!text.trim()) continue;
        }
        const m = (n as { media?: MediaRef }).media;
        if (!nodeFilter) {
          // desatualizado = pelo texto (`stale`) ou pela apresentação (impressão diferente; auditoria P1-1)
          const stale = !!m && (m.stale === true || mediaPresentationStale(m, doc.presentation, n));
          if (m && !stale) continue;
          if (m && stale && !body.includeStale) continue;
        }
        candidates.push({ lessonId: l.id, nodeId: n.id, title: n.title ?? n.id, lessonTitle: l.title });
      }
    }

    const errors: Array<{ lessonId: string; nodeId: string; title: string; message: string }> = [];
    const resolved: Array<ReturnType<typeof resolveSceneProduction>> = [];
    for (const c of candidates) {
      try {
        resolved.push(resolveSceneProduction(doc, sceneRequestFromPresentation(doc, c.lessonId, c.nodeId), cfg));
      } catch (e) {
        if (e instanceof DomainError && (e.code === 'VALIDATION' || e.code === 'NOT_FOUND')) errors.push({ lessonId: c.lessonId, nodeId: c.nodeId, title: c.title, message: e.message });
        else throw e;
      }
    }

    const openJobs = (await media.listJobsForCourse(db, courseId)).filter((j) => j.status === 'queued' || j.status === 'running');
    const openByScene = new Map(openJobs.map((j) => [`${j.lessonId}:${j.nodeId}`, j.id]));
    const reusable = await media.findSucceededJobsByHashes(db, { workspaceId: viewer.workspace.id, sceneHashes: resolved.map((r) => r.sceneHash), provider: 'heygen', simulated: cfg.simulation });
    // remontagem sem custo: fala já paga (vídeo transparente com a mesma alphaKey) só montada sobre o novo fundo/posição
    const alphaKeys = new Map(resolved.map((r) => [r.sceneHash, recomposeAlphaKey(r)] as const));
    const recomposable = await media.findRecomposeSourcesByAlphaKeys(db, { workspaceId: viewer.workspace.id, alphaKeys: [...alphaKeys.values()].filter((k): k is string => !!k) });
    // o mesmo fundo/posição já montado de verdade (job real) vale como reaproveitamento mesmo em modo de demonstração
    const realDone = cfg.simulation ? await media.findSucceededJobsByHashes(db, { workspaceId: viewer.workspace.id, sceneHashes: resolved.map((r) => r.sceneHash), provider: 'heygen', simulated: false }) : reusable;

    // cena dirigida já gravada e refeita com planos novos (ex.: chamada para a pergunta): o worker reaproveita os planos
    // pagos pela chave e grava só os novos — o orçamento cobra só esses (conservador: na dúvida, custo cheio)
    const partial = new Map<string, NonNullable<ReturnType<typeof directedPartialReuse>>>();
    for (const r of resolved) {
      if (reusable.get(r.sceneHash) ?? realDone.get(r.sceneHash)) continue;
      const lessonGraph = findLesson(doc, r.lessonId)?.lesson.graph;
      const node = lessonGraph ? mediaSceneOf(lessonGraph, r.nodeId) : null;
      const prevJobId = node && 'media' in node ? node.media?.generatedFrom?.jobId : undefined;
      if (!prevJobId) continue;
      const prev = await media.getJob(db, prevJobId);
      if (!prev || prev.status !== 'succeeded' || prev.workspaceId !== viewer.workspace.id) continue;
      const prevInput = (prev.input ?? {}) as Record<string, unknown>;
      const prevCameraIds = ((prevInput.direction as { shots?: Array<{ cameraId?: string }> } | undefined)?.shots ?? []).map((s) => s.cameraId).filter((x): x is string => !!x);
      const req = sceneRequestFromPresentation(doc, r.lessonId, r.nodeId);
      const fpPrevCams = scenePresentationFingerprint(doc.presentation, req, backgroundExtras(doc.presentation, req), prevCameraIds);
      const p = directedPartialReuse({ jobId: prev.id, input: prevInput, adapterVersion: prev.adapterVersion, simulated: prev.simulated === 1 }, r, cfg.simulation, fpPrevCams);
      if (p) partial.set(`${r.lessonId}:${r.nodeId}`, p);
    }

    const items: media.MediaQuoteItem[] = resolved.map((r) => {
      const reuse = reusable.get(r.sceneHash) ?? realDone.get(r.sceneHash);
      const reused = !!reuse?.outputAssetId;
      const open = openByScene.has(`${r.lessonId}:${r.nodeId}`);
      const alphaKey = alphaKeys.get(r.sceneHash) ?? null;
      const source = !reused && alphaKey ? recomposable.get(alphaKey) : undefined;
      if (source) {
        return {
          lessonId: r.lessonId, nodeId: r.nodeId, title: r.title, lessonTitle: r.lessonTitle,
          chars: r.estimate.characters, seconds: r.estimate.narrationSeconds, cinematicShots: r.estimate.cinematicShots,
          reused: true, recompose: true, ...(open ? { open: true } : {}), estimatedUsd: 0,
          sceneHash: r.sceneHash, reusedJobId: source.id, jobInput: recomposeJobInput(r, source, alphaKey!), adapterVersion: r.adapterVersion,
        };
      }
      const part = !reused ? partial.get(`${r.lessonId}:${r.nodeId}`) : undefined;
      if (part) {
        return {
          lessonId: r.lessonId, nodeId: r.nodeId, title: r.title, lessonTitle: r.lessonTitle,
          chars: part.chars, seconds: part.seconds, cinematicShots: r.estimate.cinematicShots,
          reused: false, ...(open ? { open: true } : {}), estimatedUsd: part.estimatedUsd,
          partialReuse: { fromJobId: part.fromJobId, reusedShots: part.reusedShots, newShots: part.newShots },
          sceneHash: r.sceneHash, jobInput: r.jobInput, adapterVersion: r.adapterVersion,
        };
      }
      return {
        lessonId: r.lessonId, nodeId: r.nodeId, title: r.title, lessonTitle: r.lessonTitle,
        chars: r.estimate.characters, seconds: r.estimate.narrationSeconds, cinematicShots: r.estimate.cinematicShots,
        reused, ...(open ? { open: true } : {}), estimatedUsd: reused ? 0 : r.estimate.estimatedUsd,
        sceneHash: r.sceneHash, ...(reused ? { reusedJobId: reuse!.id } : {}), jobInput: r.jobInput, adapterVersion: r.adapterVersion,
      };
    });
    const quote = await media.createQuote(db, {
      workspaceId: viewer.workspace.id, courseId, draftRevision: draft.revision, draftHash: draftFingerprint(doc), simulated: cfg.simulation, items,
      params: { lessonIds: body.lessonIds ?? null, nodeIds: body.nodeIds ?? null, includeStale: body.includeStale, errors: errors.length }, createdBy: viewer.user.id,
    });
    // o teto é informado aqui e imposto no lote (nada é criado agora)
    const budget = cfg.simulation ? null : await mediaBudgetCheck(viewer.workspace.id, quote.totals.estimatedUsd);
    return { ...media.publicQuote(quote), mode: cfg.mode, errors, budget };
  });
}
