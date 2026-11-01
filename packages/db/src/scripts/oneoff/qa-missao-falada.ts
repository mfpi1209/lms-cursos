/**
 * Robô de QA (31/10): volta a anunciar a MISSÃO por voz, com fala NOVA e plano NOVO na narração por planos.
 *   1) aberturas sem anúncio falado (C09·A2, C11·A2, C14·A6, C14·A9, C14·A11): plano `missao` (o mesmo id do plano que a
 *      revisão final tirou com `media.adjust.drop: ['missao']`), logo antes da chamada da pergunta;
 *   2) último vídeo longo de cada aula que "termina sem chamar a missão" (31 aulas dos 13 cursos do achado): plano `missao_fim`,
 *      no fim do vídeo (aula em que a pergunta vem antes da atividade: logo antes da chamada/situação, que continua sendo a última fala).
 *
 * Como o ajuste fino fica intacto: a narração por planos é `direction.shots[]` (a fala do nó = soma das linhas). Os cortes
 * (`media.adjust.cut`, `drop`, `baseLines`) são guardados por ID de plano, nunca por posição; este script só INSERE um plano
 * novo (id novo ou o `missao` já tirado), não muda a linha, a câmera nem a ordem dos planos existentes, não mexe em
 * `media.adjust`, e marca `media.stale = true` (é o que faz o orçamento incluir a cena). Antes de gravar, um diff confere que só
 * mudaram `direction.shots` (só plano inserido), `narration` (= soma dos planos) e `media.stale` dos nós-alvo. Para cada nó, o dry-run
 * simula `carryAdjust` (regravação) antes e depois, para provar que o ajuste carregado não encolhe.
 *
 * Coordenação: `--apply` só roda depois que existir docs/qa/lancamento/emendas.md (a remontagem das emendas reescreve `direction` a
 * partir do job de origem e apagaria o plano novo se rodasse depois). Em conflito de revisão, relê e tenta de novo.
 *   DATABASE_URL=… ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/qa-missao-falada.ts [--dry-run | --apply] [--so=C14,C09/aula_02] [--saida arq.json]
 */
import { existsSync, writeFileSync } from 'node:fs';
import { CourseDocumentSchema, SAFE_GESTURES, directionNarration, gestureKey, type CourseDocument, type Shot } from '@lms/course-schema';
import { createDb } from '../../client';
import { DomainError } from '../../errors';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { getJob } from '../../repositories/media';
import { carryAdjust, type AdjustState } from '../../../../media/src/adjust';
import { caminhosDiferentes } from './_rascunho-qa';

type Ancora = 'fim' | `antes:${string}`;

interface Item {
  cod: string;
  aula: string;
  no: string;
  /** `missao` = abertura (mesmo id do plano tirado na revisão final); `missao_fim` = fecho do último vídeo longo */
  shotId: 'missao' | 'missao_fim';
  ancora: Ancora;
  fala: string;
  /** título da atividade "Na prática" da aula (conferido no rascunho) */
  atividade: string;
  /** o que vem depois do vídeo, só para o relatório */
  depois: string;
}

const CURSOS: Record<string, string> = {
  C01: 'crs_99hpdsc8w88osiuh', C02: 'crs_arbeohlw3xp5v3zx', C03: 'crs_hd4jnnpx3oj0xf14', C04: 'crs_4z17p0m6d43qxmmo', C05: 'crs_4tj8a3q3g9gudgb7',
  C06: 'crs_b8zeh4b2gguseghq', C07: 'crs_bmf11akamtxoti28', C08: 'crs_8g0csi2hflfztfge', C09: 'crs_gjn468p3y6hwua4f', C10: 'crs_q52zsimeeahpa9bq',
  C11: 'crs_u4nfw88a4n2n0ubv', C12: 'crs_5vccpfypr6fmxojb', C13: 'crs_gujuaiykqcsl2n31', C14: 'crs_hvvgkvtd1rb2um0l',
};

