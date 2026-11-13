import type { reports } from '@lms/db';
import { csvCell } from './alunos-csv';

/*
 * CSV do relatório de progresso (exportação do estúdio). Formato pensado para abrir no Excel em português:
 * BOM UTF-8, separador `;`, quebra de linha CRLF, células à prova de injeção de fórmula (`csvCell`: `= + - @` ganham apóstrofo).
 * Datas em horário de Brasília (`dd/mm/aaaa hh:mm`). Sem telefone e sem nome de arquivo ou link de entrega da tarefa. As respostas das reflexões (texto livre do aluno) saem em colunas próprias.
 */

type Row = reports.ProgressRow;

export const BOM = '﻿';
export const SEP = ';';

const TASK_LABEL: Record<string, string> = { pendente: 'Pendente', enviada: 'Enviada', aprovada: 'Aprovada', devolvida: 'Devolvida' };
const STATUS_LABEL: Record<Row['status_matricula'], string> = { active: 'Em andamento', completed: 'Concluída', canceled: 'Cancelada' };

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export function brDate(iso: string | null): string {
  if (!iso) return '';
  const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
}

export interface AssessmentColumn {
  key: string;
  header: string;
}

const colKey = (r: Row, a: Row['avaliacoes'][number]) => `${r.curso.id}\u0000${a.aula_id}\u0000${a.grupo_id}`;

/**
 * Uma coluna por grupo de avaliação (bloco `AV..`), na ordem em que aparecem (curso, depois aula). Cabeçalho:
 * `Avaliação: <aula> (acertos/total)`; com mais de um bloco na mesma aula, `Avaliação: <aula> · <bloco> (acertos/total)`;
 * com mais de um curso no arquivo, o título do curso vem antes: `Avaliação: <curso> › <aula> (acertos/total)`.
 */
export function assessmentColumns(rows: Row[]): AssessmentColumn[] {
  const seen = new Map<string, { curso: string; cursoId: string; aula: string; aulaId: string; titulo: string }>();
  for (const r of rows) for (const a of r.avaliacoes) if (!seen.has(colKey(r, a))) seen.set(colKey(r, a), { curso: r.curso.titulo, cursoId: r.curso.id, aula: a.aula, aulaId: a.aula_id, titulo: a.titulo });
  const items = [...seen.entries()];
  const multiCourse = new Set(items.map(([, v]) => v.cursoId)).size > 1;
  const perLesson = new Map<string, number>();
  for (const [, v] of items) perLesson.set(`${v.cursoId}|${v.aulaId}`, (perLesson.get(`${v.cursoId}|${v.aulaId}`) ?? 0) + 1);
  return items.map(([key, v]) => {
    const many = (perLesson.get(`${v.cursoId}|${v.aulaId}`) ?? 0) > 1;
    const name = `${multiCourse ? `${v.curso} › ` : ''}${v.aula}${many ? ` · ${v.titulo}` : ''}`;
    return { key, header: `Avaliação: ${name} (acertos/total)` };
  });
}

const reflKey = (r: Row, x: Row['reflexoes'][number]) => `${r.curso.id}\u0000${x.aula_id}\u0000${x.cena}`;

/**
 * Uma coluna por cena de reflexão, na ordem do curso (aula, depois cena), logo depois das avaliações. Cabeçalho:
 * `Resposta: <aula> · <cena>`; com mais de um curso no arquivo, `Resposta: <curso> › <aula> · <cena>`. Curso sem reflexão: nenhuma coluna.
 * A célula é o texto da resposta mais recente (vazia se não respondeu); `csvCell` cuida de aspas, quebras de linha e fórmulas.
 */
export function reflectionColumns(rows: Row[]): AssessmentColumn[] {
  const seen = new Map<string, { curso: string; cursoId: string; aula: string; titulo: string }>();
  for (const r of rows) for (const x of r.reflexoes ?? []) if (!seen.has(reflKey(r, x))) seen.set(reflKey(r, x), { curso: r.curso.titulo, cursoId: r.curso.id, aula: x.aula, titulo: x.titulo });
  const items = [...seen.entries()];
  const multiCourse = new Set(items.map(([, v]) => v.cursoId)).size > 1;
  return items.map(([key, v]) => ({ key, header: `Resposta: ${multiCourse ? `${v.curso} › ` : ''}${v.aula} · ${v.titulo}` }));
}

/** `2/3 aprovado`, `1/3 reprovado`, `1/3 em andamento`; vazio se ainda não respondeu nada. O texto depois da fração evita que o Excel leia `2/3` como data. */
export function assessmentCell(a: Row['avaliacoes'][number] | undefined): string {
  if (!a || a.respondidas === 0) return '';
  const state = a.aprovado === true ? 'aprovado' : a.aprovado === false ? 'reprovado' : 'em andamento';
  return `${a.acertos}/${a.total} ${state}`;
}

export const FIXED_HEADERS = [
  'Nome',
  'E-mail',
  'RGM',
  'Curso',
  'Código do curso',
  'Situação da matrícula',
  'Matriculado em (Brasília)',
  'Primeiro acesso (Brasília)',
  'Último acesso (Brasília)',
  'Aulas concluídas',
  'Aulas obrigatórias',
] as const;
export const TAIL_HEADERS = ['Tarefa obrigatória', 'Tarefas aprovadas', 'Tarefas obrigatórias', 'Curso concluído', 'Concluído em (Brasília)', 'Código do certificado'] as const;

export function progressToCsv(rows: Row[]): string {
  const cols = assessmentColumns(rows);
  const rcols = reflectionColumns(rows);
  const header = [...FIXED_HEADERS, ...cols.map((c) => c.header), ...rcols.map((c) => c.header), ...TAIL_HEADERS];
  const lines = [header.map((c) => csvCell(c, SEP)).join(SEP)];
  for (const r of rows) {
    const byKey = new Map(r.avaliacoes.map((a) => [colKey(r, a), a]));
    const reflBy = new Map((r.reflexoes ?? []).map((x) => [reflKey(r, x), x]));
    const cells = [
      r.aluno.nome,
      r.aluno.email,
      r.aluno.rgm ?? '',
      r.curso.titulo,
      r.curso.slug,
      STATUS_LABEL[r.status_matricula],
      brDate(r.matriculado_em),
      brDate(r.primeiro_acesso),
      brDate(r.ultimo_acesso),
      String(r.aulas_concluidas),
      String(r.aulas_total),
      ...cols.map((c) => assessmentCell(byKey.get(c.key))),
      ...rcols.map((c) => reflBy.get(c.key)?.resposta ?? ''),
      r.tarefa.status ? TASK_LABEL[r.tarefa.status]! : 'Sem tarefa',
      String(r.tarefa.aprovadas),
      String(r.tarefa.total),
      r.curso_concluido ? 'Sim' : 'Não',
      brDate(r.concluido_em),
      r.certificado_codigo ?? '',
    ];
    lines.push(cells.map((c) => csvCell(c, SEP)).join(SEP));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}
