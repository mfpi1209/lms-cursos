import { describe, expect, it } from 'vitest';
import { advanceInstructor, buildCharacterPrompt, instructorCameraSpecs, SimulatedHeyGenLooks, studioLabelOf, type CharacterLookGenerator, type InstructorState } from '../src';

const spec = { name: 'Júlia', pronoun: 'she' as const, characterPrompt: buildCharacterPrompt('mulher de 30 anos, cabelo cacheado, blusa azul'), studioLabel: '8', sceneryPrompt: 'studio: navy panels' };
const ref = { base64: Buffer.from('png').toString('base64'), mediaType: 'image/png' };

/** gerador simulado que conta chamadas pagas */
function counting(): CharacterLookGenerator & { calls: number } {
  const sim = new SimulatedHeyGenLooks();
  const g = {
    simulated: true,
    calls: 0,
    async createCharacterFromPrompt(i: Parameters<SimulatedHeyGenLooks['createCharacterFromPrompt']>[0]) { g.calls++; return sim.createCharacterFromPrompt(i); },
    async generateLookFromPrompt(i: Parameters<SimulatedHeyGenLooks['generateLookFromPrompt']>[0]) { g.calls++; return sim.generateLookFromPrompt(i); },
    getLookGeneration: (id: string) => sim.getLookGeneration(id),
  };
  return g;
}

describe('instrutor novo', () => {
  it('ids e nomes das câmeras no formato dos kits (esq/dir/34)', () => {
    expect(studioLabelOf('estudio-jovem-8')).toBe('8');
    expect(instructorCameraSpecs(spec).map((c) => [c.id, c.zone])).toEqual([['cam_julia8_esq', 'left'], ['cam_julia8_dir', 'right'], ['cam_julia8_34', 'center']]);
  });

  it('prompt do personagem: fictício, sem texto nem logos', () => {
    expect(spec.characterPrompt).toMatch(/fictional person/);
    expect(spec.characterPrompt).toMatch(/No text, no logos/);
    expect(() => buildCharacterPrompt('  ')).toThrow();
  });

  it('personagem → 3 câmeras → pronto, 4 gerações e nenhuma repetida ao retomar', async () => {
    const gen = counting();
    let state: InstructorState = { cameras: [] };
    const steps: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await advanceInstructor({ spec, state, workspaceId: 'wsp_1', referenceImage: ref }, gen);
      state = r.state;
      steps.push(r.step);
      if (r.done) break;
    }
    expect(steps).toEqual(['character', 'cameras', 'done']);
    expect(gen.calls).toBe(4);
    expect(state.cameras.every((c) => c.status === 'ready' && c.lookId && c.sourceLookId === state.base!.lookId)).toBe(true);
    // retomar com tudo pronto: nada novo é pedido
    const again = await advanceInstructor({ spec, state, workspaceId: 'wsp_1', referenceImage: ref }, gen);
    expect(again.done).toBe(true);
    expect(again.changed).toBe(false);
    expect(gen.calls).toBe(4);
  });

  it('falha na geração para o fluxo; retryFailed pede de novo só a que falhou', async () => {
    const gen = counting();
    let state: InstructorState = { cameras: [] };
    state = (await advanceInstructor({ spec, state, workspaceId: 'w', referenceImage: ref }, gen)).state;
    state = (await advanceInstructor({ spec, state, workspaceId: 'w', referenceImage: ref }, gen)).state;
    state.cameras[1] = { ...state.cameras[1]!, status: 'generating', generationId: 'bad_id' };
    const failing = { ...gen, getLookGeneration: async (id: string) => (id === 'bad_id' ? { status: 'failed' as const, error: 'recusado' } : gen.getLookGeneration(id)) };
    const r = await advanceInstructor({ spec, state, workspaceId: 'w', referenceImage: ref }, failing);
    expect(r.step).toBe('failed');
    expect(r.error).toMatch(/recusado/);
    const calls = gen.calls;
    const retry = await advanceInstructor({ spec, state: r.state, workspaceId: 'w', referenceImage: ref, retryFailed: true }, gen);
    expect(retry.started).toHaveLength(1);
    expect(gen.calls).toBe(calls + 1);
  });
});