const ITENS: Item[] = [
  // ---- 1) aberturas (5) ----
  { cod: 'C09', aula: 'aula_02', no: 'v02', shotId: 'missao', ancora: 'antes:chamada', fala: 'No fim desta aula, tem uma missão para você: avise sobre uma publicação.', atividade: 'Avise sobre uma publicação', depois: 'pergunta q03 → atividade m02' },
  { cod: 'C11', aula: 'aula_02', no: 'v02', shotId: 'missao', ancora: 'antes:chamada', fala: 'No fim desta aula, tem uma missão para você: esclareça uma diferença.', atividade: 'Esclareça uma diferença', depois: 'pergunta q03 → vídeo v03 → atividade m02' },
  { cod: 'C14', aula: 'aula_06', no: 'v11', shotId: 'missao', ancora: 'antes:chamada', fala: 'Daqui a pouco, você tem uma missão: escreva sua mensagem.', atividade: 'Escreva sua mensagem', depois: 'pergunta q11 → atividade m05 (no meio da aula) → pergunta q12' },
  { cod: 'C14', aula: 'aula_09', no: 'v16', shotId: 'missao', ancora: 'antes:chamada', fala: 'No fim desta aula, tem uma missão para você: prepare sua apresentação.', atividade: 'Prepare sua apresentação', depois: 'pergunta q17 → vídeo v17 → pergunta q18 → atividade m08' },
  { cod: 'C14', aula: 'aula_11', no: 'v20', shotId: 'missao', ancora: 'antes:chamada', fala: 'No fim desta aula, tem uma missão para você: escolha seu ponto a melhorar.', atividade: 'Escolha seu ponto a melhorar', depois: 'pergunta q21 → vídeo v21 → perguntas q22, q23 → atividade m10' },

  // ---- 2) último vídeo longo sem chamada da missão: atividade logo depois da vinheta (8) ----
  { cod: 'C01', aula: 'aula_02', no: 'v03', shotId: 'missao_fim', ancora: 'fim', fala: 'Agora é com você: a missão desta aula é avisar um imprevisto.', atividade: 'Avise um imprevisto', depois: 'vinheta → atividade m02' },
  { cod: 'C07', aula: 'aula_02', no: 'v03', shotId: 'missao_fim', ancora: 'fim', fala: 'A seguir, a sua missão: apresente uma diferença.', atividade: 'Apresente uma diferença', depois: 'vinheta → atividade m02' },
  { cod: 'C08', aula: 'aula_02', no: 'v03', shotId: 'missao_fim', ancora: 'fim', fala: 'Hora da missão: avise sobre um problema no espaço.', atividade: 'Avise sobre um problema no espaço', depois: 'vinheta → atividade m02' },
  { cod: 'C09', aula: 'aula_02', no: 'v03', shotId: 'missao_fim', ancora: 'fim', fala: 'Chegou a hora da missão: avise sobre uma publicação.', atividade: 'Avise sobre uma publicação', depois: 'vinheta → atividade m02' },
  { cod: 'C10', aula: 'aula_02', no: 'v03', shotId: 'missao_fim', ancora: 'fim', fala: 'Sua missão agora é alinhar a próxima atividade.', atividade: 'Alinhe a próxima atividade', depois: 'vinheta → atividade m02' },
  { cod: 'C13', aula: 'aula_03', no: 'v05', shotId: 'missao_fim', ancora: 'fim', fala: 'Vamos à missão desta aula: alinhe prioridades.', atividade: 'Alinhe prioridades', depois: 'vinheta → atividade m03' },
  { cod: 'C14', aula: 'aula_05', no: 'v10', shotId: 'missao_fim', ancora: 'fim', fala: 'É hora da missão: escreva o seu Sobre.', atividade: 'Escreva o seu “Sobre”', depois: 'vinheta → atividade m04' },
  { cod: 'C14', aula: 'aula_08', no: 'v15', shotId: 'missao_fim', ancora: 'fim', fala: 'Para fechar, a sua missão: defina seu papel na dinâmica.', atividade: 'Defina seu papel na dinâmica', depois: 'vinheta → atividade m07' },

  // ---- 2) último vídeo longo sem chamada da missão: pergunta(s) antes da atividade (22) ----
  { cod: 'C01', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'antes:s5', fala: 'Depois da próxima pergunta, vem a missão desta aula: confirme sua chegada.', atividade: 'Confirme sua chegada', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C03', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'Daqui a pouco, você tem uma missão: confirme o uso permitido.', atividade: 'Confirme o uso permitido', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C04', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'Mais adiante, tem uma missão para você: monte uma mensagem de trabalho.', atividade: 'Monte uma mensagem de trabalho', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C05', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'A missão desta aula vem logo depois da pergunta: confirme os horários.', atividade: 'Confirme os horários', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C06', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'antes:s6', fala: 'Mais adiante, a missão desta aula: respeite uma preferência.', atividade: 'Respeite uma preferência', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C07', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'Depois da pergunta, tem a missão: peça uma conversa.', atividade: 'Peça uma conversa', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C08', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'antes:s4', fala: 'Já deixo avisado: depois da próxima pergunta, sua missão é combinar o cuidado com o espaço.', atividade: 'Combine o cuidado com o espaço', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C09', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'Logo depois da pergunta, vem a sua missão: confirme antes de publicar.', atividade: 'Confirme antes de publicar', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C10', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'antes:s5', fala: 'Daqui a pouco, você faz a missão desta aula: comunique sua entrega.', atividade: 'Comunique sua entrega', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C11', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'antes:s5', fala: 'Mais adiante, tem uma missão para você: peça um exemplo.', atividade: 'Peça um exemplo', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C12', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'Depois da pergunta, sua missão é pedir uma correção concreta.', atividade: 'Peça uma correção concreta', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C13', aula: 'aula_01', no: 'v01', shotId: 'missao_fim', ancora: 'fim', fala: 'Depois da próxima pergunta, vem a missão: confirme uma tarefa.', atividade: 'Confirme uma tarefa', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C13', aula: 'aula_02', no: 'v03', shotId: 'missao_fim', ancora: 'fim', fala: 'Logo depois da pergunta, sua missão é preparar o seu pedido de ajuda.', atividade: 'Prepare seu pedido de ajuda', depois: 'vinheta → pergunta q04 → atividade m02' },
  { cod: 'C13', aula: 'aula_04', no: 'v07', shotId: 'missao_fim', ancora: 'fim', fala: 'Daqui a pouco, tem uma missão para você: comunique um problema.', atividade: 'Comunique um problema', depois: 'vinheta → pergunta q07 → atividade m04' },
  { cod: 'C13', aula: 'aula_05', no: 'v09', shotId: 'missao_fim', ancora: 'fim', fala: 'Mais adiante, a missão desta aula: combine sua melhoria.', atividade: 'Combine sua melhoria', depois: 'vinheta → pergunta q09 → atividade m05' },
  { cod: 'C14', aula: 'aula_01', no: 'v02', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'Depois da pergunta, tem a missão: conte sua primeira experiência.', atividade: 'Conte sua primeira experiência', depois: 'vinheta → pergunta q02 → atividade m01' },
  { cod: 'C14', aula: 'aula_02', no: 'v04', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'Mais adiante, a missão desta aula: escolha sua vaga-alvo.', atividade: 'Escolha sua vaga-alvo', depois: 'vinheta → pergunta q04 → atividade m02' },
  { cod: 'C14', aula: 'aula_04', no: 'v08', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'Logo depois da pergunta, vem a missão: escreva sua linha de currículo.', atividade: 'Escreva sua linha de currículo', depois: 'vinheta → pergunta q08 → atividade m03' },
  { cod: 'C14', aula: 'aula_07', no: 'v13', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'Depois da pergunta, falta pouco para a missão: monte seu plano para o teste.', atividade: 'Monte seu plano para o teste', depois: 'vinheta → pergunta q14 → atividade m06' },
  { cod: 'C14', aula: 'aula_09', no: 'v17', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'A missão desta aula chega logo depois da pergunta: prepare sua apresentação.', atividade: 'Prepare sua apresentação', depois: 'vinheta → pergunta q18 → atividade m08' },
  { cod: 'C14', aula: 'aula_10', no: 'v19', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'Mais adiante, tem uma missão esperando por você: conte sua história.', atividade: 'Conte sua história', depois: 'vinheta → pergunta q20 → atividade m09' },
  { cod: 'C14', aula: 'aula_11', no: 'v21', shotId: 'missao_fim', ancora: 'antes:chamada', fala: 'Depois das duas próximas perguntas, a missão: escolha seu ponto a melhorar.', atividade: 'Escolha seu ponto a melhorar', depois: 'vinheta → perguntas q22, q23 → atividade m10' },
];

