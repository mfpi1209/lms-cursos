import { describe, expect, it } from 'vitest';
import { isDirectedJob } from '../src/compose-scene';
import { firstMissingScreenMedia, isScreenJob } from '../src/screen-scene';

describe('job de gravação de tela (só voz, sem avatar)', () => {
  const input = { kind: 'screen', script: 'Fala.', voiceProvider: 'elevenlabs', voiceId: 'v1', screen: { recordings: [{ fileName: 'a.mp4', assetId: 'x' }] } };

  it('é reconhecido como job de tela e nunca como cena dirigida ou plano único de avatar', () => {
    expect(isScreenJob({ input })).toBe(true);
    expect(isDirectedJob({ input })).toBe(false);
    expect(isScreenJob({ input: { script: 'Fala', avatarId: 'l1', voiceProvider: 'heygen', params: {} } })).toBe(false);
    expect(isScreenJob({ input: { kind: 'screen', screen: {} } })).toBe(false);
  });

  it('gravação sem arquivo: "falta mídia: <arquivo>"', () => {
    expect(firstMissingScreenMedia([{ fileName: 'a.mp4', assetId: 'x' }, { fileName: 'b.mp4' }])).toBe('falta mídia: b.mp4');
    expect(firstMissingScreenMedia([{ fileName: 'a.mp4', assetId: 'x' }])).toBeNull();
  });
});
