/**
 * Cena editada fora do formulário do estúdio (script, aplicação de telas, refação de tomada): o rascunho muda mas
 * ninguém marca `media.stale`, então o orçamento comum pulava a cena. Aqui a cena é comparada com o job que gerou o
 * vídeo dela: o hash atual difere de `generatedFrom.sceneHash` E o conteúdo da entrada mudou = vídeo desatualizado.
 *
 * As duas condições juntas separam edição de atualização do motor: quando só uma versão interna muda (adaptador,
 * montador de tela, painel, pipeline de montagem), o hash muda mas a entrada da cena é a mesma, e nada é acusado
 * (refazer por troca de versão é decisão de quem atualizou o motor, não do orçamento). Nenhum hash muda aqui: só compara.
 */

/** chaves que o worker acrescenta à entrada do job depois de criado (resultado da execução, não pedido da cena) */
const WORKER_KEYS = new Set([
  'shots', 'units', 'captions', 'ttsItems', 'alignment', 'narration', 'mergedShots', 'voiceSha256', 'narrationKey',
  'voiceAssetId', 'elevenLabsRaw', 'narrationSeconds', 'elevenLabsCharacterCost', 'mockAssets', 'screenResult',
]);
/** chaves que não descrevem o conteúdo da cena: estimativa de custo e versões do motor */
const NON_CONTENT_KEYS = new Set(['estimate', 'panelVersion']);

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = stable(x);
    }
    return out;
  }
  return v;
}

/** a URL de prévia da câmera é só exibição (expira e é trocada pelo asset local); não muda o vídeo */
function normalize(key: string, v: unknown): unknown {
  if (key === 'cameras' && Array.isArray(v)) {
    return v.map((c) => {
      if (!c || typeof c !== 'object') return c;
      const { previewUrl: _p, ...rest } = c as Record<string, unknown>;
      return rest;
    });
  }
  return v;
}

/**
 * A entrada atual da cena (`jobInput` do orçamento) pede algo diferente do que o job anterior recebeu?
 * Compara só chaves de conteúdo: as do worker e as de versão/estimativa ficam de fora; uma chave de conteúdo que
 * sumiu da cena (ex.: tópicos do painel removidos) também conta como mudança.
 */
export function sceneInputChanged(prevInput: Record<string, unknown> | null | undefined, current: Record<string, unknown>): boolean {
  if (!prevInput) return false;
  const keys = new Set([...Object.keys(current), ...Object.keys(prevInput)]);
  for (const k of keys) {
    if (WORKER_KEYS.has(k) || NON_CONTENT_KEYS.has(k)) continue;
    const a = JSON.stringify(stable(normalize(k, prevInput[k])) ?? null);
    const b = JSON.stringify(stable(normalize(k, current[k])) ?? null);
    if (a !== b) return true;
  }
  return false;
}