/* C14·A6 (v11) é ao mesmo tempo a abertura e o último vídeo longo: o plano `missao` acima atende os dois achados. */

type Estado = 'aplicar' | 'ja-aplicado' | 'divergente' | 'nao-encontrado';
type NoLike = { id: string; type: string; title?: string; narration?: string; direction?: { shots: Shot[] }; media?: { assetId?: string; stale?: boolean; generatedFrom?: { jobId?: string }; adjust?: AdjustState & { baseLines?: Record<string, string> } } };

const chave = (it: Item) => `${it.cod}/${it.aula}/${it.no}`;

function achar(doc: CourseDocument, it: Item): { lesson: CourseDocument['modules'][number]['lessons'][number]; no: NoLike } | undefined {
  for (const m of doc.modules) for (const l of m.lessons) if (l.id === it.aula) {
    const no = l.graph.nodes.find((n) => n.id === it.no) as unknown as NoLike | undefined;
    return no ? { lesson: l, no } : undefined;
  }
  return undefined;
}

/** mesma chave que o orçamento usa para reaproveitar planos já pagos (apps/web/src/server/media.ts: shotReuseKey) */
const reuseKey = (s: { line: string; cameraId?: string | null; motionPrompt?: string | null; layout?: string | null }) => JSON.stringify([s.line.replace(/\s+/g, ' ').trim(), s.cameraId ?? '', s.motionPrompt?.trim() ?? '', s.layout ?? 'presenter']);
const palavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

