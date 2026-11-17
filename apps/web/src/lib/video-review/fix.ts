/**
 * Classificação do conserto de uma marca (função pura): o servidor passa a resolução da marca e o orçamento do
 * rascunho ATUAL para a cena (mesmo `buildQuoteItems` do gerar-curso/estúdio) e recebe o tipo de conserto:
 *
 *  - `free`   grátis e determinístico: o rascunho já mudou (tela/tópicos/texto) e remontar a cena custa US$ 0
 *             (fala paga reaproveitada); com o estúdio em modo real é enfileirado pelo mesmo caminho do lote;
 *  - `edit`   precisa de uma edição (arquivo de telas, de tópicos ou a fala) antes de remontar;
 *  - `paid`   gasto (refazer a tomada do apresentador, regravar a cena): pede "Aprovar US$ X";
 *  - `manual` decisão humana (corte/emenda, outro).
 *
 * Os comandos do operador são sempre a seco primeiro; o `--confirmar` só depois da aprovação.
 */
import { RETAKE_CATEGORIES, type MarkResolution, type ReviewCategory } from './resolve';
import type { FixKind } from './status';

export type FixTarget = 'remount' | 'scene' | 'retake' | 'screen' | 'topics' | 'speech' | 'cut' | 'other';

export interface FixInput {
  courseId: string;
  lessonId: string;
  nodeId: string;
  category: ReviewCategory;
  resolution: MarkResolution | null;
  /** orçamento do rascunho atual para a cena: o hash mudou em relação ao vídeo assistido? e quanto custa produzir */
  scene: { changed: boolean; usd: number } | null;
  /** orçamento de refazer a tomada da marca (applyRetakes + buildQuoteItems), quando a marca pede tomada */
  retakeUsd: number | null;
  /** arquivos de roteiro achados (para os comandos de aplicar) */
  telasFile?: string | null;
  topicosFile?: string | null;
  /** o estúdio está em modo demonstração (mídia simulada): nada é enfileirado daqui */
  simulation: boolean;
}

export interface FixPlan {
  kind: FixKind;
  target: FixTarget;
  /** frase curta para a tela */
  label: string;
  reason: string;
  usd: number | null;
  tomadas?: string[];
  /** grátis e com o estúdio em modo real: enfileira já (mesmo caminho do lote) */
  autoRun: boolean;
  /** quem executa: o próprio estúdio ou o operador (Claude Code / terminal) */
  executor: 'studio' | 'operator';
  commands: { dryRun?: string; confirm?: string; apply?: string[] };
}

const W = './apps/worker/node_modules/.bin/tsx';
/** teto do `--max-usd`: o orçamento com folga, nunca menos de US$ 1 */
export const maxUsdFor = (usd: number) => Math.max(1, Math.ceil(usd * 1.3));

function genCommands(courseId: string, nodeId: string, usd: number) {
  const base = `cd apps/web && tsx src/scripts/gerar-curso.ts --course ${courseId} --cenas ${nodeId} --max-usd ${maxUsdFor(usd)}`;
  return { dryRun: base, confirm: `cd apps/web && ALLOW_PAID_PROVIDERS=1 tsx src/scripts/gerar-curso.ts --course ${courseId} --cenas ${nodeId} --max-usd ${maxUsdFor(usd)} --confirmar` };
}

