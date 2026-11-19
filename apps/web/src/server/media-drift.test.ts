import { describe, expect, it } from 'vitest';
import { sceneInputChanged } from './media-drift';

const prev = {
  script: 'Oi, tudo bem?',
  avatarId: 'av_1',
  voiceId: 'vz_1',
  params: { motionPrompt: 'warm smile', removeBackground: true },
  direction: { version: 1, shots: [{ id: 's1', cameraId: 'cam_a' }] },
  cameras: [{ id: 'cam_a', lookId: 'lk_1', previewUrl: 'https://cdn.example/a.webp?Expires=1' }],
  estimate: { estimatedUsd: 0.5 },
  // acrescentados pelo worker depois de criado o job
  shots: { s1: { key: 'abc' } },
  alignment: { endTimes: [0.2] },
  voiceAssetId: 'ast_v',
};

describe('sceneInputChanged', () => {
  it('mesma cena (ordem de chaves do jsonb, campos do worker, prévia da câmera, estimativa) não mudou', () => {
    const current = {
      voiceId: 'vz_1',
      avatarId: 'av_1',
      script: 'Oi, tudo bem?',
      params: { removeBackground: true, motionPrompt: 'warm smile', handsStill: undefined },
      direction: { shots: [{ cameraId: 'cam_a', id: 's1' }], version: 1 },
      cameras: [{ id: 'cam_a', lookId: 'lk_1', previewUrl: '/api/assets/ast_local' }],
      estimate: { estimatedUsd: 0.9 },
      panelVersion: 'zone-panel-1',
    };
    expect(sceneInputChanged(prev, current)).toBe(false);
  });

  it('movimento, tomada, texto ou câmera diferentes = mudou', () => {
    const base = { script: prev.script, avatarId: prev.avatarId, voiceId: prev.voiceId, params: prev.params, direction: prev.direction, cameras: prev.cameras };
    expect(sceneInputChanged(prev, { ...base, params: { ...prev.params, motionPrompt: 'hands clasped' } })).toBe(true);
    expect(sceneInputChanged(prev, { ...base, direction: { ...prev.direction, retake: { s1: 1 } } })).toBe(true);
    expect(sceneInputChanged(prev, { ...base, script: 'Oi!' })).toBe(true);
    expect(sceneInputChanged(prev, { ...base, cameras: [{ id: 'cam_a', lookId: 'lk_2' }] })).toBe(true);
  });

  it('chave de conteúdo que sumiu da cena (tópicos do painel removidos) = mudou', () => {
    const withTopics = { ...prev, screenTopics: [{ text: 'Um' }] };
    const current = { script: prev.script, avatarId: prev.avatarId, voiceId: prev.voiceId, params: prev.params, direction: prev.direction, cameras: prev.cameras };
    expect(sceneInputChanged(withTopics, current)).toBe(true);
  });

  it('sem entrada anterior (job sumiu) não acusa', () => {
    expect(sceneInputChanged(null, { script: 'x' })).toBe(false);
  });
});
