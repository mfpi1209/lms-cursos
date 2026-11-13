import { describe, expect, it } from 'vitest';
import type { reports } from '@lms/db';
import { assessmentCell, assessmentColumns, brDate, progressToCsv } from './progresso-csv';
import { parseCsvCells } from './alunos-csv';

type Row = reports.ProgressRow;
const av = (over: Partial<Row['avaliacoes'][number]> = {}): Row['avaliacoes'][number] => ({ aula_id: 'aula_1', aula: 'Aula 1', grupo_id: 'av1', titulo: 'Revisão', acertos: 2, total: 3, respondidas: 3, aprovado: true, ...over });
const rf = (over: Partial<Row['reflexoes'][number]> = {}): Row['reflexoes'][number] => ({ aula_id: 'aula_1', aula: 'Aula 1', cena: 'missao', titulo: 'Missão', obrigatoria: true, resposta: 'https://exemplo.com/entrega', respondida_em: '2026-03-11T12:00:00.000Z', ...over });
const row = (over: Partial<Row> = {}): Row => ({
  matricula_id: 'enr_1',
  status_matricula: 'active',
  aluno: { id: 'usr_1', nome: 'Maria Souza', email: 'maria@exemplo.com', rgm: '12345' },
  curso: { id: 'crs_1', slug: 'primeiro-emprego', titulo: 'Primeiro emprego' },
  matriculado_em: '2026-03-10T15:30:00.000Z',
  primeiro_acesso: '2026-03-10T16:00:00.000Z',
  ultimo_acesso: '2026-03-12T02:59:00.000Z',
  atualizado_em: '2026-03-12T02:59:00.000Z',
  aulas_concluidas: 1,
  aulas_total: 2,
  avaliacoes: [av()],
  reflexoes: [],
  tarefa: { status: 'enviada', total: 1, pendentes: 0, enviadas: 1, aprovadas: 0, devolvidas: 0 },
  curso_concluido: false,
  concluido_em: null,
  certificado_codigo: null,
  ...over,
});
const parse = (csv: string) => parseCsvCells(csv.replace(/^﻿/, ''), ';').map((r) => r.cells);

