'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  detectFullscreenMode,
  exitNativeFullscreen,
  fullscreenStorageKey,
  nativeFullscreenElement,
  readPseudoFullscreen,
  requestNativeFullscreen,
  writePseudoFullscreen,
  type FullscreenDoc,
  type FullscreenElementLike,
  type FullscreenMode,
  type StorageLike,
} from './fullscreen-model';

export interface ImmersiveFullscreen {
  /** o navegador já foi consultado (antes disso, nem botão nem estado: evita divergir do HTML do servidor) */
  ready: boolean;
  mode: FullscreenMode;
  /** o player está em tela cheia (nativa ou em camada fixa) */
  active: boolean;
  /** camada fixa (iPhone): o raiz mesmo ocupa a tela; precisa de classes próprias */
  pseudo: boolean;
  toggle(): void;
  exit(): void;
}

const NONE: ImmersiveFullscreen = { ready: false, mode: 'native', active: false, pseudo: false, toggle() {}, exit() {} };
const Ctx = createContext<ImmersiveFullscreen>(NONE);

/** Estado da tela cheia do player (para a barra de controles e o topo do palco). Fora do player: inativo. */
export function useImmersiveFullscreenState(): ImmersiveFullscreen {
  return useContext(Ctx);
}

export const ImmersiveFullscreenProvider = Ctx.Provider;

function sessionStore(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Tela cheia do player inteiro. `root` é o elemento raiz do player (nunca desmonta entre as cenas):
 * o alvo da Fullscreen API ou, no iPhone, a camada fixa. `scope` identifica o curso/aula para lembrar o
 * modo em camada fixa na sessão.
 */
export function useImmersiveFullscreen(root: React.RefObject<HTMLElement | null>, scope: string): ImmersiveFullscreen {
  const [mode, setMode] = useState<FullscreenMode | null>(null);
  const [native, setNative] = useState(false);
  const [pseudo, setPseudoState] = useState(false);
  const storageKey = fullscreenStorageKey(scope);

  const setPseudo = useCallback(
    (on: boolean) => {
      setPseudoState(on);
      writePseudoFullscreen(sessionStore(), storageKey, on);
    },
    [storageKey],
  );

  useEffect(() => {
    const doc = document as unknown as FullscreenDoc;
    setMode(detectFullscreenMode(doc));
    setPseudoState(readPseudoFullscreen(sessionStore(), storageKey));
    const sync = () => {
      const el = nativeFullscreenElement(doc);
      setNative(!!el && el === root.current);
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, [root, storageKey]);

  // camada fixa: o fundo não rola atrás dela (o raiz rola por dentro)
  useEffect(() => {
    if (!pseudo) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prev;
    };
  }, [pseudo]);

  const exit = useCallback(() => {
    const doc = document as unknown as FullscreenDoc;
    if (nativeFullscreenElement(doc)) exitNativeFullscreen(doc);
    if (pseudo) setPseudo(false);
  }, [pseudo, setPseudo]);

  const toggle = useCallback(() => {
    const doc = document as unknown as FullscreenDoc;
    if (nativeFullscreenElement(doc) || pseudo) return exit();
    const el = root.current;
    if (mode === 'native' && el) {
      // o navegador pode negar (iframe sem permissão etc.): cai na camada fixa em vez de não fazer nada
      requestNativeFullscreen(el as unknown as FullscreenElementLike).catch(() => setPseudo(true));
    } else setPseudo(true);
  }, [exit, mode, pseudo, root, setPseudo]);

  return useMemo(
    () => ({ ready: mode !== null, mode: mode ?? 'native', active: native || pseudo, pseudo, toggle, exit }),
    [mode, native, pseudo, toggle, exit],
  );
}
