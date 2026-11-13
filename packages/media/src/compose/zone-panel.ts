import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { panelCanvas, renderPanelPng, type PanelSpec } from './panel';
import { matchStepCues, type CueWord } from './screen-mock-schedule';

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
export const ZONE_PANEL = {
  perPage: 3,
  maxTopics: 6,
  /** a fusão que acende o tópico começa isto antes da palavra e dura `light` (metade acesa 0,05 s antes da palavra) */
  lead: 0.15,
  light: 0.2,
  /** troca de página: fusão da lista, e quanto o último tópico da página fica aceso antes dela (s) */
  pageFade: 0.35,
  pageHold: 0.4,
  /** entrada do painel (s) e folga do último passo até o fim da janela */
  fadeIn: 0.35,
  tailRoom: 0.5,
} as const;

export interface ZonePanelTopic {
  text: string;
  /** trecho da fala em que o tópico acende */
  cue?: string;
  /** ícone (nome de `PANEL_ICONS`); ausente = `check` */
  icon?: string;
}

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

export interface ZonePanelStep {
  /** página (0, 1…) e quantos tópicos dela estão acesos neste estado */
  page: number;
  lit: number;
  /** início (s, tempo da cena, na grade de quadros) e duração da fusão que traz este estado (0 = o primeiro) */
  at: number;
  fade: number;
  /** tópico que este passo acende (ausente: estado inicial ou troca de página) */
  topic?: number;
  /** início da palavra achada na fala para esse tópico (ausente = interpolado) */
  wordAt?: number;
}

/**
 * Passos do painel na janela `win`: estado inicial (página 0, nada aceso), depois cada tópico acendendo no seu
 * `cue` e, antes do 1º tópico de cada página seguinte, a troca de página. Sempre crescente, sem fusões sobrepostas
 * e na grade de quadros; tópicos que não cabem até o fim da janela ficam de fora (os primeiros se mantêm).
 */
export function scheduleZonePanel(topics: ReadonlyArray<Pick<ZonePanelTopic, 'text' | 'cue'>>, words: ReadonlyArray<CueWord> | undefined, win: { from: number; to: number }, fps: number): ZonePanelStep[] {
  const frame = 1 / fps;
  const snap = (t: number) => Number((Math.ceil(t * fps - 1e-6) / fps).toFixed(4));
  const steps: ZonePanelStep[] = [{ page: 0, lit: 0, at: win.from, fade: 0 }];
  const list = topics.slice(0, ZONE_PANEL.maxTopics);
  if (!list.length) return steps;
  const found: Array<number | undefined> = words?.length ? matchStepCues(list.map((t) => ({ kind: 'highlight', text: t.text.replace(/\*\*/g, ''), ...(t.cue ? { cue: t.cue } : {}) })), words).times : list.map(() => undefined);
  const last = win.to - ZONE_PANEL.tailRoom;
  // achados: `lead` antes da palavra; sem achado: repartido por igual entre os vizinhos achados (ou as pontas da janela)
  const raw: number[] = found.map((t) => (t === undefined ? NaN : t - ZONE_PANEL.lead));
  for (let i = 0; i < raw.length; i++) {
    if (!Number.isNaN(raw[i]!)) continue;
    let j = i;
    while (j < raw.length && Number.isNaN(raw[j]!)) j++;
    const a = i > 0 ? raw[i - 1]! : win.from + ZONE_PANEL.fadeIn;
    const b = j < raw.length ? raw[j]! : Math.max(a, last);
    for (let k = i; k < j; k++) raw[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  let free = win.from + ZONE_PANEL.fadeIn;
  for (const [i, t] of raw.entries()) {
    const page = Math.floor(i / ZONE_PANEL.perPage);
    const added: ZonePanelStep[] = [];
    let light = Math.round(t * fps) / fps;
    if (i > 0 && i % ZONE_PANEL.perPage === 0) {
      // troca de página: o mais tarde possível antes do tópico, mas depois de o anterior ficar um tempo aceso
      const at = snap(Math.max(free + ZONE_PANEL.pageHold, light - ZONE_PANEL.pageFade - 2 * frame));
      added.push({ page, lit: 0, at, fade: ZONE_PANEL.pageFade });
      free = at + ZONE_PANEL.pageFade + frame;
    }
    light = Number(Math.max(light, snap(free)).toFixed(4));
    if (light > last + 1e-6) break;
    added.push({ page, lit: (i % ZONE_PANEL.perPage) + 1, at: light, fade: ZONE_PANEL.light, topic: i, ...(found[i] !== undefined ? { wordAt: found[i]! } : {}) });
    free = light + ZONE_PANEL.light + frame;
    steps.push(...added);
  }
  return steps;
}

/** Descompasso (s) de cada tópico: instante em que está MEIO aceso menos o início da palavra (negativo = adiantado). */
export function zonePanelDrift(steps: ReadonlyArray<ZonePanelStep>): Array<{ topic: number; drift: number }> {
  return steps.filter((s) => s.topic !== undefined && s.wordAt !== undefined).map((s) => ({ topic: s.topic!, drift: Number((s.at + s.fade / 2 - s.wordAt!).toFixed(3)) }));
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
