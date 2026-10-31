'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlayerSession } from '../use-player-session';
import { usePlayerCommands } from './commands';

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'VIDEO' || tag === 'AUDIO') return true;
  // grupos de opções (setas mudam a seleção), controles deslizantes e menus
  return !!el.closest('[role="radiogroup"],[role="slider"],[role="listbox"],[role="menu"],[role="tablist"]');
}

function isInteractive(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest('button,a[href],summary,[role="button"]');
}

/**
 * Navegação do aluno dentro da aula: mapa da aula (gaveta) e atalhos.
 * - ← volta uma cena (quando permitido);
 * - Enter/→ clicam "Continuar" só quando ESSA é a ação principal da cena
 *   (nunca em decisões/avaliações, para não confirmar sem querer).
 * Atalhos ficam desligados em campos de texto, grupos de opções, vídeo e
 * quando um diálogo está aberto.
 */
export function useLessonNav(player: PlayerSession) {
  const [mapOpen, setMapOpen] = useState(false);
  const openMap = useCallback(() => setMapOpen(true), []);
  const closeMap = useCallback(() => setMapOpen(false), []);
  const { canGoBack, goBack, pending } = player;

  usePlayerCommands((cmd) => {
    if (cmd.kind === 'open-map') setMapOpen(true);
    else if (cmd.kind === 'back' && canGoBack) void goBack();
    else if (cmd.kind === 'goto' && canGoBack) void goBack(cmd.pathIndex);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Enter') return;
      if (mapOpen || document.querySelector('[aria-modal="true"]')) return;
      if (isEditable(e.target)) return;
      if (e.key === 'ArrowLeft') {
        if (!canGoBack || pending) return;
        e.preventDefault();
        void goBack();
        return;
      }
      // Enter num botão/link já age sozinho
      if (e.key === 'Enter' && isInteractive(e.target)) return;
      const btn = document.querySelector<HTMLButtonElement>('[data-testid="player-continue"]');
      if (!btn || btn.disabled || btn.getClientRects().length === 0) return;
      if (!/^\s*continuar/i.test(btn.textContent ?? '')) return;
      e.preventDefault();
      btn.click();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mapOpen, canGoBack, goBack, pending]);

  return { mapOpen, openMap, closeMap };
}
