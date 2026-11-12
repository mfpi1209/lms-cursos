import { describe, expect, it } from 'vitest';
import { compileLesson } from '../src/compile';
import { AnyNodeSchema, ExecutableNodeSchema, TASK_LINK_MAX, checkTaskLink, isExecutableNodeType, taskAcceptedMime, taskDeliverableOf, taskInstructionOf, type AnyNode } from '../src/nodes';
import { linearGraph } from './helpers';

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('tarefa com entrega (schema e compilador)', () => {
  const tarefa = (over: Record<string, unknown> = {}): AnyNode =>
    AnyNodeSchema.parse({
      id: 'tarefa',
      type: 'task',
      title: 'Missão final',
      instruction: 'Grave um vídeo de 1 minuto e envie o link.',
      deliverable: 'link_file',
      criteria: [
        { id: 'c1', label: 'Fala o nome e o curso' },
        { id: 'c2', label: 'Tem até 1 minuto' },
      ],
      ...over,
    });
  /** a decisão `ca` vai para a tarefa, que segue para o encerramento */
  const withTask = (node: AnyNode) => {
    const g = linearGraph();
    g.nodes.push(node);
    g.edges = g.edges.map((e) => (e.id === 'e4' ? { ...e, to: 'tarefa' } : e));
    g.edges.push({ id: 'e6', from: 'tarefa', to: 'fim' });
    return g;
  };
  const task = (list: { code: string }[]) => codes(list).filter((c) => c.startsWith('TASK'));

  it('é executável: uma tarefa completa compila, com os padrões (correção manual, obrigatória, PDF e imagem)', () => {
    const node = tarefa();
    expect(isExecutableNodeType('task')).toBe(true);
    expect(ExecutableNodeSchema.safeParse(node).success).toBe(true);
    expect(node).toMatchObject({ review: 'manual', required: true, fileKinds: ['pdf', 'image'] });
    const r = compileLesson(withTask(node));
    expect(codes(r.errors)).toEqual([]);
    expect(task(r.warnings)).toEqual([]);
    expect(codes(r.warnings)).not.toContain('NO_OBJECTIVE');
  });

  it('os outros tipos planejados continuam bloqueados', () => {
    for (const t of ['dialogue', 'evidence', 'resource_simulation', 'ai_feedback']) expect(isExecutableNodeType(t)).toBe(false);
    const g = linearGraph();
    g.nodes.push({ id: 'ev', type: 'evidence', objectiveIds: [], required: true, instructions: { type: 'doc', content: [] }, acceptedKinds: ['text'] });
    expect(codes(compileLesson(g).errors)).toContain('NODE_TYPE_NOT_EXECUTABLE');
  });

  it('sem título, instrução ou critérios não publica (o rascunho em branco salva)', () => {
    const blank = AnyNodeSchema.parse({ id: 'tarefa', type: 'task' });
    expect(task(compileLesson(withTask(blank)).errors)).toEqual(['TASK_TITLE', 'TASK_INSTRUCTION', 'TASK_CRITERIA']);
    expect(task(compileLesson(withTask(tarefa({ instruction: '   ' }))).errors)).toEqual(['TASK_INSTRUCTION']);
    expect(task(compileLesson(withTask(tarefa({ criteria: [] }))).errors)).toEqual(['TASK_CRITERIA']);
  });

  it('aceita de 1 a 10 critérios; recusa o 11º e avisa de critério repetido', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `c${i + 1}`, label: `Critério ${i + 1}` }));
    expect(AnyNodeSchema.safeParse({ id: 'tarefa', type: 'task', criteria: many }).success).toBe(false);
    expect(AnyNodeSchema.safeParse({ id: 'tarefa', type: 'task', criteria: many.slice(0, 10) }).success).toBe(true);
    expect(AnyNodeSchema.safeParse({ id: 'tarefa', type: 'task', criteria: [{ id: 'c1', label: '   ' }] }).success).toBe(false);
    expect(task(compileLesson(withTask(tarefa({ criteria: [{ id: 'c1', label: 'A' }, { id: 'c1', label: 'B' }] }))).errors)).toEqual(['TASK_CRITERION_DUPLICATE']);
  });

  it('correção automática com critérios só avisa', () => {
    const r = compileLesson(withTask(tarefa({ review: 'auto' })));
    expect(task(r.errors)).toEqual([]);
    expect(task(r.warnings)).toEqual(['TASK_AUTO_CRITERIA']);
  });

  it('recusa tipo de arquivo desconhecido e lista vazia', () => {
    expect(AnyNodeSchema.safeParse({ id: 'tarefa', type: 'task', fileKinds: ['exe'] }).success).toBe(false);
    expect(AnyNodeSchema.safeParse({ id: 'tarefa', type: 'task', fileKinds: [] }).success).toBe(false);
    expect(AnyNodeSchema.safeParse({ id: 'tarefa', type: 'task', deliverable: 'video' }).success).toBe(false);
  });

  it('aceita o contrato antigo: instructions em texto rico e deliverable text/file', () => {
    const old = AnyNodeSchema.parse({
      id: 'tarefa',
      type: 'task',
      title: 'Antiga',
      instructions: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Envie o arquivo.' }] }] },
      deliverable: 'file',
      rubricId: 'r1',
      criteria: [{ id: 'c1', label: 'Enviou' }],
    });
    if (old.type !== 'task') throw new Error('tipo');
    expect(taskInstructionOf(old)).toBe('Envie o arquivo.');
    expect(taskDeliverableOf(old)).toBe('link_file');
    expect(taskDeliverableOf({ deliverable: 'text' })).toBe('link');
    expect(taskAcceptedMime(old)).toEqual(['application/pdf', 'image/png', 'image/jpeg']);
    expect(taskAcceptedMime({ deliverable: 'link', fileKinds: ['pdf'] })).toEqual([]);
    expect(taskAcceptedMime({ deliverable: 'link_file', fileKinds: ['pdf'] })).toEqual(['application/pdf']);
    const r = compileLesson(withTask(old));
    expect(task(r.errors)).toEqual([]);
    expect(task(r.warnings)).toEqual(['TASK_LEGACY_DELIVERABLE']);
  });

  it('confere o link: só https, até 2.000 caracteres, sem espaço nem usuário embutido', () => {
    expect(checkTaskLink(' https://youtu.be/abc ')).toEqual({ ok: true, link: 'https://youtu.be/abc' });
    for (const bad of ['', 'http://exemplo.com/x', 'javascript:alert(1)', 'https://', 'https://localhost', 'https://a b.com', 'https://user:senha@exemplo.com', 'ftp://exemplo.com', 42, null]) expect(checkTaskLink(bad).ok, String(bad)).toBe(false);
    expect(checkTaskLink(`https://exemplo.com/${'a'.repeat(TASK_LINK_MAX)}`).ok).toBe(false);
    expect(checkTaskLink(`https://exemplo.com/${'a'.repeat(TASK_LINK_MAX - 20)}`).ok).toBe(true);
  });
});
