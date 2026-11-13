import { describe, expect, it } from 'vitest';
import type { Camera, Shot } from '@lms/course-schema';
import { planRenderUnits } from '../src/compose-plan';
import { alphaKeyFor, keyFor, unitZone, type Ctx, type DirectedInput } from '../src/compose-scene';

/**
 * O painel do "Texto na tela" é só montagem: a chave do clipe do HeyGen (e a do vídeo transparente) não depende
 * dele. O hash da cena muda (remonta), mas os itens pagos são reaproveitados.
 */
const cameras: Camera[] = [
  { id: 'cam_esq', name: 'Esq', lookId: 'look_esq', nativeFraming: 'medium', angle: 'front', status: 'ready', placement: 'full_frame', zone: 'left' } as Camera,
  { id: 'cam_dir', name: 'Dir', lookId: 'look_dir', nativeFraming: 'medium', angle: 'front', status: 'ready', placement: 'full_frame', zone: 'right' } as Camera,
];
const shots: Shot[] = [
  { id: 's1', line: 'Quando a IA não sabe a resposta, ela costuma inventar algo que parece muito certo e convincente.', cameraId: 'cam_esq', framing: 'medium', layout: 'presenter', cameraMove: 'static', transitionIn: 'cut' } as Shot,
];
const ctx: Ctx = {
  cfg: {} as never, sim: false, ownAudio: true, direction: { version: 1, shots, source: 'author' } as never,
  voice: { provider: 'elevenlabs', voiceId: 'v1', modelId: 'm', stability: 0.35 }, adapterVersion: 'heygen-x+eleven-y',
};
const input = (extra: Partial<DirectedInput> = {}): DirectedInput => ({
  script: shots[0]!.line, avatarId: 'look_esq', voiceProvider: 'elevenlabs', voiceId: 'v1', params: { engine: 'avatar_iv', resolution: '1080p' },
  direction: ctx.direction, cameras, ...extra,
}) as DirectedInput;

describe('texto na tela não muda as chaves de reaproveitamento', () => {
  const { units } = planRenderUnits(shots, { hasNarrationAudio: true });
  const clip = units.find((u) => u.kind === 'clip')!;

  it('chave do clipe e do vídeo transparente iguais com e sem o painel (e com pergunta/letreiro)', () => {
    const base = input();
    const withText = input({ screenText: 'Onde ela erra: fatos recentes, números, citações e fontes.', nextQuestion: 'E agora?', lowerThird: { name: 'Marina' } });
    expect(keyFor(ctx, withText, clip)).toBe(keyFor(ctx, base, clip));
    expect(alphaKeyFor(ctx, withText, clip)).toBe(alphaKeyFor(ctx, base, clip));
    expect(keyFor(ctx, base, clip)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('controle: a fala (o que gera o avatar) muda a chave', () => {
    const other = { ...clip, script: `${clip.script} Outra frase.` };
    expect(keyFor(ctx, input(), other)).not.toBe(keyFor(ctx, input(), clip));
  });

  it('o lado vazio vem da zona da câmera do item (esq: apresentadora à esquerda)', () => {
    expect(unitZone(input(), clip)).toBe('left');
    expect(unitZone(input(), { cameraId: 'cam_dir' })).toBe('right');
  });
});