describe('CSV do progresso', () => {
  it('começa com BOM UTF-8, separa por ; e termina com quebra de linha CRLF', () => {
    const csv = progressToCsv([row()]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    const [head, line] = parse(csv);
    expect(head).toContain('Nome');
    expect(head).toContain('Avaliação: Aula 1 (acertos/total)');
    expect(line!.length).toBe(head!.length);
    expect(line![0]).toBe('Maria Souza');
    expect(line![head!.indexOf('Avaliação: Aula 1 (acertos/total)')]).toBe('2/3 aprovado');
    expect(line![head!.indexOf('Tarefa obrigatória')]).toBe('Enviada');
    expect(line![head!.indexOf('Curso concluído')]).toBe('Não');
  });

  it('as datas saem em horário de Brasília', () => {
    expect(brDate('2026-03-10T15:30:00.000Z')).toBe('10/03/2026 12:30');
    expect(brDate('2026-03-12T02:59:00.000Z')).toBe('11/03/2026 23:59');
    expect(brDate(null)).toBe('');
    const [head, line] = parse(progressToCsv([row()]));
    expect(line![head!.indexOf('Matriculado em (Brasília)')]).toBe('10/03/2026 12:30');
  });

  it('uma coluna por grupo de avaliação; várias no mesmo curso viram colunas lado a lado, com linhas sem a avaliação em branco', () => {
    const a = row({ avaliacoes: [av(), av({ aula_id: 'aula_2', aula: 'Aula 2', grupo_id: 'av2', acertos: 1, aprovado: false })] });
    const b = row({ matricula_id: 'enr_2', aluno: { id: 'u2', nome: 'João', email: 'j@x.com', rgm: null }, avaliacoes: [av({ respondidas: 0, acertos: 0, aprovado: null }), av({ aula_id: 'aula_2', aula: 'Aula 2', grupo_id: 'av2', acertos: 1, respondidas: 2, aprovado: null })] });
    const rows = parse(progressToCsv([a, b]));
    const head = rows[0]!;
    const i1 = head.indexOf('Avaliação: Aula 1 (acertos/total)');
    const i2 = head.indexOf('Avaliação: Aula 2 (acertos/total)');
    expect(i1).toBeGreaterThan(0);
    expect(i2).toBe(i1 + 1);
    expect(rows[1]![i2]).toBe('1/3 reprovado');
    expect(rows[2]![i1]).toBe('');
    expect(rows[2]![i2]).toBe('1/3 em andamento');
  });

  it('dois blocos na mesma aula ganham o título do bloco; vários cursos ganham o título do curso', () => {
    const two = row({ avaliacoes: [av(), av({ grupo_id: 'av2', titulo: 'Revisão final' })] });
    expect(assessmentColumns([two]).map((c) => c.header)).toEqual(['Avaliação: Aula 1 · Revisão (acertos/total)', 'Avaliação: Aula 1 · Revisão final (acertos/total)']);
    const other = row({ curso: { id: 'crs_2', slug: 'outro', titulo: 'Outro curso' } });
    expect(assessmentColumns([row(), other]).map((c) => c.header)).toEqual(['Avaliação: Primeiro emprego › Aula 1 (acertos/total)', 'Avaliação: Outro curso › Aula 1 (acertos/total)']);
  });

  it('a fração vem com texto, para o Excel não ler 2/3 como data', () => {
    expect(assessmentCell(av())).toBe('2/3 aprovado');
    expect(assessmentCell(av({ acertos: 0, aprovado: false }))).toBe('0/3 reprovado');
    expect(assessmentCell(undefined)).toBe('');
  });

  it('células que começam com = + - @ (ou tab) ganham apóstrofo; aspas, ; e quebras são protegidas', () => {
    const evil = row({
      aluno: { id: 'u', nome: '=HYPERLINK("http://x.com";"clique")', email: '+cmd|calc@x.com', rgm: '-1+1' },
      curso: { id: 'crs_1', slug: '@soma', titulo: 'Curso; "com" aspas\ne linha' },
      avaliacoes: [av({ aula: '=1+1' })],
    });
    const csv = progressToCsv([evil]);
    const [head, line] = parse(csv);
    expect(line![0]).toBe(`'=HYPERLINK("http://x.com";"clique")`);
    expect(line![1]).toBe("'+cmd|calc@x.com");
    expect(line![2]).toBe("'-1+1");
    expect(line![3]).toBe('Curso; "com" aspas\ne linha');
    expect(line![4]).toBe("'@soma");
    expect(head!.some((h) => h.startsWith('Avaliação: =1+1'))).toBe(true); // o texto dentro do cabeçalho não começa a célula
    // nenhuma célula (cabeçalho incluso) começa com caractere de fórmula
    for (const cell of [...head!, ...line!]) expect(/^[=+\-@\t\r]/.test(cell)).toBe(false);
  });

  it('curso concluído: Sim, data e código do certificado vazio; sem tarefa obrigatória: "Sem tarefa"', () => {
    const done = row({ status_matricula: 'completed', curso_concluido: true, concluido_em: '2026-03-15T13:00:00.000Z', tarefa: { status: null, total: 0, pendentes: 0, enviadas: 0, aprovadas: 0, devolvidas: 0 } });
    const [head, line] = parse(progressToCsv([done]));
    expect(line![head!.indexOf('Curso concluído')]).toBe('Sim');
    expect(line![head!.indexOf('Concluído em (Brasília)')]).toBe('15/03/2026 10:00');
    expect(line![head!.indexOf('Tarefa obrigatória')]).toBe('Sem tarefa');
    expect(line![head!.indexOf('Código do certificado')]).toBe('');
    expect(line![head!.indexOf('Situação da matrícula')]).toBe('Concluída');
  });

  it('sem linhas, só o cabeçalho', () => {
    const lines = progressToCsv([]).trim().split('\r\n');
    expect(lines).toHaveLength(1);
  });

  it('curso sem reflexão: nenhuma coluna "Resposta:"', () => {
    const [head, line] = parse(progressToCsv([row()]));
    expect(head!.some((h) => h.startsWith('Resposta:'))).toBe(false);
    expect(line!.length).toBe(head!.length);
  });

  it('uma coluna por cena de reflexão, depois das avaliações e antes da cauda; sem resposta fica vazia', () => {
    const a = row({ reflexoes: [rf(), rf({ aula_id: 'aula_2', aula: 'Aula 2', cena: 'r2', titulo: 'Fechamento', resposta: null, respondida_em: null })] });
    const b = row({ matricula_id: 'enr_2', reflexoes: [rf({ resposta: null, respondida_em: null }), rf({ aula_id: 'aula_2', aula: 'Aula 2', cena: 'r2', titulo: 'Fechamento', resposta: 'Aprendi a pedir ajuda' })] });
    const [head, l1, l2] = parse(progressToCsv([a, b]));
    const i1 = head!.indexOf('Resposta: Aula 1 · Missão');
    const i2 = head!.indexOf('Resposta: Aula 2 · Fechamento');
    expect(i1).toBeGreaterThan(head!.indexOf('Avaliação: Aula 1 (acertos/total)'));
    expect(i2).toBe(i1 + 1);
    expect(head![i2 + 1]).toBe('Tarefa obrigatória');
    expect(l1![i1]).toBe('https://exemplo.com/entrega');
    expect(l1![i2]).toBe('');
    expect(l2![i1]).toBe('');
    expect(l2![i2]).toBe('Aprendi a pedir ajuda');
    expect(l1!.length).toBe(head!.length);
  });

  it('resposta com vírgula, ponto e vírgula, aspas, quebra de linha e fórmula é protegida', () => {
    const texts = ['a, b; c', 'ele disse "oi"', 'linha 1\nlinha 2\r\nlinha 3', '=HYPERLINK("http://x.com";"clique")', '+1', '-2', '@soma'];
    const rows = texts.map((resposta, i) => row({ matricula_id: `enr_${i}`, reflexoes: [rf({ resposta })] }));
    const parsed = parse(progressToCsv(rows));
    const idx = parsed[0]!.indexOf('Resposta: Aula 1 · Missão');
    expect(parsed).toHaveLength(texts.length + 1);
    expect(parsed[1]![idx]).toBe('a, b; c');
    expect(parsed[2]![idx]).toBe('ele disse "oi"');
    expect(parsed[3]![idx]).toBe('linha 1\nlinha 2\r\nlinha 3');
    expect(parsed[4]![idx]).toBe(`'=HYPERLINK("http://x.com";"clique")`);
    expect(parsed[5]![idx]).toBe("'+1");
    expect(parsed[6]![idx]).toBe("'-2");
    expect(parsed[7]![idx]).toBe("'@soma");
  });

  it('com mais de um curso no arquivo, o cabeçalho leva o título do curso', () => {
    const other = row({ matricula_id: 'enr_9', curso: { id: 'crs_2', slug: 'outro', titulo: 'Outro curso' }, reflexoes: [rf()] });
    const [head] = parse(progressToCsv([row({ reflexoes: [rf()] }), other]));
    expect(head).toContain('Resposta: Primeiro emprego › Aula 1 · Missão');
    expect(head).toContain('Resposta: Outro curso › Aula 1 · Missão');
  });
});
