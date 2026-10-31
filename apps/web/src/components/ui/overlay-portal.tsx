'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

/** Raiz estável das sobreposições; o layout da área (ex.: estúdio) a cria dentro do contêiner do tema. */
export const OVERLAY_ROOT_ID = 'overlay-root';

const subscribe = () => () => undefined;

/**
 * Renderiza sobreposições (diálogos) fora da árvore animada. Sem isso, um
 * ancestral com transform/animação (ex.: a entrada dos passos do wizard) vira o
 * bloco de contenção do `position: fixed` e o diálogo abre fora da tela.
 *
 * O destino é a raiz `#overlay-root` (criada pelo layout dentro de
 * `.theme-studio`, para o diálogo manter as cores da área) ou, na falta dela,
 * o contêiner de tema mais próximo e por fim o <body>.
 *
 * Depois da hidratação, o portal é criado no MESMO commit em que o diálogo
 * monta (useSyncExternalStore devolve "cliente" já no primeiro render): assim
 * os refs dos filhos existem quando os efeitos de foco rodam. Durante a
 * hidratação (ex.: a pílula do assistente, renderizada no servidor) o portal
 * entra no commit seguinte, sem divergência de HTML.
 */
export function OverlayPortal({ children }: { children: React.ReactNode }) {
  const isClient = React.useSyncExternalStore(subscribe, () => true, () => false);
  const anchor = React.useRef<HTMLSpanElement>(null);
  const [fallback, setFallback] = React.useState<Element | null>(null);

  const root = isClient ? document.getElementById(OVERLAY_ROOT_ID) : null;

  React.useEffect(() => {
    if (root) return;
    setFallback(anchor.current?.closest('[class*="theme-"]') ?? document.body);
  }, [root]);

  const target = root ?? fallback;
  return (
    <>
      {!root && <span ref={anchor} hidden />}
      {target ? createPortal(children, target) : null}
    </>
  );
}
