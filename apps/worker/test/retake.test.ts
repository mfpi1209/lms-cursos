import { describe, expect, it } from 'vitest';
import { SceneDirectionSchema, ShotSchema } from '@lms/course-schema';
import { itemKey, planRenderUnits } from '../src/compose-plan';
import { submitKey } from '../src/compose-scene';

const sh = (id: string, line: string, cameraId?: string) => ShotSchema.parse({ id, line, ...(cameraId ? { cameraId } : {}) });
const SHOTS = [
  sh('a1', 'Primeira fala da tomada um com a câmera de frente.', 'cam_f'),
  sh('a2', 'Segunda fala da mesma tomada na câmera de frente.', 'cam_f'),
  sh('b1', 'Terceira fala já na câmera de lado em três quartos.', 'cam_34'),
  sh('c1', 'Quarta fala volta para a câmera de frente de novo.', 'cam_f'),
];
const keyOf = (u: { script: string; retake?: number }) =>
  itemKey({ kind: 'clip', text: u.script, voice: { provider: 'elevenlabs', voiceId: 'v1' }, lookId: 'look', adapterVersion: 'av', simulated: false, ...(u.retake ? { retake: u.retake } : {}) });

describe('refazer só uma tomada: variação (direction.retake)', () => {
  it('campo opcional no schema: sem ele nada muda; valida inteiro >= 1', () => {
    const base = { version: 1, intent: '', source: 'author', shots: SHOTS };
    expect(SceneDirectionSchema.parse(base)).not.toHaveProperty('retake');
    expect(SceneDirectionSchema.parse({ ...base, retake: { b1: 2 } }).retake).toEqual({ b1: 2 });
    expect(SceneDirectionSchema.safeParse({ ...base, retake: { b1: 0 } }).success).toBe(false);
    expect(SceneDirectionSchema.safeParse({ ...base, retake: { b1: 1.5 } }).success).toBe(false);
  });

  it('a variação marca só a unidade da tomada (id do 1º plano) e muda só a chave dela', () => {
    const plain = planRenderUnits(SHOTS, { hasNarrationAudio: true }).units;
    const re = planRenderUnits(SHOTS, { hasNarrationAudio: true, retake: { b1: 1 } }).units;
    expect(plain.map((u) => u.id)).toEqual(['a1', 'b1', 'c1']);
    expect(plain.some((u) => u.retake)).toBe(false);
    expect(re.map((u) => u.retake)).toEqual([undefined, 1, undefined]);
    const k0 = plain.map(keyOf);
    const k1 = re.map(keyOf);
    expect(k1[0]).toBe(k0[0]);
    expect(k1[2]).toBe(k0[2]);
    expect(k1[1]).not.toBe(k0[1]);
    // nova variação = nova chave de novo; variação 0/ausente = a chave de antes (hashes antigos inalterados)
    const re2 = planRenderUnits(SHOTS, { hasNarrationAudio: true, retake: { b1: 2 } }).units.map(keyOf);
    expect(re2[1]).not.toBe(k1[1]);
    expect(keyOf({ script: plain[1]!.script })).toBe(k0[1]);
  });

  it('id de plano do meio da tomada também vale (a tomada inteira é refeita)', () => {
    const re = planRenderUnits(SHOTS, { hasNarrationAudio: true, retake: { a2: 3 } }).units;
    expect(re.map((u) => u.retake)).toEqual([3, undefined, undefined]);
  });

  it('Idempotency-Key do pedido leva a variação só quando > 0', () => {
    expect(submitKey('req1', 'b1', {})).toBe('req1:b1:0');
    expect(submitKey('req1', 'b1', {}, 0)).toBe('req1:b1:0');
    expect(submitKey('req1', 'b1', {}, 2)).toBe('req1:b1:0:rt2');
    expect(submitKey('req1', 'b1', { submitSeq: 1, plateFallback: true }, 2)).toBe('req1:b1:1:bg:rt2');
  });
});
