/**
 * Prompt de correção de uma marca (função pura): um texto fechado em pt-BR que um agente executa sem interpretar.
 * Seções fixas: Corrigir / Problema / Esperado / Onde / Fala naquele trecho / Estado atual / Regras / Como conferir.
 * O servidor junta os insumos (resolução, legenda, trecho atual do arquivo de roteiro, plano de conserto); aqui só se
 * monta o texto. `renderGroupBrief` junta vários (um arquivo de telas, as tomadas…) com as regras uma vez só.
 */
import type { FixPlan } from './fix';
import { categoryLabel, fmtTime, type MarkResolution, type ReviewCategory } from './resolve';

export interface BriefSpec {
  kind: 'screen' | 'topics' | 'speech';
  file: string;
  /** linha do cabeçalho da seção e do item (passo/tópico), 1-based */
  line: number;
  itemLine?: number;
  section: string;
  /** linhas atuais da seção, como estão no arquivo */
  current: string[];
  /** a seção do arquivo é igual ao que está no rascunho */
  matchesDraft: boolean;
}

export interface BriefInput {
  course: { id: string; title: string };
  mark: { id: string; lessonId: string; nodeId: string; sceneTimeSec: number; category: ReviewCategory; note: string; expected: string | null };
  resolution: MarkResolution | null;
  /** o vídeo da cena mudou depois da marca (a resolução é o retrato da hora da marca) */
  stale: boolean;
  /** fala de t-3 s a t+3 s */
  speech: { from: number; to: number; text: string } | null;
  spec: BriefSpec | null;
  /** tópicos atuais da cena no rascunho (quando há painel) */
  topics: Array<{ text: string; cue?: string }> | null;
  plan: FixPlan | null;
  /** caminho do vídeo para conferir no estúdio */
  studioUrl: string;
}

export interface BriefSection {
  title: string;
  body: string;
}

const W = './apps/worker/node_modules/.bin/tsx';

/** Nota vaga: sem "deveria ficar" ou com nota curta demais para agir. */
export function isVagueMark(m: { note: string; expected: string | null }): boolean {
  return !m.expected?.trim() || m.note.trim().length < 8;
}

function where(i: BriefInput): string {
  const r = i.resolution;
  const out: string[] = [];
  if (i.spec) out.push(`${i.spec.file}:${i.spec.itemLine ?? i.spec.line} — seção \`${i.spec.section}\`${i.spec.matchesDraft ? '' : ' (ATENÇÃO: o arquivo difere do rascunho; confira antes de editar)'}`);
  if (r?.screen) {
    const st = r.screen.step ?? r.screen.nextStep;
    out.push(`tela ${r.screen.recordingIndex}/${r.screen.total} \`${r.screen.section}\` (${fmtTime(r.screen.start)}–${fmtTime(r.screen.end)} no vídeo da cena)${st ? `; ${r.screen.step ? 'passo' : 'antes do passo'} ${st.index}/${r.screen.totalSteps} em ${fmtTime(st.start)}: ${st.line}` : ''}`);
  }
  if (r?.topic) out.push(r.topic.index ? `painel: tópico ${r.topic.index}/${r.topic.total} "${r.topic.text}" (aceso em ${fmtTime(r.topic.start ?? 0)})` : `painel: nenhum tópico aceso ainda${r.topic.next ? `; o próximo é o ${r.topic.next.index} "${r.topic.next.text}" em ${fmtTime(r.topic.next.start)}` : ''}`);
  if (r?.take) out.push(`tomada \`${r.take.id}\` (${r.take.index}/${r.take.total}, câmera ${r.take.cameraId ?? 'principal'}${r.take.cameraZone ? `, ${r.take.cameraZone}` : ''}, ${fmtTime(r.take.start)}–${fmtTime(r.take.end)})${r.take.retakeable ? '' : ` — ${r.take.why}`}`);
  if (r?.shot) out.push(`plano ${r.shot.id} (${r.shot.index}/${r.shot.total}, ${r.shot.layout}, ${fmtTime(r.shot.start)}–${fmtTime(r.shot.end)})${r.shot.nearestCut && Math.abs(r.shot.nearestCut.deltaSec) <= 2 ? `; corte ${r.shot.nearestCut.from}→${r.shot.nearestCut.to}${r.shot.nearestCut.cameraChange ? ' (troca de câmera)' : ''} em ${fmtTime(r.shot.nearestCut.at)}` : ''}`);
  if (r?.edge) out.push(r.edge);
  return out.length ? out.map((l) => `- ${l}`).join('\n') : '- (sem resolução: a cena não está mais no rascunho)';
}

