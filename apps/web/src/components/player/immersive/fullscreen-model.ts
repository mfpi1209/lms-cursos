/**
 * Tela cheia do player da plataforma: regras puras (sem React), testáveis em Node.
 *
 * O alvo é UM elemento raiz do player, que não desmonta entre as cenas. Assim a tela
 * cheia sobrevive à troca de cena, reação, decisão, missão e despedida.
 *
 * - `native`: Fullscreen API no elemento raiz (desktop, Android, iPad).
 * - `pseudo`: onde ela não existe (iPhone/Safari: `document.fullscreenEnabled` é falso), o
 *   raiz vira uma camada fixa que ocupa a tela toda (100dvh, rolagem do fundo travada). O
 *   estado fica no player (e no sessionStorage) e não depende do `<video>`, que no iPhone
 *   só entra em tela cheia nativa por elemento (e a perde a cada vídeo novo).
 */

export type FullscreenMode = 'native' | 'pseudo';

/** Subconjunto de `Document` que a detecção usa (aceita as versões com prefixo do Safari). */
export interface FullscreenDoc {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
}

export interface FullscreenElementLike {
  requestFullscreen?: (options?: { navigationUI?: 'auto' | 'hide' | 'show' }) => Promise<void>;
  webkitRequestFullscreen?: () => void;
}

/** `native` só quando o navegador permite pôr um ELEMENTO em tela cheia; senão, `pseudo`. */
export function detectFullscreenMode(doc: FullscreenDoc): FullscreenMode {
  return doc.fullscreenEnabled || doc.webkitFullscreenEnabled ? 'native' : 'pseudo';
}

export function nativeFullscreenElement(doc: FullscreenDoc): Element | null {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** Pede tela cheia ao elemento; rejeita se o navegador não puder (o chamador cai no modo `pseudo`). */
export function requestNativeFullscreen(el: FullscreenElementLike): Promise<void> {
  try {
    if (el.requestFullscreen) return el.requestFullscreen({ navigationUI: 'hide' });
    if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
      return Promise.resolve();
    }
  } catch (e) {
    return Promise.reject(e);
  }
  return Promise.reject(new Error('fullscreen-unsupported'));
}

export function exitNativeFullscreen(doc: FullscreenDoc): void {
  try {
    const p = doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => undefined);
  } catch {}
}

/* ---- preferência do modo `pseudo` (sessão do navegador) ---- */

export const FULLSCREEN_STORAGE_PREFIX = 'lms.im.fullscreen:';

/** Uma chave por matrícula (LMS) ou por aula (prévia): a tela cheia segue pelas aulas do mesmo curso. */
export function fullscreenStorageKey(scope: string): string {
  return `${FULLSCREEN_STORAGE_PREFIX}${scope}`;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readPseudoFullscreen(storage: StorageLike | null, key: string): boolean {
  try {
    return storage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writePseudoFullscreen(storage: StorageLike | null, key: string, on: boolean): void {
  try {
    if (on) storage?.setItem(key, '1');
    else storage?.removeItem(key);
  } catch {}
}
