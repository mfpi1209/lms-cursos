import { describe, expect, it } from 'vitest';
import { estimateLineSeconds, itemKey, planRenderUnits, shotRanges, unitOffsets } from '../src/compose-plan';

const shot = (id: string, line: string, extra: Record<string, unknown> = {}) => ({ id, line, framing: 'medium', layout: 'presenter', cameraMove: 'static', transitionIn: 'cut', ...extra });
const LINE = (n: number) => `Esta é a fala do plano número ${n}, com palavras suficientes para durar alguns segundos.`;
const voice = { provider: 'elevenlabs', voiceId: 'v1' };
const keyOf = (script: string, motionPrompt?: string) => itemKey({ kind: 'clip', text: script, voice, lookId: 'look', motionPrompt, adapterVersion: 'x', simulated: false });

describe('tomada contínua: planos vizinhos na mesma câmera = UM pedido ao HeyGen', () => {
  const same = [
    shot('s1', LINE(1), { cameraId: 'cam34', motionPrompt: 'nods slightly, warm smile' }),
    shot('s2', LINE(2), { cameraId: 'cam34', motionPrompt: 'tilts head, thoughtful', framing: 'close', transitionIn: 'crossfade' }),
    shot('s3', LINE(3), { cameraId: 'cam34', motionPrompt: 'raises eyebrows, curious' }),
    shot('s4', LINE(4), { cameraId: 'cam34' }),
  ] as never[];

  it('4 planos na mesma câmera -> 1 pedido (antes: 4); o gesto do clipe é o do primeiro plano', () => {
    const { units, merged } = planRenderUnits(same, { hasNarrationAudio: true });
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ id: 's1', kind: 'clip', shotIds: ['s1', 's2', 's3', 's4'], cameraId: 'cam34', motionPrompt: 'nods slightly, warm smile' });
    expect(units[0]!.script).toBe([1, 2, 3, 4].map(LINE).join(' '));
    expect(merged).toEqual([]);
  });

  it('troca de câmera -> corte: A A B B A = 3 pedidos; nunca um pedido atravessa duas câmeras', () => {
    const cams = ['A', 'A', 'B', 'B', 'A'];
    const shots = cams.map((c, i) => shot(`s${i + 1}`, LINE(i + 1), { cameraId: c })) as never[];
    const { units } = planRenderUnits(shots, { hasNarrationAudio: true });
    expect(units.map((u) => [u.cameraId, u.shotIds])).toEqual([['A', ['s1', 's2']], ['B', ['s3', 's4']], ['A', ['s5']]]);
  });

  it('plano com cartão/slide (sem apresentador) e cena em movimento quebram a tomada; com voz do HeyGen o slide entra no clipe', () => {
    const slide = shot('sl', LINE(9), { cameraId: 'A', layout: 'slide', slide: { title: 'T', bullets: ['a'], style: 'clean' } });
    const shots = [shot('a', LINE(1), { cameraId: 'A' }), slide, shot('b', LINE(2), { cameraId: 'A' })] as never[];
    expect(planRenderUnits(shots, { hasNarrationAudio: true }).units.map((u) => [u.kind, u.shotIds])).toEqual([['clip', ['a']], ['audio', ['sl']], ['clip', ['b']]]);
    expect(planRenderUnits(shots, { hasNarrationAudio: false }).units.map((u) => [u.kind, u.shotIds])).toEqual([['clip', ['a', 'sl', 'b']]]);
  });

  it('os tempos de cada plano (cartões, pílulas, painéis) continuam os da narração: offsets e recortes por plano', () => {
    const { units } = planRenderUnits(same, { hasNarrationAudio: true });
    const timings = new Map([
      ['s1', { shotId: 's1', start: 10, end: 14.2, duration: 4.2 }],
      ['s2', { shotId: 's2', start: 14.2, end: 19.0, duration: 4.8 }],
      ['s3', { shotId: 's3', start: 19.0, end: 24.5, duration: 5.5 }],
      ['s4', { shotId: 's4', start: 24.5, end: 30.0, duration: 5.5 }],
    ]) as never;
    const offsets = unitOffsets(units[0]!, timings);
    expect(offsets.s1).toEqual({ start: 0, duration: expect.closeTo(4.2, 5) });
    expect(offsets.s2).toEqual({ start: expect.closeTo(4.2, 5), duration: expect.closeTo(4.8, 5) });
    expect(offsets.s3).toEqual({ start: expect.closeTo(9.0, 5), duration: expect.closeTo(5.5, 5) });
    expect(offsets.s4).toEqual({ start: expect.closeTo(14.5, 5) }); // o último vai até o fim do clipe
    const ranges = shotRanges(units[0]!, same as never, offsets, 20);
    expect(ranges.get('s3')!.startSeconds).toBeCloseTo(9.0);
    expect([...ranges.keys()]).toEqual(['s1', 's2', 's3', 's4']); // o clipe é recortado em sequência, sem reiniciar a pose
  });

  it('hash do grupo: muda com qualquer fala do grupo, com o gesto do primeiro plano e com a câmera; não muda com o gesto dos demais planos', () => {
    const k = (shots: unknown[]) => {
      const u = planRenderUnits(shots as never[], { hasNarrationAudio: true }).units[0]!;
      return keyOf(u.script, u.motionPrompt);
    };
    const base = k(same);
    expect(k(same)).toBe(base);
    const edited = (same as unknown as Array<Record<string, unknown>>).map((s) => (s.id === 's3' ? { ...s, line: 'Outra fala no meio da tomada, bem diferente.' } : s));
    expect(k(edited)).not.toBe(base);
    const firstGesture = (same as unknown as Array<Record<string, unknown>>).map((s) => (s.id === 's1' ? { ...s, motionPrompt: 'relaxed shoulders, calm' } : s));
    expect(k(firstGesture)).not.toBe(base);
    const laterGesture = (same as unknown as Array<Record<string, unknown>>).map((s) => (s.id === 's3' ? { ...s, motionPrompt: 'relaxed shoulders, calm' } : s));
    expect(k(laterGesture)).toBe(base);
  });

  it('custo igual: as mesmas palavras e os mesmos segundos antes e depois do agrupamento', () => {
    const { units } = planRenderUnits(same, { hasNarrationAudio: true });
    const before = (same as unknown as Array<{ line: string }>).reduce((a, s) => a + estimateLineSeconds(s.line), 0);
    const after = units.reduce((a, u) => a + estimateLineSeconds(u.script), 0);
    expect(after).toBeCloseTo(before, 5);
    const words = (t: string) => t.trim().split(/\s+/).length;
    expect(units.reduce((a, u) => a + words(u.script), 0)).toBe((same as unknown as Array<{ line: string }>).reduce((a, s) => a + words(s.line), 0));
  });
});
