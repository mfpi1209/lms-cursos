/**
 * Parte pura do script `refazer-tomadas` (testável sem banco nem provedor): argumentos, lista das tomadas de uma
 * cena e aplicação das variações (`direction.retake`) num rascunho.
 *
 * Tomada = grupo de planos consecutivos de apresentador na mesma câmera (`continuousTakeGroups`), um pedido ao HeyGen.
 * Identificação (`--tomadas aula_01/v09#s3,aula_02/v05#s1`):
 *   - `aula/cena#<id do plano>`: o id do 1º plano da tomada (o que o painel de pulsos imprime); um id de plano
 *     do meio da tomada também vale e refaz a tomada inteira;
 *   - `aula/cena#<n>` (só dígitos): o índice da tomada na cena, a partir de 1 (um plano com id numérico tem prioridade).
 */
import { allLessons, continuousTakeGroups, type CourseDocument, type Shot } from '@lms/course-schema';
import { estimateNarrationSeconds } from '@lms/media';

export interface TakeRef {
  lessonId: string;
  nodeId: string;
  /** id de plano ou índice (1-based) da tomada, como digitado */
  ref: string;
}

export interface Args {
  course: string;
  tomadas: TakeRef[];
  maxUsd: number;
  confirmar: boolean;
}

export function parseTakeRef(raw: string): TakeRef {
  const hash = raw.indexOf('#');
  const slash = raw.indexOf('/');
  if (hash < 0 || slash < 1 || slash > hash - 1) throw new Error(`tomada inválida "${raw}": use aula/cena#plano (ex.: aula_01/v09#s3) ou aula/cena#<índice>`);
  const lessonId = raw.slice(0, slash).trim();
  const nodeId = raw.slice(slash + 1, hash).trim();
  const ref = raw.slice(hash + 1).trim();
  if (!lessonId || !nodeId || !ref) throw new Error(`tomada inválida "${raw}": use aula/cena#plano (ex.: aula_01/v09#s3)`);
  return { lessonId, nodeId, ref };
}

