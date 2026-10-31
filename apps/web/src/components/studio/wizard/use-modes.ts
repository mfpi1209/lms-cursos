'use client';

import * as React from 'react';
import { api } from '@/lib/api';
import type { AiCapabilities } from './agent-api';

/**
 * Modo da IA e do vídeo neste ambiente, para o selo "Demonstração / IA real"
 * e "Vídeo simulado / Vídeo real". Consulta uma vez por sessão (cache no módulo).
 */
export interface Modes {
  loading: boolean;
  /** null enquanto carrega ou se a rota falhou */
  aiDemo: boolean | null;
  aiConfigured: boolean | null;
  aiProvider: string | null;
  mediaSimulation: boolean | null;
}

interface MediaCapabilities {
  simulation: boolean;
}

let cache: Promise<Omit<Modes, 'loading'>> | null = null;

function load(): Promise<Omit<Modes, 'loading'>> {
  if (!cache) {
    cache = Promise.all([
      api<AiCapabilities>('/api/ai/capabilities').catch(() => null),
      api<MediaCapabilities>('/api/media/capabilities').catch(() => null),
    ]).then(([ai, media]) => ({
      aiDemo: ai ? ai.provider === 'fake' : null,
      aiConfigured: ai ? ai.configured : null,
      aiProvider: ai ? ai.provider : null,
      mediaSimulation: media ? media.simulation : null,
    }));
  }
  return cache;
}

export function useModes(): Modes {
  const [state, setState] = React.useState<Modes>({ loading: true, aiDemo: null, aiConfigured: null, aiProvider: null, mediaSimulation: null });
  React.useEffect(() => {
    let alive = true;
    void load().then((m) => alive && setState({ loading: false, ...m }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export const AI_MODE_LABEL = (m: Modes) => (m.aiDemo === null ? 'IA: …' : m.aiDemo ? 'IA: demonstração' : 'IA real');
export const MEDIA_MODE_LABEL = (m: Modes) => (m.mediaSimulation === null ? 'Vídeo: …' : m.mediaSimulation ? 'Vídeo simulado' : 'Vídeo real');
