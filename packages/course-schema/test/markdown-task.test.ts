import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allLessons } from '../src/course';
import { importMarkdownCourse, MarkdownCourseError, parseMarkdownCourse, type ParsedTask } from '../src/import/markdown-course';
import type { AnyNode, TaskNode } from '../src/nodes';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXAMPLE = path.join(ROOT, 'docs/roteiros/exemplos/exemplo-cruzeiro-tarefa.md');

const VIDEO = `### V01 — Abertura
**Fala para gravação**
"Nesta aula você grava uma apresentação curta e envia o link para a correção. Diga seu nome, o curso e um objetivo."
Texto na tela: Nome · Curso · Objetivo
`;
const END = `### FIM — O que você levou
- Um minuto cabe muita coisa
- Sua entrega vai para um avaliador
`;
/** roteiro mínimo com uma tarefa; `task` é o corpo do bloco T01 */
const roteiro = (task: string, heading = '### T01 — Missão final') => `# Curso com tarefa

Ideia: Testar o bloco de tarefa.
Público: alunos.
Objetivo final: Ao final, a pessoa envia a entrega.
Duração-alvo: 1 aula de 3 a 5 minutos.

## Módulo 1 — Único

Descrição: Um módulo.

### Aula 1 — Entrega
Objetivo: Ao final, você envia a entrega.

${VIDEO}
${heading}
${task}

${END}`;

const FULL = `Entrega: link e arquivo
Instrução: Grave um vídeo de 1 minuto se apresentando e envie o link.
Critérios: Fala o nome e o curso · Cita um objetivo · Tem até 1 minuto
Correção: avaliador
Destino: FIM`;

