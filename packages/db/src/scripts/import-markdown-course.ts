/**
 * Importa um roteiro de curso em Markdown (formato de docs/roteiros/*.md; ver
 * `parseMarkdownCourse` em @lms/course-schema) como RASCUNHO no workspace do
 * curso de origem (padrão: "Pode entrar", crs_7vbrb49jkq23ibiw), sem IA e sem
 * chamar provedor nenhum. Do rascunho de origem vêm a apresentação (avatar,
 * voz, cenário com balcão, posição e as câmeras `cam_principal` e
 * `cam_cenario_34`); a marca vem das opções abaixo (`--wordmark`, `--subtitle`…).
 *
 * Idempotente pelo título: curso existente no workspace com o mesmo título é
 * atualizado com `saveDraft` (nova revisão, `origin: 'script'`) — tanto quando
 * nunca foi publicado quanto quando já tem versão (a revisão nova fica por cima
 * da publicada); documento idêntico ao rascunho atual não grava nada. Curso
 * novo: criado vazio e gravado em seguida pela mesma via (revisão 2 = roteiro).
 *
 * Uso (na raiz do monorepo, com DATABASE_URL no ambiente):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/import-markdown-course.ts \
 *     --file docs/roteiros/curso-primeira-vaga.md [--title "…"] [--dry-run] [--publish] [--enroll-demo] \
 *     [--wordmark "Primeira Vaga"] [--subtitle "DNA Work"] [--tagline "…"] [--presenter "Marina"] [--presenter-role "Sua orientadora"] \
 *     [--closing-line "…"] [--cameras cam_principal,cam_cenario_34] [--source-course crs_…] [--no-direction]
 *     [--zone-cameras cam_estudio_esq,cam_estudio_dir,cam_estudio_34]
 *     [--voice <voice_id ElevenLabs>] [--voice-name "…"] [--avatar-name "…"] [--presenter-pronoun she|he|they] [--watermark]
 *     [--kit estudio7-marina] [--workspace wsp_…]
 *
 * `--kit` (biblioteca de modelos, ver `biblioteca-modelos.ts`): em vez de copiar
 * a apresentação de outro curso, monta tudo a partir de um KIT da biblioteca do
 * workspace — estúdio, instrutor (câmeras de zona prontas, 3/4 principal),
 * voz, letreiro, marca d'água, vinheta e estilo de direção. Não combina com
 * `--cameras`/`--zone-cameras`/`--source-course`. O workspace é `--workspace`
 * ou o único que existir. Aplicar o kit só copia dados: nada é gerado nem pago.
 *
 * `--zone-cameras` (estúdio com zonas): usa SÓ essas câmeras do rascunho de
 * origem (todas precisam existir e estar prontas, com look), cada uma com a
 * sua `zone` (a gravada na câmera; sem ela, deduzida do id/nome: "esq" =
 * apresentadora à esquerda, "dir" = à direita, "34"/"3/4"/"centro" = 3/4
 * centralizada). A 3/4 vira a câmera principal. Com câmeras de zona, a
 * conversão dirige TODOS os vídeos no modo de zonas (fala na câmera da cena,
 * pílulas numa câmera lateral alternando o lado). Nenhum provedor é chamado.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, inArray } from 'drizzle-orm';
import { applyKitToDocument, brandingFromKit, emptyCourseDocument, importMarkdownCourse, KitError, presentationFromKit, type ResolvedKit, type Camera, type CameraZone, type CompileIssue, type CourseDocument, type MarkdownCourseOptions, type Presentation } from '@lms/course-schema';
import { createDb, type Database } from '../client';
import * as s from '../schema';
import { createCourse, getDraft, saveDraft } from '../repositories/authoring';
import { getLatestVersion, publishCourse } from '../repositories/publishing';
import { enrollStudent } from '../repositories/learning';
import { resolveKit } from '../repositories/library';

const DEMO_LEARNERS = ['aluno@demo.local', 'aluna@demo.local'];
const AUTHOR_EMAIL = 'autor@demo.local';

export interface CliArgs {
  file: string;
  title?: string;
  dryRun: boolean;
  publish: boolean;
  enrollDemo: boolean;
  wordmark?: string;
  subtitle?: string;
  tagline?: string;
  presenter?: string;
  presenterRole?: string;
  closingLine?: string;
  cameras?: string[];
  sourceCourse: string;
  direction: boolean;
  /** estúdio com zonas: câmeras de zona do curso de origem (ver o cabeçalho) */
  zoneCameras?: string[];
  /** troca a voz herdada do curso de origem (id ElevenLabs já na conta) */
  voice?: string;
  voiceName?: string;
  /** nome do apresentador mostrado no estúdio (`presentation.avatarName`) */
  avatarName?: string;
  /** gênero do apresentador (rótulos do player e prompts): she | he | they */
  presenterPronoun?: 'she' | 'he' | 'they';
  /** marca d'água do logo nos vídeos (rodapé direito, opacidade 0,7) */
  watermark: boolean;
  /** kit da biblioteca de modelos (ex.: estudio7-marina) no lugar do curso de origem */
  kit?: string;
  /** workspace do kit (padrão: o único workspace) */
  workspace?: string;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) {
      flags.set(a.slice(2, eq), a.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(a.slice(2), next);
      i++;
    } else flags.set(a.slice(2), true);
  }
  const str = (k: string) => {
    const v = flags.get(k);
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  const file = str('file');
  if (!file) throw new Error('informe --file <roteiro.md>');
  const cameras = str('cameras')?.split(',').map((c) => c.trim()).filter(Boolean);
  const zoneCameras = str('zone-cameras')?.split(',').map((c) => c.trim()).filter(Boolean);
  const kit = str('kit');
  if (kit && (cameras?.length || zoneCameras?.length || flags.has('source-course'))) throw new Error('--kit já traz estúdio, instrutor e câmeras: não combine com --cameras, --zone-cameras ou --source-course');
  return {
    file,
    title: str('title'),
    dryRun: flags.has('dry-run'),
    publish: flags.has('publish'),
    enrollDemo: flags.has('enroll-demo'),
    wordmark: str('wordmark'),
    subtitle: str('subtitle'),
    tagline: str('tagline'),
    presenter: str('presenter'),
    presenterRole: str('presenter-role'),
    closingLine: str('closing-line'),
    ...(cameras?.length ? { cameras } : {}),
    sourceCourse: str('source-course') ?? process.env.SOURCE_COURSE_ID ?? 'crs_7vbrb49jkq23ibiw',
    direction: !flags.has('no-direction'),
    ...(zoneCameras?.length ? { zoneCameras } : {}),
    ...(str('voice') ? { voice: str('voice') } : {}),
    ...(str('voice-name') ? { voiceName: str('voice-name') } : {}),
    ...(str('avatar-name') ? { avatarName: str('avatar-name') } : {}),
    ...(['she', 'he', 'they'].includes(str('presenter-pronoun') ?? '') ? { presenterPronoun: str('presenter-pronoun') as 'she' | 'he' | 'they' } : {}),
    watermark: flags.has('watermark'),
    ...(kit ? { kit } : {}),
    ...(str('workspace') ? { workspace: str('workspace') } : {}),
  };
}