const GESTOS = ['brings both hands together, focused', 'leans in slightly, curious', 'nods slowly, warm', 'smiles softly, welcoming', 'looks straight into the lens, serious'];
for (const g of GESTOS) if (!SAFE_GESTURES.some((s) => s.prompt === g)) throw new Error(`gesto fora da lista segura: ${g}`);

function novoPlano(it: Item, shots: Shot[], idxInsercao: number, base?: Shot): Shot {
  const prev = shots[idxInsercao - 1] ?? shots[idxInsercao]!;
  const next = shots[idxInsercao];
  const proibidos = new Set([gestureKey(prev.motionPrompt), gestureKey(next?.motionPrompt)]);
  const gesto = base?.motionPrompt ?? GESTOS.find((g) => !proibidos.has(gestureKey(g))) ?? GESTOS[0]!;
  const cameraId = base?.cameraId ?? prev.cameraId;
  return {
    id: it.shotId,
    line: it.fala,
    ...(cameraId ? { cameraId } : {}),
    framing: base?.framing ?? prev.framing,
    layout: 'presenter',
    cameraMove: 'static',
    motionPrompt: gesto,
    transitionIn: base?.transitionIn ?? 'cut',
  };
}

interface Registro {
  it: Item;
  estado: Estado;
  motivo?: string;
  indice?: number;
  plano?: Shot;
  antes?: { ids: string[]; narracao: string; stale: boolean | undefined };
  carry?: { antes: unknown; depois: unknown; igual: boolean };
  frescos?: { id: string; palavras: number }[];
  roboVeMissao?: boolean;
  revisaoAntes?: number;
  revisaoDepois?: number;
}