export function parseArgs(argv: string[]): Args {
  let course = '';
  let max = NaN;
  let confirmar = false;
  let seco = false;
  let tomadas: TakeRef[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--course') course = argv[++i] ?? '';
    else if (a === '--max-usd') max = Number(argv[++i]);
    else if (a === '--confirmar') confirmar = true;
    else if (a === '--seco') seco = true;
    else if (a === '--tomadas') {
      const seen = new Set<string>();
      tomadas = (argv[++i] ?? '').split(',').map((x) => x.trim()).filter(Boolean).map(parseTakeRef).filter((t) => {
        const k = `${t.lessonId}/${t.nodeId}#${t.ref}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    } else throw new Error(`argumento desconhecido: ${a}`);
  }
  if (seco && confirmar) throw new Error('use --seco OU --confirmar, não os dois');
  if (!course) throw new Error('--course <id> é obrigatório');
  if (!tomadas.length) throw new Error('--tomadas é obrigatório (ex.: aula_01/v09#s3,aula_02/v05#s1)');
  if (!Number.isFinite(max) || max <= 0) throw new Error('--max-usd <n> é obrigatório (número > 0)');
  return { course, tomadas, maxUsd: max, confirmar };
}

export interface TakeInfo {
  /** 1-based, na ordem da cena */
  index: number;
  firstShotId: string;
  shotIds: string[];
  cameraId: string | undefined;
  script: string;
  seconds: number;
}

/** Tomadas da cena, na ordem (mesma regra do worker antes da fusão de planos curtos). */
export function takesOf(shots: readonly Pick<Shot, 'id' | 'line' | 'cameraId' | 'layout' | 'slide'>[], hasNarrationAudio: boolean): TakeInfo[] {
  const groups = continuousTakeGroups(shots, { hasNarrationAudio });
  return groups.map((g, i) => {
    const script = g.map((k) => shots[k]!.line.trim()).join(' ');
    return { index: i + 1, firstShotId: shots[g[0]!]!.id, shotIds: g.map((k) => shots[k]!.id), cameraId: shots[g[0]!]!.cameraId, script, seconds: estimateNarrationSeconds(script) };
  });
}

/** Só as tomadas com apresentador (cena em movimento e plano de slide/cartão não são refeitos por aqui). */
export function isPresenterTake(shots: readonly Pick<Shot, 'id' | 'layout' | 'slide'>[], t: TakeInfo, hasNarrationAudio: boolean): boolean {
  const first = shots.find((s) => s.id === t.firstShotId)!;
  if (first.layout === 'cinematic') return false;
  if (!hasNarrationAudio) return true;
  return !((first.layout === 'slide' || first.layout === 'card') && first.slide);
}

export function findTake(takes: readonly TakeInfo[], ref: string): TakeInfo | undefined {
  const byShot = takes.find((t) => t.shotIds.includes(ref));
  if (byShot) return byShot;
  if (/^\d+$/.test(ref)) return takes.find((t) => t.index === Number(ref));
  return undefined;
}

export interface AppliedRetake extends TakeInfo {
  lessonId: string;
  nodeId: string;
  from: number;
  to: number;
}

/**
 * Incrementa a variação das tomadas pedidas num CLONE do documento. Erra (nada aplicado) se a aula, a cena, a
 * direção ou a tomada não existirem. A mesma tomada citada duas vezes (pelo id e pelo índice) conta uma vez.
 */
export function applyRetakes(doc: CourseDocument, refs: readonly TakeRef[]): { doc: CourseDocument; applied: AppliedRetake[]; scenes: Array<{ lessonId: string; nodeId: string }> } {
  const next = structuredClone(doc);
  const hasNarrationAudio = (next.presentation.voiceProvider ?? 'heygen') === 'elevenlabs';
  const applied: AppliedRetake[] = [];
  const done = new Set<string>();
  for (const r of refs) {
    const lesson = allLessons(next).find((l) => l.id === r.lessonId);
    if (!lesson) throw new Error(`aula "${r.lessonId}" não existe (tomada ${r.lessonId}/${r.nodeId}#${r.ref})`);
    const node = lesson.graph.nodes.find((n) => n.id === r.nodeId) as { direction?: { shots: Shot[]; retake?: Record<string, number> } } | undefined;
    if (!node) throw new Error(`cena "${r.lessonId}/${r.nodeId}" não existe`);
    const shots = node.direction?.shots;
    if (!shots?.length) throw new Error(`a cena ${r.lessonId}/${r.nodeId} não tem direção (planos); não há tomadas`);
    const takes = takesOf(shots, hasNarrationAudio);
    const take = findTake(takes, r.ref);
    if (!take) throw new Error(`tomada "${r.ref}" não existe em ${r.lessonId}/${r.nodeId} (tomadas: ${takes.map((t) => `${t.index}=${t.firstShotId}`).join(', ')})`);
    if (!isPresenterTake(shots, take, hasNarrationAudio)) throw new Error(`a tomada ${r.lessonId}/${r.nodeId}#${take.firstShotId} não é clipe de apresentador (cena em movimento ou slide/cartão); nada a refazer`);
    const key = `${r.lessonId}/${r.nodeId}#${take.firstShotId}`;
    if (done.has(key)) continue;
    done.add(key);
    const retake = { ...(node.direction!.retake ?? {}) };
    // variação anterior da tomada (a maior entre os ids dos planos dela, igual ao hash)
    const from = Math.max(0, ...take.shotIds.map((id) => retake[id] ?? 0));
    for (const id of take.shotIds) delete retake[id];
    retake[take.firstShotId] = from + 1;
    node.direction!.retake = retake;
    applied.push({ ...take, lessonId: r.lessonId, nodeId: r.nodeId, from, to: from + 1 });
  }
  const scenes: Array<{ lessonId: string; nodeId: string }> = [];
  for (const a of applied) if (!scenes.some((s) => s.lessonId === a.lessonId && s.nodeId === a.nodeId)) scenes.push({ lessonId: a.lessonId, nodeId: a.nodeId });
  return { doc: next, applied, scenes };
}
