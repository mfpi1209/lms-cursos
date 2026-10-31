import { describe, expect, it } from 'vitest';
import { CameraSchema, CAMERA_ZONE_LABELS, chipLabel, freeSideOf, nextChipsCamera, shotUsesPresenterCrop, clampShotToNativeFraming, zoneCamerasOf, zoneTalkCamera, isCardLayout } from '../src/direction';
import { decisionQuestion, firstNarratedNodeId, nextDecisionQuestion } from '../src/studio';
import { LessonGraphSchema } from '../src/graph';
import { richTextFromPlain } from '../src/richtext';
import { presentationFingerprint } from '../src/presentation-fingerprint';
import { PresentationSchema } from '../src/course';

describe('estúdio com zonas: câmeras', () => {
  it('CameraSchema aceita zone (aditivo); rótulos do estúdio', () => {
    const c = CameraSchema.parse({ id: 'cam_estudio_esq', name: 'Esq', lookId: 'l', zone: 'left', placement: 'full_frame' });
    expect(c.zone).toBe('left');
    expect(CameraSchema.parse({ id: 'x', name: 'x', lookId: 'l' }).zone).toBeUndefined();
    expect(() => CameraSchema.parse({ id: 'x', name: 'x', lookId: 'l', zone: 'top' })).toThrow();
    expect(CAMERA_ZONE_LABELS).toEqual({ left: 'Apresentadora à esquerda', right: 'Apresentadora à direita', center: 'Apresentadora ao centro' });
  });

  it('zoneCamerasOf: só câmeras prontas com zona; sem lateral = null (comportamento de antes)', () => {
    expect(zoneCamerasOf([{ id: 'a', zone: 'center', status: 'ready', lookId: 'x' }])).toBeNull();
    expect(zoneCamerasOf([{ id: 'a', zone: 'left', status: 'generating', lookId: '' }])).toBeNull();
    expect(zoneCamerasOf([{ id: 'p' }, { id: 'c', zone: 'center', lookId: 'x' }, { id: 'l', zone: 'left', lookId: 'y' }, { id: 'r', zone: 'right', lookId: 'z' }])).toEqual({ center: 'c', left: 'l', right: 'r' });
  });

  it('câmera de fala por cena e pílulas alternando o lado', () => {
    const z = { center: 'c', left: 'l', right: 'r' };
    expect([0, 1, 2, 3, 4, 5].map((i) => zoneTalkCamera(z, i))).toEqual(['c', 'l', 'c', 'r', 'c', 'l']);
    expect([0, 1, 2].map((i) => zoneTalkCamera({ left: 'l', right: 'r' }, i))).toEqual(['l', 'r', 'l']);
    expect(nextChipsCamera(z, undefined)).toEqual({ zone: 'left', cameraId: 'l' });
    expect(nextChipsCamera(z, 'left')).toEqual({ zone: 'right', cameraId: 'r' });
    expect(nextChipsCamera(z, 'right')).toEqual({ zone: 'left', cameraId: 'l' });
    expect(nextChipsCamera({ right: 'r' }, 'right')).toEqual({ zone: 'right', cameraId: 'r' });
    expect(freeSideOf('left')).toBe('right');
    expect(freeSideOf('right')).toBe('left');
    expect(freeSideOf('center')).toBe('right');
  });

  it('presenter_chips: cartão (limites), sem recorte do apresentador (tela cheia intocada)', () => {
    expect(isCardLayout('presenter_chips')).toBe(true);
    expect(shotUsesPresenterCrop('presenter_chips')).toBe(false);
    const s = { framing: 'close' as const, cameraMove: 'push_in', layout: 'presenter_chips' };
    expect(clampShotToNativeFraming(s, 'medium')).toBe(s);
  });

  it('chipLabel: o primeiro negrito, até 4 palavras, inicial maiúscula', () => {
    expect(chipLabel('Ajudar no **negócio da família**')).toBe('Negócio da família');
    expect(chipLabel('**Voluntariado**, esporte e **cursos online**')).toBe('Voluntariado');
    expect(chipLabel('chegue dez minutos antes do horário marcado.')).toBe('Chegue dez minutos antes');
    expect(chipLabel('**leve um documento com foto, sempre**')).toBe('Leve um documento com');
  });

  it('impressão da apresentação: a zona entra só quando definida', () => {
    const base = PresentationSchema.parse({ avatarId: 'l', cameras: [{ id: 'c', name: 'c', lookId: 'l', placement: 'full_frame' }] });
    const zoned = { ...base, cameras: [{ ...base.cameras[0]!, zone: 'left' as const }] };
    expect(presentationFingerprint(zoned)).not.toBe(presentationFingerprint(base));
    expect(presentationFingerprint(base)).toBe(presentationFingerprint(PresentationSchema.parse({ avatarId: 'l', cameras: [{ id: 'c', name: 'c', lookId: 'l', placement: 'full_frame' }] })));
  });
});

describe('estúdio com zonas: pergunta a seguir e primeira cena', () => {
  const graph = LessonGraphSchema.parse({
    schemaVersion: 1,
    startNodeId: 'v1',
    nodes: [
      { id: 'v1', type: 'scenario', title: 'Abertura', body: richTextFromPlain('Tela.'), narration: 'Oi! Hoje a gente fala de experiência.' },
      { id: 'v2', type: 'content', title: 'Lista', body: richTextFromPlain('Tela.'), narration: 'Ajudar em casa conta. Organizar evento conta.' },
      { id: 'q1', type: 'choice', title: 'Isso entra?', prompt: richTextFromPlain('Você organiza os campeonatos do bairro. Isso entra no seu currículo de primeiro emprego, sim ou não, na sua opinião?'), options: [{ id: 'a', label: 'Sim' }, { id: 'b', label: 'Não' }] },
      { id: 'fim', type: 'end', title: 'Fim', summary: richTextFromPlain('Fim.') },
    ],
    edges: [{ id: 'e1', from: 'v1', to: 'v2' }, { id: 'e2', from: 'v2', to: 'q1' }, { id: 'e3', from: 'q1', to: 'fim', optionId: 'a' }, { id: 'e4', from: 'q1', to: 'fim', optionId: 'b' }],
  });

  it('a cena cujo próximo nó é uma decisão recebe a pergunta (≤ 12 palavras); as demais não', () => {
    expect(nextDecisionQuestion(graph, 'v2')).toBe('Isso entra no seu currículo de primeiro emprego, sim ou não, na…');
    expect(nextDecisionQuestion(graph, 'v1')).toBeUndefined();
    expect(nextDecisionQuestion(graph, 'q1')).toBeUndefined();
    expect(nextDecisionQuestion(graph, 'nada')).toBeUndefined();
  });

  it('decisionQuestion: a última frase interrogativa; sem pergunta, o título', () => {
    const q = graph.nodes.find((n) => n.id === 'q1');
    if (q?.type !== 'choice') throw new Error('fixture');
    expect(decisionQuestion({ ...q, prompt: richTextFromPlain('Você chegou cedo. Entra agora?') })).toBe('Entra agora?');
    expect(decisionQuestion({ ...q, prompt: richTextFromPlain('Sem pergunta aqui.') })).toBe('Isso entra?');
  });

  it('primeira cena narrada: o nó inicial (letreiro com o nome só nela)', () => {
    expect(firstNarratedNodeId(graph)).toBe('v1');
    expect(firstNarratedNodeId({ ...graph, startNodeId: 'fim' })).toBe('v1');
  });
});
