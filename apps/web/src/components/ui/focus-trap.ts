'use client';

import * as React from 'react';

/**
 * Gestão de foco das sobreposições e das ações assíncronas.
 *
 * - `useFocusTrap(ref, opts)`: foco inicial ao abrir, Tab/Shift+Tab circulam
 *   dentro do diálogo, Esc fecha e, ao fechar, o foco volta ao elemento que
 *   abriu (o `document.activeElement` no momento em que o diálogo montou).
 * - `focusAfter(el)`: leva o foco a um elemento no próximo quadro (depois de o
 *   React renderizar), para o foco não cair no <body> quando o botão que foi
 *   clicado some ou fica desabilitado.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'summary',
  'video[controls]',
  'audio[controls]',
].join(',');

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('hidden') && !el.closest('[hidden]') && el.getClientRects().length > 0);
}

export type FocusTarget = HTMLElement | null | undefined | string | (() => HTMLElement | null | undefined);

function resolve(target: FocusTarget): HTMLElement | null {
  if (!target) return null;
  if (typeof target === 'string') return document.querySelector<HTMLElement>(target);
  if (typeof target === 'function') return target() ?? null;
  return target;
}

/**
 * Foca `target` no próximo quadro de animação (após o React aplicar a
 * renderização). Elementos não focáveis recebem `tabindex="-1"`. Devolve uma
 * função para cancelar.
 */
export function focusAfter(target: FocusTarget, opts: { preventScroll?: boolean } = {}): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let raf = window.requestAnimationFrame(() => {
    const el = resolve(target);
    if (!el) {
      // segunda tentativa: alguns estados só aparecem no quadro seguinte
      raf = window.requestAnimationFrame(() => {
        const again = resolve(target);
        if (again) doFocus(again, opts.preventScroll);
      });
      return;
    }
    doFocus(el, opts.preventScroll);
  });
  return () => window.cancelAnimationFrame(raf);
}

function doFocus(el: HTMLElement, preventScroll?: boolean) {
  if (!el.matches(FOCUSABLE) && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll });
}

export interface FocusTrapOptions {
  /** ativo (padrão true); com false não faz nada */
  active?: boolean;
  /** o que recebe o foco ao abrir: um ref, um seletor dentro do diálogo ou um elemento; padrão: o primeiro focável */
  initialFocus?: React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null | undefined);
  /** para onde o foco volta ao fechar; padrão: o elemento ativo quando o diálogo abriu */
  returnFocusTo?: React.RefObject<HTMLElement | null> | (() => HTMLElement | null | undefined);
  /** chamado no Esc (o diálogo decide fechar) */
  onEscape?: (e: KeyboardEvent) => void;
}

/**
 * Prende o foco dentro de `ref` enquanto montado/ativo. Se o diálogo monta num
 * portal que ainda não existe no primeiro commit, tenta de novo no quadro
 * seguinte.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, options: FocusTrapOptions = {}) {
  const { active = true } = options;
  const optsRef = React.useRef(options);
  optsRef.current = options;
  const openerRef = React.useRef<HTMLElement | null>(null);
  /** devolução de foco agendada pela limpeza; cancelada se o trap re-arma (StrictMode em dev) */
  const pendingReturn = React.useRef<number | null>(null);

  // guarda quem abriu (antes de qualquer foco interno); nunca um elemento de dentro do diálogo
  React.useLayoutEffect(() => {
    if (!active) return;
    const ae = (document.activeElement as HTMLElement | null) ?? null;
    if (ae && ref.current?.contains(ae)) return;
    openerRef.current = ae;
  }, [active, ref]);

  React.useEffect(() => {
    if (!active) return;
    if (pendingReturn.current !== null) {
      window.cancelAnimationFrame(pendingReturn.current);
      pendingReturn.current = null;
    }
    let cancelRaf: (() => void) | null = null;
    let root: HTMLElement | null = null;

    const focusInitial = (el: HTMLElement) => {
      const init = optsRef.current.initialFocus;
      let target: HTMLElement | null = null;
      if (typeof init === 'string') target = el.querySelector<HTMLElement>(init);
      else if (typeof init === 'function') target = init() ?? null;
      else if (init && 'current' in init) target = init.current;
      if (!target) target = focusableIn(el)[0] ?? el;
      if (target === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };

    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (!el) return;
      if (e.key === 'Escape') {
        optsRef.current.onEscape?.(e);
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusableIn(el);
      if (list.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const current = document.activeElement as HTMLElement | null;
      const inside = !!current && el.contains(current);
      if (e.shiftKey) {
        if (!inside || current === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const arm = () => {
      root = ref.current;
      if (!root) return false;
      // só foca se o foco ainda não está dentro (ex.: autoFocus de um campo)
      if (!root.contains(document.activeElement)) focusInitial(root);
      document.addEventListener('keydown', onKey, true);
      return true;
    };

    if (!arm()) {
      // portal ainda não montou: tenta no próximo quadro
      const raf = window.requestAnimationFrame(() => {
        arm();
      });
      cancelRaf = () => window.cancelAnimationFrame(raf);
    }

    return () => {
      cancelRaf?.();
      document.removeEventListener('keydown', onKey, true);
      const back = optsRef.current.returnFocusTo;
      const explicit = typeof back === 'function' ? back() : back?.current;
      const target = explicit ?? openerRef.current;
      if (target && target.isConnected && document.contains(target)) {
        // depois de o React desmontar o diálogo
        pendingReturn.current = window.requestAnimationFrame(() => {
          pendingReturn.current = null;
          if (target.isConnected) target.focus({ preventScroll: true });
        });
      }
    };
  }, [active, ref]);
}