/** Sobrescreve voz e nome do apresentador herdados do curso de origem (`--voice`, `--voice-name`, `--avatar-name`). */
export function withPresenterOverrides(pres: Presentation, args: Pick<CliArgs, 'voice' | 'voiceName' | 'avatarName' | 'presenterPronoun'>): Presentation {
  const out = { ...pres };
  if (args.voice) {
    out.voiceId = args.voice;
    // nome da voz antiga não vale para a nova
    if (args.voiceName) out.voiceName = args.voiceName;
    else delete out.voiceName;
  } else if (args.voiceName) out.voiceName = args.voiceName;
  if (args.avatarName) out.avatarName = args.avatarName;
  if (args.presenterPronoun) out.presenterPronoun = args.presenterPronoun;
  return out;
}

/** Zona deduzida do id/nome da câmera (quando a câmera não traz `zone`): esq/esquerda/left, dir/direita/right, 34/3/4/centro/center. */
export function inferCameraZone(c: Pick<Camera, 'id' | 'name'> & Partial<Pick<Camera, 'zone'>>): CameraZone | undefined {
  if (c.zone) return c.zone;
  const t = `${c.id} ${c.name ?? ''}`.toLowerCase();
  if (/(^|[^a-z])(esq|esquerda|left)([^a-z]|$)/.test(t)) return 'left';
  if (/(^|[^a-z])(dir|direita|right)([^a-z]|$)/.test(t)) return 'right';
  if (/(^|[^0-9])3\/?4([^0-9]|$)|centro|center|central/.test(t)) return 'center';
  return undefined;
}

