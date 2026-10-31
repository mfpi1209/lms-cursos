import { describe, expect, it } from 'vitest';
import { PresentationSchema } from '@lms/course-schema';
import { parseArgs, withPresenterOverrides } from '../src/scripts/import-markdown-course';

/* Importador: --voice / --voice-name / --avatar-name trocam o apresentador herdado do curso de origem. Puro, sem banco. */
const source = PresentationSchema.parse({ avatarId: 'look_marina', avatarName: 'Marina', voiceId: 'voz_marina', voiceName: 'Voz da Marina' });

describe('importador: troca de apresentador', () => {
  it('lê as flags', () => {
    const a = parseArgs(['--file', 'x.md', '--voice', 'voz_nova', '--voice-name', 'Gabriel', '--avatar-name', 'Rafael']);
    expect(a).toMatchObject({ voice: 'voz_nova', voiceName: 'Gabriel', avatarName: 'Rafael' });
    expect(parseArgs(['--file', 'x.md']).voice).toBeUndefined();
    expect(parseArgs(['--file', 'x.md', '--presenter-pronoun', 'he']).presenterPronoun).toBe('he');
    expect(parseArgs(['--file', 'x.md', '--presenter-pronoun', 'ele']).presenterPronoun).toBeUndefined();
    expect(withPresenterOverrides(source, { presenterPronoun: 'he' }).presenterPronoun).toBe('he');
  });

  it('troca voz e nome; sem flags mantém o de origem; voz nova sem nome descarta o nome antigo', () => {
    expect(withPresenterOverrides(source, { voice: 'voz_nova', voiceName: 'Gabriel', avatarName: 'Rafael' })).toMatchObject({ voiceId: 'voz_nova', voiceName: 'Gabriel', avatarName: 'Rafael', avatarId: 'look_marina' });
    expect(withPresenterOverrides(source, {})).toEqual(source);
    const semNome = withPresenterOverrides(source, { voice: 'voz_nova' });
    expect(semNome.voiceId).toBe('voz_nova');
    expect(semNome.voiceName).toBeUndefined();
    expect(source.voiceId).toBe('voz_marina');
  });
});
