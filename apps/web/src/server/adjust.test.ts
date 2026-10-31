import { describe, expect, it } from 'vitest';
import { allLessons, markdownToCourseDocument, parseMarkdownCourse, type CourseDocument } from '@lms/course-schema';
import { AdjustRequestSchema, reactionAdjustJob, sceneAdjustContext, sceneAdjustJob, sceneSourceJobId } from './adjust';

const MD = `# Curso ajuste

Ideia: Testar o ajuste fino.
Público: iniciantes.
Objetivo final: Ao final, a pessoa responde.
Duração-alvo: 1 aula de 3 minutos.

## Módulo 1 — Único

Descrição: Um módulo.

### Aula 1 — Experiência
Objetivo: Ao final, você reconhece experiências.

### V01 — Abertura
**Fala para gravação**
"Experiência não é só carteira assinada."

### Q01 — Isso entra?
Situação: Você organiza os campeonatos do bairro.
| Escolha | Qualidade | Reação | Feedback | Destino |
|---|---|---|---|---|
| "Coloco, sim." | forte | "Isso mesmo! Organizar campeonato mostra responsabilidade." | É uma responsabilidade real. | FIM |
| "Não coloco." | fraca | "Muita gente pensa assim, mas experiência não depende de salário." | Experiência conta. | FIM |

### FIM — O que você levou
- Experiência não é só emprego.
`;

const pack = (t: string) => t.split(' ').map((w, i) => [w, i * 0.4, i * 0.4 + 0.3] as [string, number, number]);
const direction = {
  version: 1,
  shots: [
    { id: 's1', line: 'Nesta aula, você vai ver. Eu sou a Marina.', layout: 'presenter', framing: 'medium', cameraMove: 'static', transitionIn: 'cut' },
    { id: 's2', line: 'Você escolhe e tenta de novo.', layout: 'presenter', framing: 'medium', cameraMove: 'static', transitionIn: 'cut' },
    { id: 'chamada', line: 'Agora é com você.', layout: 'presenter', framing: 'medium', cameraMove: 'static', transitionIn: 'cut' },
  ],
};
const source = {
  id: 'mjb_origem',
  input: {
    direction,
    nextQuestion: 'Isso entra?',
    units: [
      { id: 's1', kind: 'clip', shotIds: ['s1'] },
      { id: 's2', kind: 'clip', shotIds: ['s2'] },
      { id: 'chamada', kind: 'clip', shotIds: ['chamada'] },
    ],
    shots: { s1: { words: pack('Nesta aula, você vai ver. Eu sou a Marina.') }, s2: { words: pack('Você escolhe e tenta de novo.') }, chamada: { words: pack('Agora é com você.') } },
  },
};

function fixture(): CourseDocument {
  const doc = markdownToCourseDocument(parseMarkdownCourse(MD));
  const lesson = allLessons(doc)[0]!;
  const v01 = lesson.graph.nodes.find((n) => n.id === 'v01') as unknown as Record<string, unknown>;
  v01.media = { assetId: 'ast_v01', kind: 'video', generatedFrom: { jobId: 'mjb_origem', sceneHash: 'h', provider: 'heygen' } };
  v01.direction = direction;
  const q01 = lesson.graph.nodes.find((n) => n.id === 'q01') as unknown as { options: Array<{ reaction?: Record<string, unknown> }> };
  for (const o of q01.options) if (o.reaction) o.reaction.media = { assetId: 'ast_r', kind: 'video' };
  return doc;
}

describe('ajuste fino pelo estúdio: pedido e job', () => {
  const doc = fixture();
  const lessonId = allLessons(doc)[0]!.id;

  it('valida o corpo (alvo cena ou reação; lado do corte)', () => {
    expect(AdjustRequestSchema.safeParse({ target: 'scene', lessonId, nodeId: 'v01', cut: [{ shotId: 's1', side: 'meio' }] }).success).toBe(false);
    const ok = AdjustRequestSchema.parse({ target: 'scene', lessonId, nodeId: 'v01', drop: ['s2'] });
    expect(ok).toMatchObject({ drop: ['s2'], cut: [] });
    expect(AdjustRequestSchema.safeParse({ target: 'reaction', lessonId, choiceId: 'q01' }).success).toBe(false);
  });

  it('opções da cena: o que pode sair, cortar e o cartão atual', () => {
    expect(sceneSourceJobId(doc, lessonId, 'v01')).toEqual({ jobId: 'mjb_origem' });
    expect(sceneSourceJobId(doc, lessonId, 'fim')).toHaveProperty('reason');
    const c = sceneAdjustContext(doc, lessonId, 'v01', source);
    if ('reason' in c) throw new Error(c.reason);
    expect(c.teaser).toBe('Isso entra?');
    expect(c.options.map((o) => [o.id, o.canDrop, o.canCutFirst])).toEqual([['s1', true, true], ['s2', true, false], ['chamada', true, false]]);
  });

  it('monta o job da cena; recusa pedido vazio e corte impossível; cartão igual não conta', () => {
    const body = AdjustRequestSchema.parse({ target: 'scene', lessonId, nodeId: 'v01', drop: ['s2'], cut: [{ shotId: 's1', side: 'first' }], teaser: 'Você organiza campeonatos. Isso entra no currículo?' }) as Extract<ReturnType<typeof AdjustRequestSchema.parse>, { target: 'scene' }>;
    const j = sceneAdjustJob(body, doc, source);
    if ('error' in j) throw new Error(j.error);
    expect(j.nodeId).toBe('v01');
    expect(j.input).toEqual({ kind: 'adjust', target: 'scene', adjustOf: 'mjb_origem', request: { drop: ['s2'], cut: [{ shotId: 's1', side: 'first' }], teaser: 'Você organiza campeonatos. Isso entra no currículo?' } });
    expect(j.sceneHash).toMatch(/^[0-9a-f]{64}$/);
    const same = sceneAdjustJob({ ...body, drop: [], cut: [], teaser: 'Isso entra?' }, doc, source);
    expect(same).toEqual({ error: expect.stringMatching(/Nada a ajustar/) });
    expect(sceneAdjustJob({ ...body, drop: [], cut: [{ shotId: 's2', side: 'last' }], teaser: undefined }, doc, source)).toEqual({ error: expect.stringMatching(/última frase/) });
  });

  it('reação: só com interjeição de abertura e vídeo; nó "decisão~opção"', () => {
    const j = reactionAdjustJob({ target: 'reaction', lessonId, choiceId: 'q01', optionId: 'a' }, doc);
    if ('error' in j) throw new Error(j.error);
    expect(j.nodeId).toBe('q01~a');
    expect(j.input).toEqual({ kind: 'adjust', target: 'reaction', choiceId: 'q01', optionId: 'a' });
    expect(reactionAdjustJob({ target: 'reaction', lessonId, choiceId: 'q01', optionId: 'b' }, doc)).toEqual({ error: 'A reação já começa direto no conteúdo' });
  });
});
