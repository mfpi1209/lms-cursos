import { DomainError, media, type Database } from '@lms/db';
import { allLessons, findLesson, mediaSceneOf, reactionScenes, isRichTextEmpty, mediaPresentationStale, type CourseDocument, type MediaRef } from '@lms/course-schema';
import { MEDIA_NODE_TYPES, backgroundExtras, directedPartialReuse, scenePresentationFingerprint, getMediaConfig, recomposeAlphaKey, recomposeJobInput, resolveSceneProduction, sceneRequestFromPresentation, spokenTextOfNode } from '@/server/media';

export type QuoteSceneError = { lessonId: string; nodeId: string; title: string; message: string };

/**
 * Núcleo do orçamento de produção, compartilhado pela rota `POST /api/courses/:id/media-jobs/quote` e pelo
 * script `gerar-curso`: escolhe as cenas elegíveis, resolve cada uma no servidor, identifica reaproveitamentos
 * (vídeo pago, remontagem, reuso parcial dirigido) e devolve os itens do orçamento. Só lê; não grava nada.
 */
export async function buildQuoteItems(
  db: Database,
  input: { doc: CourseDocument; workspaceId: string; courseId: string; lessonIds?: string[]; nodeIds?: string[]; includeStale: boolean; cfg: ReturnType<typeof getMediaConfig> },
): Promise<{ items: media.MediaQuoteItem[]; errors: QuoteSceneError[] }> {
  const { doc, workspaceId, courseId, cfg } = input;
  const body = { lessonIds: input.lessonIds, nodeIds: input.nodeIds, includeStale: input.includeStale };
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
    const reusable = await media.findSucceededJobsByHashes(db, { workspaceId: workspaceId, sceneHashes: resolved.map((r) => r.sceneHash), provider: 'heygen', simulated: cfg.simulation });
    // remontagem sem custo: fala já paga (vídeo transparente com a mesma alphaKey) só montada sobre o novo fundo/posição
    const alphaKeys = new Map(resolved.map((r) => [r.sceneHash, recomposeAlphaKey(r)] as const));
    const recomposable = await media.findRecomposeSourcesByAlphaKeys(db, { workspaceId: workspaceId, alphaKeys: [...alphaKeys.values()].filter((k): k is string => !!k) });
    // o mesmo fundo/posição já montado de verdade (job real) vale como reaproveitamento mesmo em modo de demonstração
    const realDone = cfg.simulation ? await media.findSucceededJobsByHashes(db, { workspaceId: workspaceId, sceneHashes: resolved.map((r) => r.sceneHash), provider: 'heygen', simulated: false }) : reusable;

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
      if (!prev || prev.status !== 'succeeded' || prev.workspaceId !== workspaceId) continue;
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
  return { items, errors };
}
