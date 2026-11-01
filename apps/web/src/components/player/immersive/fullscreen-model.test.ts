import { describe, expect, it, vi } from 'vitest';
import {
  detectFullscreenMode,
  exitNativeFullscreen,
  fullscreenStorageKey,
  nativeFullscreenElement,
  readPseudoFullscreen,
  requestNativeFullscreen,
  writePseudoFullscreen,
  type StorageLike,
} from './fullscreen-model';

const memoryStorage = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

describe('tela cheia do player: qual modo usar', () => {
  it('desktop, Android e iPad: a Fullscreen API de elemento existe, então é nativa', () => {
    expect(detectFullscreenMode({ fullscreenEnabled: true })).toBe('native');
    expect(detectFullscreenMode({ webkitFullscreenEnabled: true })).toBe('native');
  });
  it('iPhone (Safari não tem tela cheia de elemento): camada fixa, sem depender do <video>', () => {
    expect(detectFullscreenMode({ fullscreenEnabled: false })).toBe('pseudo');
    expect(detectFullscreenMode({})).toBe('pseudo');
  });
  it('lê o elemento em tela cheia também com prefixo', () => {
    const el = {} as Element;
    expect(nativeFullscreenElement({ fullscreenElement: el })).toBe(el);
    expect(nativeFullscreenElement({ webkitFullscreenElement: el })).toBe(el);
    expect(nativeFullscreenElement({ fullscreenElement: null })).toBeNull();
  });
});

describe('pedir e sair da tela cheia nativa', () => {
  it('pede ao elemento raiz, escondendo a barra do navegador', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    await requestNativeFullscreen({ requestFullscreen });
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });
  it('usa o prefixo quando só ele existe', async () => {
    const webkitRequestFullscreen = vi.fn();
    await expect(requestNativeFullscreen({ webkitRequestFullscreen })).resolves.toBeUndefined();
    expect(webkitRequestFullscreen).toHaveBeenCalled();
  });
  it('rejeita quando o navegador nega ou não suporta (o player cai na camada fixa)', async () => {
    await expect(requestNativeFullscreen({ requestFullscreen: () => Promise.reject(new Error('negado')) })).rejects.toThrow('negado');
    await expect(
      requestNativeFullscreen({
        requestFullscreen: () => {
          throw new Error('síncrono');
        },
      }),
    ).rejects.toThrow('síncrono');
    await expect(requestNativeFullscreen({})).rejects.toThrow();
  });
  it('sair nunca lança, mesmo se a promessa falhar', () => {
    expect(() => exitNativeFullscreen({ exitFullscreen: () => Promise.reject(new Error('x')) })).not.toThrow();
    expect(() => exitNativeFullscreen({ webkitExitFullscreen: () => undefined })).not.toThrow();
    expect(() => exitNativeFullscreen({})).not.toThrow();
  });
});

describe('lembrar a camada fixa na sessão', () => {
  it('guarda e lê por curso; sair apaga', () => {
    const st = memoryStorage();
    const key = fullscreenStorageKey('mat-1');
    expect(readPseudoFullscreen(st, key)).toBe(false);
    writePseudoFullscreen(st, key, true);
    expect(readPseudoFullscreen(st, key)).toBe(true);
    expect(readPseudoFullscreen(st, fullscreenStorageKey('mat-2'))).toBe(false);
    writePseudoFullscreen(st, key, false);
    expect(readPseudoFullscreen(st, key)).toBe(false);
    expect(st.data.size).toBe(0);
  });
  it('sem sessionStorage (janela privada, bloqueio): funciona sem lembrar', () => {
    const boom: StorageLike = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(readPseudoFullscreen(boom, 'k')).toBe(false);
    expect(() => writePseudoFullscreen(boom, 'k', true)).not.toThrow();
    expect(readPseudoFullscreen(null, 'k')).toBe(false);
    expect(() => writePseudoFullscreen(null, 'k', true)).not.toThrow();
  });
});