/**
 * Estúdio com zonas: as câmeras pedidas do curso de origem, cada uma com a sua
 * zona (gravada ou deduzida), prontas e com look; a 3/4 (centro) vira a
 * principal (primeira), depois esquerda e direita. Erro claro quando falta
 * câmera, ela não está pronta ou não tem zona.
 */
export function zoneCamerasFrom(source: Presentation, ids: readonly string[]): Camera[] {
  const byId = new Map(source.cameras.map((c) => [c.id, c]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`câmera(s) de zona ${missing.join(', ')} não existe(m) no curso de origem (há: ${source.cameras.map((c) => c.id).join(', ') || 'nenhuma'}); gere-as antes de usar --zone-cameras`);
  const out = ids.map((id) => {
    const c = structuredClone(byId.get(id)!);
    if ((c.status ?? 'ready') !== 'ready' || !c.lookId) throw new Error(`a câmera de zona ${id} ainda não está pronta (${c.status ?? 'sem look'}); espere a geração terminar`);
    const zone = inferCameraZone(c);
    if (!zone) throw new Error(`a câmera ${id} não tem zona (defina "Zona no estúdio" no estúdio ou use um id com esq/dir/34)`);
    return { ...c, zone };
  });
  if (!out.some((c) => c.zone === 'left' || c.zone === 'right')) throw new Error('--zone-cameras precisa de ao menos uma câmera lateral (apresentadora à esquerda ou à direita)');
  const order: Record<CameraZone, number> = { center: 0, left: 1, right: 2 };
  return out.sort((a, b) => order[a.zone] - order[b.zone]);
}

/** Apresentação do curso de origem, só com as câmeras pedidas (a primeira delas vira a principal); `zoneCameras` = estúdio com zonas. */
export function presentationFrom(source: Presentation, cameras?: readonly string[], zoneCameras?: readonly string[]): Presentation {
  const pres = structuredClone(source);
  if (zoneCameras?.length) {
    pres.cameras = zoneCamerasFrom(source, zoneCameras);
    const main = pres.cameras[0]!;
    pres.avatarId = main.lookId;
    if (main.previewUrl) pres.avatarPreviewUrl = main.previewUrl;
  } else if (cameras?.length) {
    const byId = new Map(pres.cameras.map((c) => [c.id, c]));
    const missing = cameras.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`câmera(s) ${missing.join(', ')} não existe(m) no curso de origem (há: ${pres.cameras.map((c) => c.id).join(', ') || 'nenhuma'})`);
    pres.cameras = cameras.map((id) => byId.get(id)!);
    // a primeira câmera da lista é a principal: o avatar do curso passa a ser o look dela
    // (é o que o worker usa nos planos sem câmera e o que o player mostra enquanto não há vídeo)
    const main = pres.cameras[0]!;
    if (main.status === 'ready' && main.lookId) {
      pres.avatarId = main.lookId;
      if (main.previewUrl) pres.avatarPreviewUrl = main.previewUrl;
    }
  }
  pres.directionStyle = { ...pres.directionStyle, cameraMode: 'single' };
  return pres;
}

/**
 * Opções do importador com um kit: apresentação e marca (letreiro, marca
 * d'água, vinheta) vêm do kit; voz/nome sobrescritos pelas flags valem por cima.
 * Puro (o kit já resolvido).
 */
export function optionsFromKit(args: CliArgs, resolved: ResolvedKit): MarkdownCourseOptions {
  let presentation: Presentation;
  try {
    presentation = withPresenterOverrides(presentationFromKit(resolved), args);
  } catch (e) {
    if (e instanceof KitError) throw new Error(`kit ${resolved.kit.key}: ${e.message}`);
    throw e;
  }
  const kitBrand = brandingFromKit(resolved);
  const base = optionsFrom({ ...args, watermark: false }, presentation);
  const p = resolved.presenter.data;
  return {
    ...base,
    branding: {
      ...base.branding,
      ...(kitBrand.watermark ? { watermark: kitBrand.watermark } : {}),
      ...(args.watermark ? { watermark: { enabled: true, position: 'bottom-right' as const, opacity: 0.7 } } : {}),
      ...(kitBrand.bumper ? { bumper: kitBrand.bumper } : {}),
      ...(kitBrand.accent ? { accent: kitBrand.accent } : {}),
    },
    presenter: { name: args.presenter ?? p.name, role: args.presenterRole ?? p.role, details: p.castDetails },
  };
}

