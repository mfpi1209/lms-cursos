import { matchStepCues, type CueWord } from './screen-mock-schedule';

/**
 * Agenda do painel de tópicos das cenas com zonas (função pura, sem desenho): quando cada tópico acende e quando a
 * página troca. Usada pela montagem (`zone-panel.ts`) e pela revisão do estúdio (`@lms/media/timing`).
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

