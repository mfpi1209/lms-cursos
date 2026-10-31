/**
 * Preferência de tema da plataforma (aluno, player, login e estúdio).
 *
 * - Valores: `system` (padrão) | `light` | `dark`.
 * - Guardada no cookie `lms-theme` (lido no servidor: o HTML já sai com o tema, sem piscar)
 *   e no localStorage (reserva quando o cookie some).
 * - Aplicada como `data-theme="light|dark"` em <html>; a preferência fica em `data-theme-pref`.
 *   Em `system`, o script inline (THEME_INIT_SCRIPT, no <head>) resolve pelo
 *   `prefers-color-scheme` antes da hidratação e acompanha as mudanças do sistema.
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_COOKIE = 'lms-theme';
export const THEME_STORAGE_KEY = 'lms-theme';
export const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark'];

export function parseThemePref(value: string | null | undefined): ThemePref {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

/**
 * Roda no <head>, antes de pintar. Lê a preferência do atributo posto pelo servidor
 * (cookie) ou, na falta dele, do localStorage; resolve `system` e escuta o sistema.
 * Pequeno e sem dependências; erros (storage bloqueado) caem no padrão.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,k=${JSON.stringify(THEME_STORAGE_KEY)},c=${JSON.stringify(THEME_COOKIE)};var p=d.getAttribute('data-theme-pref');if(!p){try{p=localStorage.getItem(k)}catch(e){}if(p==='light'||p==='dark'){document.cookie=c+'='+p+'; Path=/; Max-Age=31536000; SameSite=Lax'}}if(p!=='light'&&p!=='dark')p='system';d.setAttribute('data-theme-pref',p);var m=window.matchMedia('(prefers-color-scheme: light)');var a=function(){var q=d.getAttribute('data-theme-pref')||'system';d.setAttribute('data-theme',q==='system'?(m.matches?'light':'dark'):q)};a();if(m.addEventListener)m.addEventListener('change',a);else if(m.addListener)m.addListener(a)}catch(e){}})();`;

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref !== 'system') return pref;
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Aplica e guarda a preferência (cookie + localStorage + atributos em <html>), sem animar as cores na troca. */
export function applyThemePref(pref: ThemePref) {
  const d = document.documentElement;
  d.setAttribute('data-theme-switching', '');
  d.setAttribute('data-theme-pref', pref);
  d.setAttribute('data-theme', resolveTheme(pref));
  document.cookie = `${THEME_COOKIE}=${pref}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* storage bloqueado: o cookie basta */
  }
  // duas pinturas sem transição; depois as transições normais voltam
  requestAnimationFrame(() => requestAnimationFrame(() => d.removeAttribute('data-theme-switching')));
}