export function optionsFrom(args: CliArgs, presentation: Presentation): MarkdownCourseOptions {
  return {
    ...(args.title ? { title: args.title } : {}),
    presentation,
    branding: {
      ...(args.wordmark ? { wordmark: args.wordmark } : {}),
      ...(args.subtitle ? { subtitle: args.subtitle } : {}),
      ...(args.tagline ? { tagline: args.tagline } : {}),
      ...(args.watermark ? { watermark: { enabled: true, position: 'bottom-right' as const, opacity: 0.7 } } : {}),
    },
    ...(args.presenter ? { presenter: { name: args.presenter, role: args.presenterRole ?? 'Sua apresentadora', details: 'Conduz todas as falas dos vídeos, em conversa com o aluno; nunca julga.' } } : {}),
    ...(args.closingLine ? { closingLine: args.closingLine } : {}),
    audienceProfile: 'first_job',
    level: 'beginner',
    traits: ['shy'],
    direction: args.direction,
  };
}

/** JSON com chaves ordenadas: o jsonb do Postgres reordena chaves (ex.: `layout.positions`), então a comparação ignora a ordem. */
export function stableJson(v: unknown): string {
  const sort = (x: unknown): unknown => (Array.isArray(x) ? x.map(sort) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, sort((x as Record<string, unknown>)[k])])) : x);
  return JSON.stringify(sort(v ?? null));
}
const json = stableJson;

/**
 * Reimportar não pode jogar fora vídeos já gerados (e pagos): cada cena do roteiro novo que tem o
 * mesmo id (na mesma aula) de uma cena com mídia no rascunho atual herda essa mídia. Se a fala, o
 * corpo ou a direção mudaram, a mídia fica marcada como desatualizada (`stale`), como o estúdio faz
 * ao editar o texto; o vídeo não é apagado e nada é gerado aqui.
 */
export function carryOverMedia(prev: CourseDocument, next: CourseDocument): { document: CourseDocument; kept: string[]; stale: string[] } {
  const kept: string[] = [];
  const stale: string[] = [];
  const prevNodes = new Map<string, Record<string, unknown>>();
  for (const m of prev.modules) for (const l of m.lessons) for (const n of l.graph.nodes) prevNodes.set(`${l.id}/${n.id}`, n as unknown as Record<string, unknown>);
  const spoken = (n: Record<string, unknown>) => json({ narration: n.narration ?? null, body: n.body ?? null, direction: n.direction ?? null });
  const document = structuredClone(next);
  for (const m of document.modules) {
    for (const l of m.lessons) {
      l.graph.nodes = l.graph.nodes.map((node) => {
        const n = node as unknown as Record<string, unknown>;
        const old = prevNodes.get(`${l.id}/${node.id}`);
        const media = old?.media as { stale?: boolean } | undefined;
        if (!old || !media || n.media) return node;
        const changed = spoken(old) !== spoken(n);
        const key = `${l.id}/${node.id}`;
        (changed ? stale : kept).push(key);
        return { ...n, media: changed ? { ...media, stale: true } : media } as unknown as typeof node;
      });
    }
  }
  return { document, kept, stale };
}

function printIssues(tag: string, issues: readonly CompileIssue[]) {
  const counts = new Map<string, number>();
  for (const w of issues) counts.set(w.code, (counts.get(w.code) ?? 0) + 1);
  console.log(`${tag} avisos: ${issues.length}${counts.size ? ` (${[...counts].map(([c, n]) => `${c}×${n}`).join(', ')})` : ''}`);
  for (const w of issues) if (w.code !== 'MEDIA_MISSING') console.log(`${tag}   ${w.code}${w.lessonId ? ` [${w.lessonId}${w.nodeId ? `/${w.nodeId}` : ''}]` : w.nodeId ? ` [${w.nodeId}]` : ''}: ${w.message}`);
}

