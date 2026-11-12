/*
 * Duração escrita à mão ("8 h", "8h30", "480 min", "1,5 h") → minutos inteiros.
 * Usada por `Duração-alvo` e `Carga horária` do roteiro em Markdown.
 */

const FOLD = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Lê um texto que é SÓ uma duração e devolve os minutos (inteiro, > 0), ou
 * `undefined` se o texto não for uma duração simples. Aceita:
 * `8 h`, `8h`, `8 horas`, `8h30`, `8h30min`, `8 horas e 30 minutos`,
 * `1,5 h`, `480 min`, `480 minutos`, com "cerca de"/"aprox." na frente e
 * ponto final no fim.
 */
export function parseDurationMinutes(text: string): number | undefined {
  const t = FOLD(text).replace(/[.;]+$/, '').replace(/^(?:cerca de|aprox\w*\.?|~)\s*/, '');
  let minutes: number | undefined;
  let m = /^(\d+)\s*(?:h|hr|hrs|hora|horas)\s*(?:e\s*)?(\d{1,2})\s*(?:m|min|mins|minuto|minutos)?$/.exec(t);
  if (m) minutes = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hora|horas)$/.exec(t))) minutes = Math.round(Number(m[1]!.replace(',', '.')) * 60);
  else if ((m = /^(\d+)\s*(?:m|min|mins|minuto|minutos)$/.exec(t))) minutes = Number(m[1]);
  return minutes !== undefined && Number.isFinite(minutes) && minutes > 0 ? minutes : undefined;
}