const taskOf = (md: string): ParsedTask => {
  const scene = parseMarkdownCourse(md).modules[0]!.lessons[0]!.scenes.find((s) => s.kind === 'task');
  if (!scene || scene.kind !== 'task') throw new Error('sem tarefa');
  return scene;
};
const nodeOf = (md: string): TaskNode => {
  const { document } = importMarkdownCourse(md);
  const node = allLessons(document).flatMap((l) => l.graph.nodes).find((n: AnyNode) => n.type === 'task');
  if (!node || node.type !== 'task') throw new Error('sem nó de tarefa');
  return node;
};
const fails = (md: string, re: RegExp) => {
  let err: unknown;
  try {
    parseMarkdownCourse(md);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(MarkdownCourseError);
  expect((err as Error).message).toMatch(re);
};

describe('importador: bloco T (tarefa com entrega)', () => {
  it('lê o bloco completo do plano', () => {
    expect(taskOf(roteiro(FULL))).toEqual({
      kind: 'task',
      code: 'T01',
      title: 'Missão final',
      deliverable: 'link_file',
      fileKinds: ['pdf', 'image'],
      instruction: 'Grave um vídeo de 1 minuto se apresentando e envie o link.',
      criteria: ['Fala o nome e o curso', 'Cita um objetivo', 'Tem até 1 minuto'],
      review: 'manual',
      required: true,
      destination: 'FIM',
    });
  });

  it('gera o nó task executável, ligado ao destino, e o curso compila sem erros', () => {
    const r = importMarkdownCourse(roteiro(FULL));
    expect(r.compile.errors).toEqual([]);
    const lesson = allLessons(r.document)[0]!;
    const node = lesson.graph.nodes.find((n) => n.type === 'task') as TaskNode;
    expect(node).toMatchObject({
      id: 't01',
      type: 'task',
      title: 'Missão final',
      required: true,
      deliverable: 'link_file',
      fileKinds: ['pdf', 'image'],
      review: 'manual',
      instruction: 'Grave um vídeo de 1 minuto se apresentando e envie o link.',
      criteria: [
        { id: 'c1', label: 'Fala o nome e o curso' },
        { id: 'c2', label: 'Cita um objetivo' },
        { id: 'c3', label: 'Tem até 1 minuto' },
      ],
    });
    const out = lesson.graph.edges.filter((e) => e.from === 't01');
    expect(out).toHaveLength(1);
    expect(lesson.graph.nodes.find((n) => n.id === out[0]!.to)?.type).toBe('end');
    // o vídeo anterior segue para a tarefa
    expect(lesson.graph.edges.some((e) => e.from === 'v01' && e.to === 't01')).toBe(true);
    expect(r.document.objectives[0]?.criterion).toMatch(/envia a entrega de T01/i);
  });

  it('padrões: sem "Entrega" vale link; sem "Correção" vale avaliador; sem "Obrigatória" vale sim', () => {
    const t = taskOf(roteiro('Instrução: Envie o link.\nCritérios: Abre\nDestino: FIM'));
    expect(t).toMatchObject({ deliverable: 'link', review: 'manual', required: true, fileKinds: ['pdf', 'image'], criteria: ['Abre'] });
  });

  it('variações: entrega só link, correção automática, não obrigatória, arquivos só PDF', () => {
    const t = taskOf(roteiro('Entrega: link\nInstrução: Cole o link do perfil.\nCritérios: O perfil abre · Tem foto\nCorreção: automática\nObrigatória: não\nDestino: FIM'));
    expect(t).toMatchObject({ deliverable: 'link', review: 'auto', required: false });
    const pdf = taskOf(roteiro('Entrega: link e arquivo\nArquivos: PDF\nInstrução: Envie.\nCritérios: Abre\nDestino: FIM'));
    expect(pdf.fileKinds).toEqual(['pdf']);
    const img = taskOf(roteiro('Entrega: Link e Arquivo\nArquivos: imagem, pdf\nInstrução: Envie.\nCritérios: Abre\nCorreção: Automatica\nDestino: FIM'));
    expect(img).toMatchObject({ deliverable: 'link_file', fileKinds: ['image', 'pdf'], review: 'auto' });
  });

  it('correção automática com critérios importa com aviso (os critérios viram orientação)', () => {
    const r = importMarkdownCourse(roteiro(FULL.replace('avaliador', 'automática')));
    expect(r.compile.errors).toEqual([]);
    expect(r.compile.warnings.map((w) => w.code)).toContain('TASK_AUTO_CRITERIA');
    expect(nodeOf(roteiro(FULL.replace('avaliador', 'automática'))).review).toBe('auto');
    expect(importMarkdownCourse(roteiro(FULL)).compile.warnings.map((w) => w.code)).not.toContain('TASK_AUTO_CRITERIA');
  });

  it('a instrução continua nas linhas seguintes, mesmo com dois-pontos no texto', () => {
    const t = taskOf(roteiro('Entrega: link\nInstrução: Grave o vídeo.\nDica: use o celular na horizontal.\nDepois, envie o link.\nCritérios: Abre\nDestino: FIM'));
    expect(t.instruction).toBe('Grave o vídeo. Dica: use o celular na horizontal. Depois, envie o link.');
    expect(t.criteria).toEqual(['Abre']);
  });

  it('aceita qualquer número no código e o travessão simples', () => {
    expect(taskOf(roteiro(FULL, '### T12 - Entrega do módulo')).code).toBe('T12');
  });

  it('erros de formato param o roteiro com a mensagem certa', () => {
    fails(roteiro('Entrega: link\nCritérios: Abre\nDestino: FIM'), /tarefa T01 sem "Instrução:"/);
    fails(roteiro('Entrega: link\nInstrução: Envie.\nDestino: FIM'), /tarefa T01 sem "Critérios:"/);
    fails(roteiro('Entrega: link\nInstrução: Envie.\nCritérios:\nDestino: FIM'), /tarefa T01 sem "Critérios:"/);
    fails(roteiro('Entrega: link\nInstrução: Envie.\nCritérios: Abre'), /tarefa T01 sem "Destino:"/);
    fails(roteiro('Entrega: vídeo\nInstrução: Envie.\nCritérios: Abre\nDestino: FIM'), /entrega "vídeo" desconhecida/);
    fails(roteiro('Entrega: link\nInstrução: Envie.\nCritérios: Abre\nCorreção: robô\nDestino: FIM'), /correção "robô" desconhecida/);
    fails(roteiro('Entrega: link e arquivo\nArquivos: planilha\nInstrução: Envie.\nCritérios: Abre\nDestino: FIM'), /tipo de arquivo "planilha" desconhecido/);
    const eleven = Array.from({ length: 11 }, (_, i) => `Item ${i + 1}`).join(' · ');
    fails(roteiro(`Entrega: link\nInstrução: Envie.\nCritérios: ${eleven}\nDestino: FIM`), /11 critérios \(máximo 10\)/);
  });

  it('destino inexistente e código repetido seguem as regras das outras cenas', () => {
    expect(() => importMarkdownCourse(roteiro(FULL.replace('Destino: FIM', 'Destino: V99')))).toThrow(/destino "V99" de T01 não existe/);
    expect(() => parseMarkdownCourse(roteiro(`${FULL}\n\n### T01 — De novo\n${FULL}`))).toThrow(/código T01 repetido/);
  });

  it('o roteiro de exemplo importa sem erros, com as duas tarefas', () => {
    const r = importMarkdownCourse(readFileSync(EXAMPLE, 'utf8'));
    expect(r.compile.errors).toEqual([]);
    const tasks = allLessons(r.document).flatMap((l) => l.graph.nodes).filter((n): n is TaskNode => n.type === 'task');
    expect(tasks.map((t) => [t.id, t.deliverable, t.review, t.required, t.criteria.length])).toEqual([
      ['t01', 'link_file', 'manual', true, 3],
      ['t02', 'link', 'auto', false, 2],
    ]);
    expect(r.compile.warnings.filter((w) => w.code.startsWith('TASK')).map((w) => [w.code, w.nodeId])).toEqual([['TASK_AUTO_CRITERIA', 't02']]);
  });
});