function currentState(i: BriefInput): string {
  const parts: string[] = [];
  if (i.spec) parts.push(`Trecho atual de ${i.spec.file} (a partir da linha ${i.spec.line}):\n\`\`\`\n${i.spec.current.join('\n')}\n\`\`\``);
  if (i.topics?.length && i.spec?.kind !== 'topics') parts.push(`Tópicos atuais da cena no rascunho:\n${i.topics.map((t, k) => `${k + 1}. ${t.text}${t.cue ? ` (na fala: "${t.cue}")` : ''}`).join('\n')}`);
  if (i.resolution?.shot && !i.spec) parts.push(`Fala do plano ${i.resolution.shot.id}: "${i.resolution.shot.line}"`);
  return parts.join('\n\n') || 'Nada a mostrar além do vídeo (ver Onde).';
}

const BRAND_RULE = 'Telas genéricas: sem logotipo, nome ou identidade visual de marca real (o nome do serviço só como texto quando a aula ensina aquele serviço) e nenhum dado pessoal real.';
const COST_RULE = 'Custo: edição de tela/tópicos + remontagem é US$ 0; se o comando a seco mostrar qualquer valor acima de US$ 0 para a cena, PARE e peça aprovação. Nunca rode `--confirmar` de gasto sem aprovação explícita do valor.';

export function rulesFor(i: Pick<BriefInput, 'mark' | 'resolution' | 'spec' | 'plan'>): string[] {
  const t = i.plan?.target;
  const r = i.resolution;
  if (t === 'screen') {
    return [
      `Edite SÓ a seção \`## ${i.spec?.section ?? r?.screen?.section}\` de ${i.spec?.file ?? 'docs/roteiros/telas/<roteiro>.telas.md'}; não mexa em outras seções, outros arquivos nem no roteiro falado.`,
      'Todo `(na fala: "…")` tem de ser um trecho LITERAL da fala da cena (copie da legenda, mesmas palavras e acentos), que aparece UMA vez na fala; os passos seguem a ordem da fala (o trecho de cada passo vem depois do trecho do anterior).',
      'Limites (packages/course-schema/src/screen-mock.ts): 1 a 40 passos por tela; digita ≤ 600 caracteres; balão ≤ 1500; mostra: título ≤ 160 e até 12 linhas de ≤ 400; liga/desliga/toca ≤ 120; célula no formato B2 com valor ≤ 200; evento: título ≤ 120; destaca ≤ 300; trecho da fala ≤ 200; peso entre 0 e 10. No `Modelo: comparar` todo passo leva [esq] ou [dir].',
      'Não repita no `usuário:` o texto de um `digita:` (o digitado já vira o balão).',
      BRAND_RULE,
      COST_RULE,
    ];
  }
  if (t === 'topics') {
    return [
      `Edite SÓ a seção \`## ${i.mark.nodeId.toUpperCase()}\` de ${i.spec?.file ?? 'docs/roteiros/telas/<roteiro>.topicos.md'}; não mexa em outras cenas.`,
      'Cada `(na fala: "…")` é um trecho LITERAL da fala da cena, que aparece uma vez, e os tópicos seguem a ordem da fala.',
      'Tópico com até 60 caracteres; no máximo 8 tópicos por cena (o painel mostra 6, em páginas de 3).',
      COST_RULE,
    ];
  }
  if (t === 'retake') {
    return [
      'Não edite roteiro, direção nem arquivos de telas: o defeito é do clipe do apresentador.',
      'Rode primeiro o comando A SECO e confira que só a tomada pedida será refeita (as demais da cena reaproveitadas, custo 0).',
      `Só rode o \`--confirmar\` depois de aprovação explícita de US$ ${(i.plan?.usd ?? 0).toFixed(2)} (com ALLOW_PAID_PROVIDERS=1 só no terminal do operador). Se a cotação passar disso, pare.`,
    ];
  }
  if (t === 'remount') return ['O rascunho já tem a correção: só remonte a cena.', COST_RULE];
  if (t === 'scene') return ['Regravar a cena tem custo: só com aprovação explícita do valor.', COST_RULE];
  if (t === 'speech') {
    return [
      `Mude só a fala da cena ${i.mark.nodeId.toUpperCase()}${i.spec ? ` (${i.spec.file}:${i.spec.line})` : ''}; a direção (planos) precisa continuar com as mesmas palavras da fala, na ordem.`,
      'Se a fala está certa e só a legenda errou, corrija só a legenda (sem custo).',
      'Mudar a fala regrava a cena (custo): peça aprovação do valor antes de gerar.',
    ];
  }
  if (t === 'cut') return ['Prefira o ajuste fino da emenda (tirar/aparar frase do plano, remontar: sem custo).', 'Refazer a tomada só com aprovação explícita do valor.'];
  return ['Decisão manual: descreva o conserto escolhido antes de executar; nada pago sem aprovação.'];
}

