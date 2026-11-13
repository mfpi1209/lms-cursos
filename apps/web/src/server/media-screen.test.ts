import { describe, expect, it } from 'vitest';
import { allLessons, markdownToCourseDocument, parseMarkdownCourse, type CourseDocument } from '@lms/course-schema';
import { mediaConfigFromEnv } from '@lms/media';
import { resolveSceneProduction, sceneRequestFromPresentation } from './media';

const MD = `# Curso tela

Ideia: Testar gravação de tela.
Público: alunos.
Objetivo final: Ao final, a pessoa assiste.
Duração-alvo: 1 aula de 3 minutos.

## Módulo 1 — Único

Descrição: Um módulo.

### Aula 1 — Tela
Objetivo: Ao final, você vê a tela.

### V01 — Passo a passo
**Fala para gravação**
"Vou mostrar na tela como se faz o pedido. Repare que o pedido diz para quem é a lista e o que ela precisa. Quanto mais claro o pedido, mais útil fica a resposta. Agora olhe a tela e acompanhe cada passo, do primeiro clique até o envio da mensagem."
Texto na tela: Passo a passo

### FIM — O que você levou
- Primeiro tópico curto
- Segundo tópico curto
`;

const cfg = mediaConfigFromEnv({ MEDIA_SIMULATION: '1' } as unknown as NodeJS.ProcessEnv);
const env = {} as NodeJS.ProcessEnv;

function docWith(recordings: Array<{ fileName: string; assetId?: string }> | undefined, voice: 'elevenlabs' | 'heygen' = 'elevenlabs'): CourseDocument {
  const doc = markdownToCourseDocument(parseMarkdownCourse(MD), { presentation: { avatarId: 'look1', voiceProvider: voice, voiceId: 'v1' } });
  if (recordings) {
    for (const l of allLessons(doc)) for (const n of l.graph.nodes) if (n.id === 'v01') (n as { screenRecordings?: unknown }).screenRecordings = recordings;
  }
  return doc;
}
const lessonOf = (doc: CourseDocument) => allLessons(doc).find((l) => l.graph.nodes.some((n) => n.id === 'v01'))!;
const plan = (doc: CourseDocument) => resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lessonOf(doc).id, 'v01'), cfg, env);

describe('plano de geração: cena com gravação de tela', () => {
  it('pede só a narração em voz: nenhum avatar, câmera, direção nem custo de vídeo', () => {
    const r = plan(docWith([{ fileName: 'a.mp4', assetId: 'ast_a' }, { fileName: 'b.mp4', assetId: 'ast_b' }]));
    const input = r.jobInput as Record<string, unknown>;
    expect(input.kind).toBe('screen');
    expect(input.voiceProvider).toBe('elevenlabs');
    for (const k of ['avatarId', 'direction', 'cameras', 'presentationFingerprint', 'presenterPronoun']) expect(input, k).not.toHaveProperty(k);
    expect(JSON.stringify(input)).not.toMatch(/avatar|heygen|look1/i);
    expect((input.screen as { recordings: unknown[] }).recordings).toEqual([{ fileName: 'a.mp4', assetId: 'ast_a' }, { fileName: 'b.mp4', assetId: 'ast_b' }]);
    expect(r.adapterVersion).not.toMatch(/heygen/i);
    expect(r.estimate.estimatedUsd).toBeGreaterThanOrEqual(0);
    expect(r.estimate.elevenLabsCredits).toBe(r.script.length);
  });

  it('a mudança de gravação muda o hash; a ordem importa', () => {
    const a = plan(docWith([{ fileName: 'a.mp4', assetId: 'x1' }, { fileName: 'b.mp4', assetId: 'x2' }])).sceneHash;
    expect(plan(docWith([{ fileName: 'a.mp4', assetId: 'x1' }, { fileName: 'b.mp4', assetId: 'x2' }])).sceneHash).toBe(a);
    expect(plan(docWith([{ fileName: 'b.mp4', assetId: 'x2' }, { fileName: 'a.mp4', assetId: 'x1' }])).sceneHash).not.toBe(a);
    expect(plan(docWith([{ fileName: 'a.mp4', assetId: 'x9' }, { fileName: 'b.mp4', assetId: 'x2' }])).sceneHash).not.toBe(a);
  });

  it('gravação sem arquivo: "falta mídia: <arquivo>" (nunca monta parcial)', () => {
    expect(() => plan(docWith([{ fileName: 'a.mp4', assetId: 'x1' }, { fileName: 'passo-2.mp4' }]))).toThrow('falta mídia: passo-2.mp4');
  });

  it('exige a voz do ElevenLabs', () => {
    expect(() => plan(docWith([{ fileName: 'a.mp4', assetId: 'x1' }], 'heygen'))).toThrow(/ElevenLabs/);
  });

  it('cena sem gravação segue o plano de avatar de sempre', () => {
    const r = plan(docWith(undefined));
    expect((r.jobInput as { avatarId?: string }).avatarId).toBe('look1');
    expect(r.jobInput).not.toHaveProperty('kind');
  });
});
