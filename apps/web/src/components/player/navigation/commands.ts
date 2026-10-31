'use client';

import { useEffect, useRef } from 'react';

/**
 * Comandos para o player vindos de fora dele (barra "Modo de teste" do
 * estúdio). Um evento de janela mantém o player desacoplado de quem o comanda.
 */
export type PlayerCommand = { kind: 'back' } | { kind: 'goto'; pathIndex: number } | { kind: 'open-map' };

const EVENT = 'lms:player-command';

export function sendPlayerCommand(cmd: PlayerCommand) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PlayerCommand>(EVENT, { detail: cmd }));
}

export function usePlayerCommands(handler: (cmd: PlayerCommand) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = (e: Event) => ref.current((e as CustomEvent<PlayerCommand>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
}