export function classifyFix(i: FixInput): FixPlan {
  const r = i.resolution;
  const operator = (p: Omit<FixPlan, 'executor' | 'autoRun'>): FixPlan => ({ ...p, autoRun: false, executor: 'operator' });
  if (!r) return operator({ kind: 'manual', target: 'other', label: 'Decisão manual', reason: 'a cena da marca não está mais no rascunho', usd: null, commands: {} });
  const retakeCat = RETAKE_CATEGORIES.includes(i.category);

  // o rascunho já mudou para esta cena (tela, tópicos, texto): remontar resolve sem decisão nova
  if (!retakeCat && i.scene?.changed) {
    if (i.scene.usd === 0) {
      const auto = !i.simulation;
      return {
        kind: 'free', target: 'remount', label: 'Remontar a cena (sem custo)',
        reason: 'o rascunho já mudou para esta cena e a fala paga é reaproveitada: remontar custa US$ 0',
        usd: 0, autoRun: auto, executor: auto ? 'studio' : 'operator', commands: genCommands(i.courseId, i.nodeId, 0),
      };
    }
    return operator({ kind: 'paid', target: 'scene', label: `Regravar a cena (US$ ${i.scene.usd.toFixed(2)})`, reason: 'o rascunho mudou e produzir a cena de novo tem custo', usd: i.scene.usd, commands: genCommands(i.courseId, i.nodeId, i.scene.usd) });
  }

  if (retakeCat) {
    if (r.take?.retakeable) {
      const usd = i.retakeUsd ?? 0;
      const flags = `--course ${i.courseId} --tomadas ${r.take.id} --max-usd ${maxUsdFor(usd)}`;
      return operator({
        kind: 'paid', target: 'retake', label: `Refazer a tomada ${r.take.id} (US$ ${usd.toFixed(2)})`,
        reason: 'defeito do clipe do apresentador: só uma tomada nova resolve (as demais tomadas da cena são reaproveitadas)',
        usd, tomadas: [r.take.id],
        commands: { dryRun: `cd apps/web && tsx src/scripts/refazer-tomadas.ts ${flags}`, confirm: `cd apps/web && ALLOW_PAID_PROVIDERS=1 tsx src/scripts/refazer-tomadas.ts ${flags} --confirmar` },
      });
    }
    return operator({ kind: 'manual', target: 'other', label: 'Decisão manual', reason: r.take?.why ?? 'não dá para refazer só a tomada', usd: null, commands: {} });
  }

  const apply = (script: 'aplicar-telas' | 'aplicar-topicos', file: string | null | undefined) =>
    file ? [`${W} packages/db/src/scripts/${script}.ts --course ${i.courseId} --file ${file} --seco`, `${W} packages/db/src/scripts/${script}.ts --course ${i.courseId} --file ${file}`, genCommands(i.courseId, i.nodeId, 0).dryRun + '   # tem de dar US$ 0 para a cena'] : [];
  if (r.screen && (i.category === 'screen' || i.category === 'sync')) {
    return operator({ kind: 'edit', target: 'screen', label: 'Editar a tela simulada', reason: `ajustar a seção ${r.screen.section} do arquivo de telas e remontar (sem custo)`, usd: 0, commands: { apply: apply('aplicar-telas', i.telasFile) } });
  }
  if (r.topic && (i.category === 'topics' || i.category === 'sync')) {
    return operator({ kind: 'edit', target: 'topics', label: 'Editar os tópicos do painel', reason: `ajustar a seção ${i.nodeId.toUpperCase()} do arquivo de tópicos e remontar (sem custo)`, usd: 0, commands: { apply: apply('aplicar-topicos', i.topicosFile) } });
  }
  if (i.category === 'speech') {
    return operator({ kind: 'edit', target: 'speech', label: 'Editar a fala', reason: 'legenda errada com a fala certa: só a legenda; fala errada: editar o roteiro e regravar a cena (custo, pede aprovação)', usd: null, commands: {} });
  }
  if (i.category === 'cut') {
    return operator({ kind: 'manual', target: 'cut', label: 'Decidir a emenda', reason: 'ajuste fino da emenda (sem custo) ou refazer a tomada (custo): precisa de decisão', usd: null, commands: {} });
  }
  return operator({ kind: 'manual', target: 'other', label: 'Decisão manual', reason: 'sem conserto automático para este tipo de marca', usd: null, commands: {} });
}

export const FIX_KIND_LABEL: Record<FixKind, string> = { free: 'grátis', edit: 'precisa de edição', paid: 'pago', manual: 'decisão manual' };