export async function run(db: Database, args: CliArgs) {
  const tag = '[import-md]';
  const md = readFileSync(args.file, 'utf8');
  let workspaceId: string;
  let fallbackUserId: string | undefined;
  let options: MarkdownCourseOptions;
  let origin: string;
  let resolved: ResolvedKit | undefined;
  if (args.kit) {
    const all = await db.select({ id: s.workspaces.id }).from(s.workspaces);
    const ws = args.workspace ?? (all.length === 1 ? all[0]!.id : undefined);
    if (!ws) throw new Error('--kit com mais de um workspace: informe --workspace wsp_…');
    workspaceId = ws;
    resolved = await resolveKit(db, workspaceId, args.kit);
    options = optionsFromKit(args, resolved);
    origin = `kit ${args.kit}`;
  } else {
    const [source] = await db.select().from(s.courses).where(eq(s.courses.id, args.sourceCourse)).limit(1);
    if (!source) throw new Error(`curso de origem ${args.sourceCourse} não encontrado`);
    const sourceDraft = await getDraft(db, args.sourceCourse);
    if (!sourceDraft) throw new Error(`rascunho de ${args.sourceCourse} não encontrado`);
    workspaceId = source.workspaceId;
    fallbackUserId = source.createdBy;
    options = optionsFrom(args, withPresenterOverrides(presentationFrom(sourceDraft.document.presentation, args.cameras, args.zoneCameras), args));
    origin = args.sourceCourse;
  }
  const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, AUTHOR_EMAIL)).limit(1);
  const [member] = fallbackUserId ? [] : await db.select({ userId: s.workspaceMemberships.userId }).from(s.workspaceMemberships).where(eq(s.workspaceMemberships.workspaceId, workspaceId)).limit(1);
  const userId = author?.id ?? fallbackUserId ?? member?.userId;
  if (!userId) throw new Error(`nenhum autor no workspace ${workspaceId}`);

  const presentation = options.presentation as Presentation;
  const r = importMarkdownCourse(md, options);
  let doc = r.document;
  // o kit também acerta o elenco (o instrutor) e o pronome; idempotente sobre o que o importador já gravou
  if (resolved) {
    const kitName = resolved.presenter.data.name;
    doc = applyKitToDocument(doc, resolved).document;
    // flags explícitas (--presenter, --presenter-role, --voice, --avatar-name, --pronoun) valem POR CIMA do kit
    doc.presentation = withPresenterOverrides(doc.presentation, args);
    if (args.presenter && args.presenter !== kitName) {
      doc.branding = { ...doc.branding, presenterName: args.presenter };
      doc.cast = doc.cast.map((c) => (c.name === kitName ? { ...c, name: args.presenter! } : c));
    }
    if (args.presenterRole) {
      doc.branding = { ...doc.branding, presenterRole: args.presenterRole };
      doc.cast = doc.cast.map((c) => (c.name === (args.presenter ?? kitName) ? { ...c, role: args.presenterRole! } : c));
    }
  }
  console.log(`${tag} "${doc.title}": ${doc.modules.length} módulos, ${r.lessons.length} aulas, ${r.length.totals.scenes} cenas, ${r.length.totals.decisions} decisões, ~${r.length.totals.estMinutes} min (meta ${r.length.targetMinutes})`);
  for (const l of r.lessons) console.log(`${tag}   ${l.id} "${l.title}": ${l.nodes} nós, ${l.edges} arestas`);
  console.log(`${tag} apresentação de ${origin}: avatar ${presentation.avatarName ?? presentation.avatarId ?? '—'}, câmeras ${presentation.cameras.map((c) => `${c.id}${c.zone ? `(${c.zone})` : ''}`).join(', ') || 'nenhuma'}${args.zoneCameras ? ' [estúdio com zonas]' : ''}, fundo ${presentation.background.type === 'image' ? presentation.background.name ?? presentation.background.assetId : presentation.background.value}`);
  for (const e of r.compile.errors) console.error(`${tag} erro ${e.code}${e.lessonId ? ` (${e.lessonId})` : ''}: ${e.message}`);
  console.log(`${tag} compilação: ${r.compile.errors.length} erros`);
  printIssues(tag, r.allWarnings);
  if (!r.compile.ok) throw new Error('documento não compila; nada gravado');
  if (resolved) console.log(`${tag} kit ${resolved.kit.key}: ${resolved.presenter.data.name} no ${resolved.studio.name} (nenhuma geração paga; vídeos continuam a pedir aprovação)`);
  if (args.dryRun) {
    console.log(`${tag} --dry-run: nada gravado`);
    return { document: doc, courseId: null as string | null, revision: null as number | null };
  }

  const [existing] = await db.select({ id: s.courses.id, latestVersionNumber: s.courses.latestVersionNumber }).from(s.courses).where(and(eq(s.courses.workspaceId, workspaceId), eq(s.courses.title, doc.title))).limit(1);
  let courseId: string;
  let revision: number;
  if (existing) {
    const draft = await getDraft(db, existing.id);
    if (!draft) throw new Error(`rascunho de ${existing.id} não encontrado`);
    courseId = existing.id;
    revision = draft.revision;
    const published = existing.latestVersionNumber > 0;
    // vídeos já gerados continuam nas cenas (desatualizados quando a fala/direção mudou)
    const carried = carryOverMedia(draft.document, doc);
    doc = carried.document;
    if (carried.kept.length || carried.stale.length) console.log(`${tag} mídia preservada: ${carried.kept.length} cena(s) em dia${carried.kept.length ? ` (${carried.kept.join(', ')})` : ''}, ${carried.stale.length} desatualizada(s)${carried.stale.length ? ` (${carried.stale.join(', ')})` : ''}`);
    if (json(draft.document) === json(doc)) console.log(`${tag} curso ${courseId} já está na revisão ${revision} com este roteiro; nada gravado`);
    else {
      const saved = await saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId, origin: 'script', note: `Importado de ${path.basename(args.file)}${published ? ' (nova revisão sobre a versão publicada)' : ''}` });
      revision = saved.revision;
      console.log(`${tag} curso ${courseId} ${published ? `já publicado (v${existing.latestVersionNumber}): nova revisão` : 'atualizado'}: revisão ${draft.revision} → ${revision}`);
    }
  } else {
    const created = await createCourse(db, { workspaceId, title: doc.title, createdBy: userId, document: emptyCourseDocument(doc.title) });
    const saved = await saveDraft(db, { courseId: created.id, document: doc, expectedRevision: 1, userId, origin: 'script', note: `Importado de ${path.basename(args.file)}` });
    courseId = created.id;
    revision = saved.revision;
    console.log(`${tag} curso criado: ${courseId} (slug ${created.slug}, workspace ${workspaceId}), rascunho na revisão ${revision}`);
  }

  if (args.publish) {
    const latest = await getLatestVersion(db, courseId);
    if (latest && latest.sourceRevision === revision) console.log(`${tag} versão ${latest.versionNumber} já publicada desta revisão`);
    else {
      const pub = await publishCourse(db, { courseId, userId, expectedRevision: revision });
      console.log(`${tag} publicado: versão ${pub.versionNumber} (${pub.versionId}), ${pub.warnings.length} avisos`);
    }
  }
  if (args.enrollDemo) {
    const version = await getLatestVersion(db, courseId);
    if (!version) throw new Error('--enroll-demo exige curso publicado (use --publish)');
    const users = await db.select({ id: s.user.id, email: s.user.email }).from(s.user).where(inArray(s.user.email, [...DEMO_LEARNERS, 'admin@demo.local']));
    const admin = users.find((u) => u.email === 'admin@demo.local')?.id ?? userId;
    for (const email of DEMO_LEARNERS) {
      const u = users.find((x) => x.email === email);
      if (!u) {
        console.log(`${tag} ${email} não existe; sem matrícula`);
        continue;
      }
      const { enrollment, created } = await enrollStudent(db, { courseId, userId: u.id, createdBy: admin });
      console.log(`${tag} matrícula ${enrollment.id} (${email}) ${created ? 'criada' : 'já existia'} → versão ${version.versionNumber}`);
    }
  }
  return { document: doc as CourseDocument, courseId, revision };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const { db, close } = createDb(url, { max: 2 });
  try {
    await run(db, args);
  } finally {
    await close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