function howToCheck(i: BriefInput): string {
  const r = i.resolution;
  const t = i.mark.sceneTimeSec;
  const win = `${fmtTime(Math.max(0, t - 3))}–${fmtTime(t + 3)}`;
  const out: string[] = [];
  const node = i.mark.nodeId;
  if (i.plan?.target === 'screen' || r?.screen) out.push(`${W} apps/worker/src/scripts/qa-telas.ts --course ${i.course.id} --cenas ${node} --out /tmp/qa-${node} — abra /tmp/qa-${node}/index.html e confira os quadros de ${win}: o passo aparece quando a fala chega nele?`);
  if (i.plan?.target === 'retake' || i.plan?.target === 'cut' || (r?.take && !r.screen)) out.push(`${W} apps/worker/src/scripts/painel-pulsos.ts --course ${i.course.id} --cenas ${node} --out /tmp/pulsos-${node} — linha ${r?.take?.id ?? node} em /tmp/pulsos-${node}/index.html (mãos/pulsos da tomada).`);
  if (i.plan?.commands.dryRun) out.push(`Cotação a seco (não grava nada): ${i.plan.commands.dryRun}`);
  out.push(`No estúdio: ${i.studioUrl} — cena ${node} em ${fmtTime(t)} (janela ${win}); quando o vídeo novo chegar a marca fica "pronta para conferir": clique em Conferir e depois Resolvida ou Ainda errado.`);
  return out.map((l) => `- ${l}`).join('\n');
}

export function briefSections(i: BriefInput): BriefSection[] {
  const r = i.resolution;
  const sections: BriefSection[] = [
    { title: 'Corrigir', body: `${i.course.title} (${i.course.id}) · ${i.mark.lessonId}/${i.mark.nodeId}${r ? ` "${r.sceneTitle}"` : ''} · ${fmtTime(i.mark.sceneTimeSec)} · ${categoryLabel(i.mark.category)} · marca ${i.mark.id}${i.stale ? '\nATENÇÃO: o vídeo da cena mudou depois da marca; confira se o problema ainda existe antes de mexer.' : ''}` },
    { title: 'Problema', body: i.mark.note.trim() || '(sem nota)' },
    { title: 'Esperado', body: i.mark.expected?.trim() || `(não informado — nota vaga: confirme com quem marcou antes de mudar o conteúdo${i.plan?.target === 'retake' ? '; para refazer a tomada basta o defeito descrito' : ''})` },
    { title: 'Onde', body: where(i) },
    { title: 'Fala naquele trecho', body: i.speech?.text ? `${fmtTime(i.speech.from)}–${fmtTime(i.speech.to)}: "${i.speech.text}"` : '(cena sem legenda)' },
    { title: 'Estado atual', body: currentState(i) },
    { title: 'Regras', body: rulesFor(i).map((x) => `- ${x}`).join('\n') },
    { title: 'Como conferir', body: [...(i.plan?.commands.apply?.length ? [`Aplicar no rascunho e remontar (nesta ordem):\n${i.plan.commands.apply.map((c) => `  ${c}`).join('\n')}`] : []), howToCheck(i)].join('\n') },
  ];
  return sections;
}

export function renderBrief(sections: readonly BriefSection[]): string {
  return sections.map((s) => `## ${s.title}\n${s.body}`).join('\n\n');
}

export function buildBrief(i: BriefInput): string {
  return `# Correção de vídeo\n\n${renderBrief(briefSections(i))}\n`;
}

/**
 * Vários prompts num só (um arquivo de telas com todas as marcas dele, as tomadas a refazer…): as Regras aparecem uma
 * vez no topo (sem repetir) e cada marca vem com as demais seções. `header` = linhas extras do grupo (custo total…).
 */
export function renderGroupBrief(title: string, items: readonly BriefInput[], header: string[] = []): string {
  const rules = [...new Set(items.flatMap((i) => rulesFor(i)))];
  const blocks = items.map((i, k) => {
    const secs = briefSections(i).filter((s) => s.title !== 'Regras');
    return `### ${k + 1}. ${i.mark.lessonId}/${i.mark.nodeId} ${fmtTime(i.mark.sceneTimeSec)} — ${categoryLabel(i.mark.category)}\n\n${secs.map((s) => `**${s.title}**\n${s.body}`).join('\n\n')}`;
  });
  return `# ${title} (${items.length} marca${items.length === 1 ? '' : 's'})\n\n${header.length ? `${header.join('\n')}\n\n` : ''}## Regras (valem para todas)\n${rules.map((x) => `- ${x}`).join('\n')}\n\n${blocks.join('\n\n')}\n`;
}
