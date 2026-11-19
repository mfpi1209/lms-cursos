import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { panelCanvas, renderPanelPng, type PanelSpec } from './panel';
import { ZONE_PANEL, type ZonePanelStep, type ZonePanelTopic } from './zone-panel-schedule';

export { ZONE_PANEL, scheduleZonePanel, zonePanelDrift, type ZonePanelStep, type ZonePanelTopic } from './zone-panel-schedule';

/**
 * Painel das cenas DIRIGIDAS do estúdio com zonas: o MESMO painel aprovado do `presenter_panel` (`panel.ts`, modelo
 * `docs/brand/cartoes/opcao-a-tela-cheia.html`) — sombra marinha, linha laranja "Aula N · título", título branco
 * grande e tópicos em linhas de vidro com ícone laranja — posto no lado LIVRE da câmera de zona, a cena inteira:
 *
 *  - apresentador na câmera da DIREITA: painel à esquerda, como no modelo;
 *  - apresentador na câmera da ESQUERDA: versão ESPELHADA (sombra e painel à direita).
 *
 * O que muda do modelo para caber nas zonas: (1) SEM o deslocamento de 150 px do vídeo — a câmera de zona já põe o
 * apresentador no terço oposto e a sombra some antes dele; (2) a camada é só a faixa da sombra (48% da largura),
 * não o quadro inteiro; (3) até 6 tópicos em PÁGINAS de 3: quando a fala chega ao 4º, a lista troca com uma fusão
 * suave; (4) cada tópico acende com uma fusão curta (não troca seca), centrada um instante antes da palavra.
 *
 * Tempo: o `cue` de cada tópico (ou o texto) é achado no alinhamento por palavra da narração (`matchStepCues`, o
 * mesmo das legendas); sem achado, interpola entre os vizinhos; sem alinhamento, distribui pela janela.
 * Nada disto entra na chave do clipe do provedor: é só remontagem.
 */


const STOP = new Set(['para', 'como', 'com', 'que', 'uma', 'umas', 'uns', 'dos', 'das', 'nos', 'nas', 'pelo', 'pela', 'seu', 'sua', 'mais', 'muito', 'isso', 'esse', 'essa', 'este', 'esta', 'ele', 'ela', 'você', 'não', 'sem', 'quase', 'sempre', 'todas', 'todos', 'cada', 'onde', 'quando', 'quem', 'mesmo', 'mesma', 'mesmos', 'mesmas', 'pode', 'sobre', 'até']);

/**
 * Destaque do tópico: se o autor já marcou `**negrito**`, fica como está; senão põe em negrito a palavra de conteúdo
 * mais longa (5+ letras; no empate, a última — em pt-BR o termo principal tende a fechar a frase). Tópico de uma ou
 * duas palavras fica sem destaque (o negrito não distinguiria nada).
 */
export function emphasizeTopic(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.includes('**')) return t;
  const words = t.split(' ');
  if (words.length < 3) return t;
  let best = -1;
  let len = 5;
  words.forEach((w, i) => {
    const core = w.replace(/[^\p{L}\p{N}-]/gu, '');
    if (core.length >= len && !STOP.has(core.toLowerCase())) {
      best = i;
      len = core.length;
    }
  });
  if (best < 0) return t;
  words[best] = words[best]!.replace(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u, '$1**$2**$3');
  return words.join(' ');
}

export interface ZonePanelSpec {
  /** "Aula N · título da aula" */
  eyebrow?: string;
  /** o "Texto na tela" da cena */
  title?: string;
  topics: ZonePanelTopic[];
}

export interface ZonePanelPlan {
  /** faixa da camada no quadro montado (todos os estados têm este tamanho e posição) */
  x: number;
  y: number;
  w: number;
  h: number;
  side: 'left' | 'right';
  /** estados em ordem: PNG, início da fusão que o traz e a duração dela (o primeiro: 0) */
  states: Array<{ path: string; at: number; fade: number }>;
  /** marca d'água (PNG do quadro inteiro) a repor POR CIMA da sombra, quando ela fica no mesmo canto do painel */
  watermarkPath?: string;
}

/** Tópicos da página `page` como o painel desenha (negrito de destaque, ícone resolvido). */
export function zonePanelPage(spec: ZonePanelSpec, page: number, count: number = spec.topics.length): PanelSpec {
  const items = spec.topics.slice(0, count).slice(page * ZONE_PANEL.perPage, (page + 1) * ZONE_PANEL.perPage);
  return { title: spec.title ?? '', bullets: items.map((t) => emphasizeTopic(t.text)), icons: items.map((t) => t.icon ?? 'check'), ...(spec.eyebrow ? { eyebrow: spec.eyebrow } : {}) };
}

/**
 * Desenha um PNG por estado dos `steps` (`scheduleZonePanel`) na pasta `dir`. `side` = lado do PAINEL (o oposto ao
 * apresentador).
 */
export async function renderZonePanelPlan(dir: string, spec: ZonePanelSpec, steps: ReadonlyArray<ZonePanelStep>, o: { width?: number; height?: number; side: 'left' | 'right' }): Promise<ZonePanelPlan> {
  const width = o.width ?? 1920;
  const height = o.height ?? 1080;
  await mkdir(dir, { recursive: true });
  const shown: number = steps.reduce((n, s) => (s.topic !== undefined ? Math.max(n, s.topic + 1) : n), 0);
  // só os tópicos agendados aparecem (o que não coube na janela não fica apagado para sempre na lista)
  const count = Math.min(spec.topics.length, shown);
  const files = new Map<string, string>();
  const states: ZonePanelPlan['states'] = [];
  for (const s of steps) {
    const key = `${s.page}-${s.lit}`;
    let file = files.get(key);
    if (!file) {
      file = path.join(dir, `zone-panel-${key}.png`);
      await writeFile(file, await renderPanelPng(zonePanelPage(spec, s.page, count), { width, height, lit: s.lit, side: o.side, clip: true }));
      files.set(key, file);
    }
    states.push({ path: file, at: s.at, fade: s.fade });
  }
  return { ...panelCanvas({ width, height, side: o.side, clip: true }), side: o.side, states };
}
