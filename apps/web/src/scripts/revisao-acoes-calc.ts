/**
 * Parte pura do `revisao-acoes` (testável sem banco): argumentos, localização da seção/linha nos arquivos de roteiro
 * (`*.telas.md`, `*.topicos.md`, roteiro `.md`) e o agrupamento das marcas abertas em ações.
 */
import { courseStem, findScreenSection, findScriptScene, findTopicSection, sectionLines, type SpecFile, type SpecHit } from '@/lib/video-review/specs';
import type { BriefInput } from '@/lib/video-review/brief';
import { RETAKE_CATEGORIES, categoryLabel, fmtTime, type MarkResolution, type ReviewCategory, type SceneReviewContext } from '@/lib/video-review/resolve';

export interface Args {
  course: string;
  aula?: string;
  json: boolean;
  /** um prompt consolidado por grupo (arquivo de telas, tomadas, tópicos, fala, emendas, outros) */
  prompts: boolean;
  /** marcas aguardando correção/aprovação: o que o operador tem de executar */
  pendentes: boolean;
  /** o operador executou o conserto destas marcas: "aguardando correção" → "em reprocessamento" */
  executada: string[];
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { course: '', json: false, prompts: false, pendentes: false, executada: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (k === '--course') a.course = argv[++i] ?? '';
    else if (k === '--aula') a.aula = argv[++i] ?? '';
    else if (k === '--json') a.json = true;
    else if (k === '--prompts') a.prompts = true;
    else if (k === '--pendentes') a.pendentes = true;
    else if (k === '--executada') a.executada = (argv[++i] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    else throw new Error(`argumento desconhecido: ${k}`);
  }
  if (!a.course) throw new Error('uso: revisao-acoes.ts --course <id> [--aula <lessonId>] [--json] [--prompts | --pendentes | --executada vrm_a,vrm_b]');
  if (a.aula === '') throw new Error('--aula precisa do id da aula (ex.: aula_01)');
  if ([a.prompts, a.pendentes, a.executada.length > 0].filter(Boolean).length > 1) throw new Error('use só um de --prompts, --pendentes, --executada');
  if (argv.includes('--executada') && !a.executada.length) throw new Error('--executada precisa dos ids das marcas (ex.: vrm_abc,vrm_def)');
  return a;
}

export interface BriefGroup {
  key: string;
  title: string;
  items: BriefInput[];
}

const GROUP_ORDER = ['screen', 'retake', 'topics', 'speech', 'cut', 'remount', 'scene', 'other'];

/** Agrupa os prompts: telas por arquivo, tomadas numa lista só, tópicos por arquivo, fala, emendas, remontagens, outros. */
export function groupBriefs(items: readonly BriefInput[]): BriefGroup[] {
  const groups = new Map<string, BriefGroup>();
  for (const it of items) {
    const t = it.plan?.target ?? 'other';
    const file = it.spec?.file;
    const key = t === 'screen' || t === 'topics' ? `${t}:${file ?? '?'}` : t;
    const title =
      t === 'screen' ? `Correções de tela simulada — ${file ?? 'arquivo de telas não achado'}`
      : t === 'topics' ? `Correções do painel de tópicos — ${file ?? 'arquivo de tópicos não achado'}`
      : t === 'retake' ? 'Tomadas a refazer (gasto: só com aprovação)'
      : t === 'speech' ? 'Correções de fala e legenda'
      : t === 'cut' ? 'Emendas e cortes'
      : t === 'remount' || t === 'scene' ? 'Remontagens (o rascunho já mudou)'
      : 'Outros (decisão manual)';
    const g = groups.get(key) ?? { key, title, items: [] };
    g.items.push(it);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => GROUP_ORDER.indexOf(a.key.split(':')[0]!) - GROUP_ORDER.indexOf(b.key.split(':')[0]!) || a.key.localeCompare(b.key));
}

export interface PlannedMark {
  id: string;
  lessonId: string;
  nodeId: string;
  sceneTimeSec: number;
  category: ReviewCategory;
  note: string;
  expected: string | null;
  resolution: MarkResolution | null;
  stale: boolean;
  scene?: SceneReviewContext;
}

export interface ActionItem {
  markIds: string[];
  where: string;
  what: string;
  /** arquivo:linha a editar (quando há) */
  file?: string;
  suggestion?: string;
  marks: Array<{ id: string; at: string; category: string; note: string; expected: string | null }>;
}

export interface ActionPlan {
  course: string;
  marks: number;
  retakes: { tomadas: string[]; items: ActionItem[] };
  cuts: ActionItem[];
  screens: ActionItem[];
  topics: ActionItem[];
  speech: ActionItem[];
  others: ActionItem[];
}

const markRef = (m: PlannedMark) => ({ id: m.id, at: `${m.lessonId}/${m.nodeId} ${fmtTime(m.sceneTimeSec)}`, category: categoryLabel(m.category), note: m.note, expected: m.expected });
const loc = (h: SpecHit | { file: string; line: number } | undefined, itemLine?: number) => (h ? `${h.file}:${itemLine ?? h.line}` : undefined);
const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').trim();
/** o trecho sugerido é o mesmo `(na fala: …)` que já está no arquivo (um começa com o outro) */
const sameCue = (fromHere: string, cue: string | undefined) => !!cue && (fold(fromHere).startsWith(fold(cue)) || fold(cue).startsWith(fold(fromHere)));
const said = (r: MarkResolution) => (r.speech ? `“${r.speech.cue}”` : '(sem legenda)');

/**
 * Agrupa as marcas abertas em ações. `telas`/`topicos`/`roteiros` = conteúdo dos arquivos de `docs/roteiros`; `stem` = nome
 * do roteiro do curso (ex.: `c1-ia-na-pratica`), para achar a cena certa no roteiro (todo curso tem um V07).
 */
export function buildActionPlan(course: string, marks: readonly PlannedMark[], specs: { telas: SpecFile[]; topicos: SpecFile[]; roteiros: SpecFile[]; stem?: string }): ActionPlan {
  const plan: ActionPlan = { course, marks: marks.length, retakes: { tomadas: [], items: [] }, cuts: [], screens: [], topics: [], speech: [], others: [] };
  const byTake = new Map<string, ActionItem>();
  for (const m of marks) {
    const r = m.resolution;
    const ref = markRef(m);
    const staleNote = m.stale ? ' [vídeo da cena mudou depois da marca: confira se ainda vale]' : '';
    if (!r) {
      plan.others.push({ markIds: [m.id], where: `${m.lessonId}/${m.nodeId} ${fmtTime(m.sceneTimeSec)}`, what: `cena não encontrada no rascunho${staleNote}`, marks: [ref] });
      continue;
    }
    const where = `${m.lessonId}/${m.nodeId} ${fmtTime(m.sceneTimeSec)} (${r.sceneTitle})`;
    const sceneCode = m.nodeId.toUpperCase();
    const cat = m.category;

    if (RETAKE_CATEGORIES.includes(cat) && r.take) {
      if (r.take.retakeable) {
        const item = byTake.get(r.take.id) ?? { markIds: [], where: `${r.take.id} (tomada ${r.take.index}/${r.take.total}, câmera ${r.take.cameraId ?? 'principal'}, ${fmtTime(r.take.start)}–${fmtTime(r.take.end)}${r.take.variation ? `, variação atual ${r.take.variation}` : ''})`, what: 'refazer a tomada do apresentador', marks: [] };
        item.markIds.push(m.id);
        item.marks.push(ref);
        if (staleNote) item.what += staleNote;
        byTake.set(r.take.id, item);
      } else {
        plan.others.push({ markIds: [m.id], where, what: `${categoryLabel(cat)}: ${r.take.why ?? 'não dá para refazer só a tomada'}${r.take.firstShotId === 'unico' ? ` — gerar a cena inteira: tsx src/scripts/gerar-curso.ts --course ${course} --cenas ${m.nodeId} --max-usd <n> (a seco)` : ''}${staleNote}`, marks: [ref] });
      }
      continue;
    }

    if (cat === 'cut') {
      const c = r.shot?.nearestCut;
      const at = r.edge ? `${r.edge}` : c && Math.abs(c.deltaSec) <= 2 ? `corte ${c.from}→${c.to}${c.cameraChange ? ' (troca de câmera)' : ''} em ${fmtTime(c.at)} (marca ${c.deltaSec >= 0 ? '+' : ''}${c.deltaSec.toFixed(1)} s)` : r.shot ? `dentro do plano ${r.shot.id} (${fmtTime(r.shot.start)}–${fmtTime(r.shot.end)})` : 'emenda';
      plan.cuts.push({
        markIds: [m.id],
        where,
        what: `${at}${r.take ? ` · tomada ${r.take.id}` : r.screen ? ` · tela ${r.screen.section}` : ''}${staleNote}`,
        suggestion: r.edge === 'início da cena' ? 'começo da cena: conferir o aparo do início no ajuste fino (frase/palavras iniciais) e remontar (sem custo)' : r.take?.retakeable ? `ajuste fino/remontar a cena (sem custo); se o defeito é do clipe, refazer ${r.take.id}` : 'remontar a cena (sem custo) e conferir',
        marks: [ref],
      });
      continue;
    }

    if ((cat === 'screen' || cat === 'sync') && r.screen) {
      const st = r.screen.step ?? r.screen.nextStep;
      const rec = m.scene?.screens?.[r.screen.recordingIndex - 1];
      const hit = findScreenSection(specs.telas, r.screen.fileName, m.nodeId, rec?.mock, st?.index);
      const fromHere = r.speech?.fromHere;
      plan.screens.push({
        markIds: [m.id],
        where,
        what: `seção ${hit?.section ?? r.screen.section}${st ? `, passo ${st.index}/${r.screen.totalSteps} (${fmtTime(st.start)}): ${st.line}` : ''}${hit && !hit.matchesDraft ? ' [o arquivo difere do rascunho: aplique com aplicar-telas depois]' : ''}${staleNote}`,
        ...(loc(hit, hit?.itemLine) ? { file: loc(hit, hit?.itemLine)! } : {}),
        ...(cat === 'sync' && fromHere ? { suggestion: sameCue(fromHere, st?.cue) ? `o passo já entra neste trecho (na fala: "${st!.cue}"): se aparece fora de hora, remontar a cena (sem custo) e conferir com o qa-telas` : `entrar quando a fala diz ${said(r)}: use (na fala: "${fromHere}")${st?.cue ? ` no lugar de (na fala: "${st.cue}")` : ''}` } : m.expected ? { suggestion: `deveria: ${m.expected}` } : {}),
        marks: [ref],
      });
      continue;
    }

    if ((cat === 'topics' || cat === 'sync') && r.topic) {
      const idx = r.topic.index ?? r.topic.next?.index;
      const hit = findTopicSection(specs.topicos, m.nodeId, m.scene?.topics ?? null, idx ?? undefined);
      const fromHere = r.speech?.fromHere;
      plan.topics.push({
        markIds: [m.id],
        where,
        what: `${sceneCode}${r.topic.index ? `, tópico ${r.topic.index}/${r.topic.total} “${r.topic.text}”${r.topic.start !== undefined ? ` (aceso em ${fmtTime(r.topic.start)})` : ''}` : r.topic.next ? `, antes do tópico ${r.topic.next.index} “${r.topic.next.text}” (${fmtTime(r.topic.next.start)})` : ''}${hit && !hit.matchesDraft ? ' [o arquivo difere do rascunho: aplique com aplicar-topicos depois]' : ''}${staleNote}`,
        ...(loc(hit, hit?.itemLine) ? { file: loc(hit, hit?.itemLine)! } : {}),
        ...(cat === 'sync' && fromHere ? { suggestion: sameCue(fromHere, r.topic.cue) ? `o tópico já acende neste trecho (na fala: "${r.topic.cue}"): se aparece fora de hora, remontar a cena (sem custo)` : `acender quando a fala diz ${said(r)}: use (na fala: "${fromHere}")${r.topic.cue ? ` no lugar de (na fala: "${r.topic.cue}")` : ''}` } : m.expected ? { suggestion: `deveria: ${m.expected}` } : {}),
        marks: [ref],
      });
      continue;
    }

    if (cat === 'speech') {
      const hit = findScriptScene(specs.roteiros, m.nodeId, specs.stem);
      plan.speech.push({
        markIds: [m.id],
        where,
        what: `fala ${said(r)}${r.speech?.word ? ` (palavra “${r.speech.word}”)` : ''}${r.shot ? ` · plano ${r.shot.id}: “${r.shot.line.slice(0, 160)}${r.shot.line.length > 160 ? '…' : ''}”` : ''}${staleNote}`,
        ...(loc(hit) ? { file: loc(hit)! } : {}),
        ...(m.expected ? { suggestion: `deveria: ${m.expected} (mudar a fala regrava a cena: custo)` } : { suggestion: 'legenda errada com a fala certa: corrigir só a legenda; fala errada: editar o roteiro e regravar a cena (custo)' }),
        marks: [ref],
      });
      continue;
    }

    const bits = [r.take ? `tomada ${r.take.id}` : '', r.shot ? `plano ${r.shot.id}${r.shot.slide ? ` (cartão “${r.shot.slide.title}”)` : ''}` : '', r.screen ? `tela ${r.screen.section}` : '', r.topic?.text ? `tópico “${r.topic.text}”` : '', r.speech ? `fala ${said(r)}` : ''].filter(Boolean);
    plan.others.push({ markIds: [m.id], where, what: `${categoryLabel(cat)}: ${bits.join(' · ')}${staleNote}`, ...(m.expected ? { suggestion: `deveria: ${m.expected}` } : {}), marks: [ref] });
  }
  plan.retakes.items = [...byTake.values()];
  plan.retakes.tomadas = [...byTake.keys()];
  return plan;
}

export { courseStem, findScreenSection, findScriptScene, findTopicSection, sectionLines, type SpecFile, type SpecHit };