async function classificar(db: ReturnType<typeof createDb>['db'], doc: CourseDocument, it: Item): Promise<Registro> {
  const f = achar(doc, it);
  if (!f?.no.direction?.shots?.length) return { it, estado: 'nao-encontrado', motivo: 'nó sem direção' };
  const ativ = f.lesson.graph.nodes.find((n) => n.type === 'reflection');
  if (!ativ || (ativ.title ?? '') !== it.atividade) return { it, estado: 'divergente', motivo: `atividade da aula é "${ativ?.title}", esperado "${it.atividade}"` };
  const shots = f.no.direction.shots;
  const soma = directionNarration({ shots });
  if (soma.trim() !== (f.no.narration ?? '').trim()) return { it, estado: 'divergente', motivo: 'narração diferente da soma dos planos' };
  const existente = shots.find((s) => s.id === it.shotId);
  const antes = { ids: shots.map((s) => s.id), narracao: soma, stale: f.no.media?.stale };
  if (existente) return existente.line === it.fala ? { it, estado: 'ja-aplicado', antes } : { it, estado: 'divergente', motivo: `já há um plano ${it.shotId} com outra fala: "${existente.line}"`, antes };
  if (it.shotId === 'missao' && !f.no.media?.adjust?.drop?.includes('missao')) return { it, estado: 'divergente', motivo: 'esperava `media.adjust.drop` com `missao` (plano tirado na revisão final)', antes };
  let idx = shots.length;
  if (it.ancora !== 'fim') {
    const alvo = it.ancora.slice('antes:'.length);
    idx = shots.findIndex((s) => s.id === alvo);
    if (idx < 0) return { it, estado: 'divergente', motivo: `plano âncora "${alvo}" não está na direção`, antes };
  }
  if (shots.length >= 12) return { it, estado: 'divergente', motivo: 'a direção já tem 12 planos (limite)', antes };
  if (palavras(it.fala) < 4) return { it, estado: 'divergente', motivo: 'fala com menos de 4 palavras (o orçamento cobraria a cena inteira)', antes };

  // job de origem: para o gesto/câmera do plano `missao` original e para a simulação do orçamento e do ajuste carregado
  const jobId = f.no.media?.generatedFrom?.jobId;
  const job = jobId ? await getJob(db, jobId) : null;
  const baseShots = ((job?.input as { direction?: { shots?: Shot[] } } | undefined)?.direction?.shots ?? []) as Shot[];
  const original = it.shotId === 'missao' ? baseShots.find((s) => s.id === 'missao') : undefined;
  const plano = novoPlano(it, shots, idx, original);
  const depois = [...shots.slice(0, idx), plano, ...shots.slice(idx)];

  // ajuste carregado na regravação (carryAdjust): antes x depois
  const prevAdj = f.no.media?.adjust;
  let carry: Registro['carry'];
  if (prevAdj) {
    const st: AdjustState = { drop: prevAdj.drop ?? [], cut: prevAdj.cut ?? {}, ...(prevAdj.teaser !== undefined ? { teaser: prevAdj.teaser } : {}) };
    const a = carryAdjust(st, prevAdj.baseLines ?? null, shots);
    const d = carryAdjust(st, prevAdj.baseLines ?? null, depois);
    carry = { antes: a.request, depois: d.request, igual: JSON.stringify(a.request) === JSON.stringify(d.request) };
  }
  // planos que o orçamento cobraria (não batem com nenhum plano do job de origem): os do ajuste fino que já mudaram a fala + o novo
  const pool = new Map<string, number>();
  for (const s of baseShots) pool.set(reuseKey(s), (pool.get(reuseKey(s)) ?? 0) + 1);
  const frescos: { id: string; palavras: number }[] = [];
  for (const s of depois) {
    const k = reuseKey(s);
    const n = pool.get(k) ?? 0;
    if (n > 0) pool.set(k, n - 1);
    else frescos.push({ id: s.id, palavras: palavras(s.line) });
  }
  const narracao = directionNarration({ shots: depois });
  return { it, estado: 'aplicar', indice: idx, plano, antes, carry, frescos, roboVeMissao: /miss[aã]o/i.test(narracao.slice(-260)) };
}

