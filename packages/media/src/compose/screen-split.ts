/**
 * Divisão do tempo da narração entre as telas de uma cena (função pura, sem ffmpeg): usada pela montagem
 * (`screen.ts`) e pela revisão do estúdio (`@lms/media/timing`).
 */
/** tempo mínimo de uma tela gerada quando a narração já está toda ocupada por gravações enviadas */
export const MOCK_MIN_SEC = 2;

/**
 * Divide o tempo da narração entre as TELAS GERADAS da cena. Gravações enviadas entram com a duração delas
 * (`uploadSec`); as telas geradas repartem o que sobra da narração (N - soma dos enviados) PROPORCIONALMENTE ao
 * total de `weight` dos passos de cada uma (passo sem peso = 1), com mínimo de MOCK_MIN_SEC cada. Se o mínimo
 * estourar a narração, a regra de duração normal (corte do fim) vale para a soma. Função pura.
 *
 * Com `cueSec` (instante, na narração, em que a fala chega no primeiro passo de cada tela gerada) em TODAS as telas
 * geradas, a divisão segue a fala: cada tela dura até o `cueSec` da próxima (a primeira começa em 0; a última vai
 * até o fim da narração). Faltando `cueSec` em alguma, vale a proporção pelo peso.
 * Devolve a duração de cada item (enviado: a dele; gerado: a calculada), na ordem.
 */
export function splitMockDurations(items: Array<{ uploadSec: number } | { mockWeight: number; cueSec?: number }>, narrationSec: number): number[] {
  const mocks = items.filter((i): i is { mockWeight: number; cueSec?: number } => 'mockWeight' in i);
  if (mocks.length && mocks.every((m) => m.cueSec !== undefined)) {
    const out: number[] = [];
    let pos = 0;
    items.forEach((it, k) => {
      if ('uploadSec' in it) {
        out.push(it.uploadSec);
        pos += it.uploadSec;
        return;
      }
      let uploadsBetween = 0;
      let next: number | undefined;
      for (let q = k + 1; q < items.length; q++) {
        const o = items[q]!;
        if ('uploadSec' in o) uploadsBetween += o.uploadSec;
        else {
          next = o.cueSec;
          break;
        }
      }
      const dur = Math.max(MOCK_MIN_SEC, (next ?? narrationSec) - uploadsBetween - pos);
      out.push(dur);
      pos += dur;
    });
    return out;
  }
  const uploaded = items.reduce((a, i) => a + ('uploadSec' in i ? i.uploadSec : 0), 0);
  const weights = items.map((i) => ('mockWeight' in i ? Math.max(i.mockWeight, 0.0001) : 0));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const rest = Math.max(0, narrationSec - uploaded);
  return items.map((i, k) => ('uploadSec' in i ? i.uploadSec : Math.max(MOCK_MIN_SEC, (rest * weights[k]!) / totalW)));
}