function aplicarNo(doc: CourseDocument, r: Registro): void {
  const f = achar(doc, r.it)!;
  const shots = f.no.direction!.shots;
  shots.splice(r.indice!, 0, r.plano!);
  f.no.narration = directionNarration({ shots });
  if (f.no.media) f.no.media.stale = true;
}

/** nada além de direction.shots (plano inserido), narration e media.stale dos nós-alvo pode ter mudado */
function conferirDiff(original: CourseDocument, novo: CourseDocument, alvos: Registro[]): void {
  const a = structuredClone(original) as CourseDocument;
  const b = structuredClone(novo) as CourseDocument;
  for (const r of alvos) {
    const fa = achar(a, r.it)!.no;
    const fb = achar(b, r.it)!.no;
    const idsNovos = new Set([r.it.shotId]);
    const semNovo = fb.direction!.shots.filter((s) => !idsNovos.has(s.id));
    if (JSON.stringify(semNovo) !== JSON.stringify(fa.direction!.shots)) throw new Error(`${chave(r.it)}: os planos existentes mudaram (só inserir é permitido)`);
    if (fb.direction!.shots.length !== fa.direction!.shots.length + 1) throw new Error(`${chave(r.it)}: esperava exatamente 1 plano a mais`);
    fa.direction!.shots = fb.direction!.shots;
    fa.narration = fb.narration;
    if (fa.media && fb.media) fa.media.stale = fb.media.stale;
    if (fa.media && fb.media && JSON.stringify(fa.media.adjust) !== JSON.stringify(fb.media.adjust)) throw new Error(`${chave(r.it)}: media.adjust mudou`);
  }
  const fora = caminhosDiferentes(a as never, b as never);
  if (fora.length) throw new Error(`o diff tocou ${fora.length} caminho(s) fora do permitido (ex.: ${fora.slice(0, 3).join(', ')}); nada foi gravado`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('use --dry-run OU --apply, não os dois');
  const apply = args.includes('--apply');
  const iSaida = args.indexOf('--saida');
  const saida = iSaida >= 0 && args[iSaida + 1] ? args[iSaida + 1]! : 'docs/qa/lancamento/robo/correcoes-missao-falada.antes-depois.json';
  const so = (args.find((a) => a.startsWith('--so='))?.slice(5) ?? '').split(',').filter(Boolean);
  const itens = ITENS.filter((it) => !so.length || so.some((s) => chave(it).startsWith(s) || `${it.cod}/${it.aula}`.startsWith(s) || it.cod === s));
  if (apply && !existsSync('docs/qa/lancamento/emendas.md')) {
    throw new Error('docs/qa/lancamento/emendas.md ainda não existe: o outro agente (emendas) pode estar remontando estes vídeos e apagaria o plano novo. Nada foi gravado.');
  }

  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const log: Registro[] = [];
  try {
    const porCurso = new Map<string, Item[]>();
    for (const it of itens) porCurso.set(it.cod, [...(porCurso.get(it.cod) ?? []), it]);
    for (const [cod, lista] of porCurso) {
      const courseId = CURSOS[cod]!;
      for (let tentativa = 1; ; tentativa++) {
        const d = await getDraft(db, courseId);
        if (!d) throw new Error(`rascunho de ${courseId} não encontrado`);
        const original = d.document as CourseDocument;
        const doc = structuredClone(original) as CourseDocument;
        const regs: Registro[] = [];
        for (const it of lista) regs.push(await classificar(db, doc, it));
        const aAplicar = regs.filter((r) => r.estado === 'aplicar');
        // vários itens no mesmo nó não existem; mas dois itens na mesma aula (abertura e fecho) são nós diferentes
        for (const r of aAplicar) aplicarNo(doc, r);
        const parsed = CourseDocumentSchema.parse(doc);
        if (aAplicar.length) conferirDiff(original, parsed, aAplicar);
        if (tentativa === 1) {
          for (const r of regs) {
            const alvo = `${chave(r.it)} [${r.it.shotId}]`;
            if (r.estado === 'aplicar') console.log(`[missao-falada] ${alvo}: +1 plano na posição ${r.indice! + 1}/${(r.antes?.ids.length ?? 0) + 1} (${r.it.ancora}): "${r.it.fala}"${r.carry && !r.carry.igual ? ' ATENÇÃO: o ajuste carregado muda' : ''}${r.roboVeMissao === false ? ' ATENÇÃO: "missão" fora dos últimos 260 caracteres' : ''}`);
            else if (r.estado === 'ja-aplicado') console.log(`[missao-falada] ${alvo}: já aplicado`);
            else console.log(`[missao-falada] ATENÇÃO ${alvo}: ${r.estado} (${r.motivo}); não toquei`);
          }
        }
        if (!apply || !aAplicar.length) {
          for (const r of regs) log.push({ ...r, revisaoAntes: d.revision });
          break;
        }
        try {
          const salvo = await saveDraft(db, { courseId, document: parsed, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `QA do robô: missão falada (${aAplicar.length} plano(s) novo(s))` });
          console.log(`[missao-falada] ${cod}: ${aAplicar.length} plano(s); rascunho ${d.revision} → ${salvo.revision}`);
          for (const r of regs) log.push({ ...r, revisaoAntes: d.revision, revisaoDepois: salvo.revision });
          break;
        } catch (e) {
          if (e instanceof DomainError && e.code === 'CONFLICT' && tentativa < 8) {
            console.log(`[missao-falada] ${cod}: conflito de revisão (outro processo gravou), relendo (tentativa ${tentativa})`);
            await new Promise((res) => setTimeout(res, 700 * tentativa));
            continue;
          }
          throw e;
        }
      }
    }
    const resumo = {
      script: 'qa-missao-falada',
      modo: apply ? 'aplicado' : 'dry-run (nada gravado no banco)',
      geradoEm: new Date().toISOString(),
      total: log.length,
      aplicar: log.filter((l) => l.estado === 'aplicar').length,
      jaAplicado: log.filter((l) => l.estado === 'ja-aplicado').length,
      divergente: log.filter((l) => l.estado === 'divergente' || l.estado === 'nao-encontrado').length,
      ajusteCarregadoMudaria: log.filter((l) => l.carry && !l.carry.igual).map((l) => chave(l.it)),
    };
    writeFileSync(saida, JSON.stringify({ resumo, mudancas: log.map((l) => ({
      curso: l.it.cod, courseId: CURSOS[l.it.cod], aula: l.it.aula, no: l.it.no, plano: l.it.shotId, posicao: l.it.ancora, estado: l.estado, motivo: l.motivo ?? null,
      atividade: l.it.atividade, depois: l.it.depois, fala: l.it.fala,
      antes: l.antes ?? null, planoNovo: l.plano ?? null, indiceInsercao: l.indice ?? null,
      ajusteCarregado: l.carry ?? null, planosQueOrcamentoCobra: l.frescos ?? null, roboVeMissaoNosUltimos260: l.roboVeMissao ?? null,
      revisaoAntes: l.revisaoAntes ?? null, revisaoDepois: l.revisaoDepois ?? null,
    })) }, null, 1));
    console.log(`[missao-falada] ${resumo.modo}: ${resumo.aplicar} a aplicar/aplicados, ${resumo.jaAplicado} já aplicados, ${resumo.divergente} divergentes; ajuste carregado mudaria em ${resumo.ajusteCarregadoMudaria.length}. Antes/depois em ${saida}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(`[missao-falada] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
