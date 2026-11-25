import { describe, expect, it } from 'vitest';
import {
  STALE_DAYS,
  biggestDrop,
  buildTrackRow,
  filtersHref,
  lessonSteps,
  matchesSearch,
  parseFilters,
  relativeDays,
  shares,
  situacaoOf,
  overallSituacao,
  sortRows,
  sortStudents,
  summarizeByStudent,
  summarize,
  summarizeByCourse,
  type ProgressLike,
} from './acompanhamento';

const NOW = new Date('2026-11-25T15:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

let seq = 0;
function progress(over: Partial<ProgressLike> & { nome?: string; cursoSlug?: string } = {}): ProgressLike {
  seq += 1;
  const { nome, cursoSlug: curso, ...rest } = over;
  return {
    matricula_id: `enr_${seq}`,
    status_matricula: 'active',
    aluno: { id: `usr_${nome ?? seq}`, nome: nome ?? `Aluno ${seq}`, email: `a${seq}@x.com`, rgm: null },
    curso: { id: `crs_${curso ?? 'a'}`, slug: curso ?? 'a', titulo: `Curso ${curso ?? 'a'}` },
    matriculado_em: daysAgo(30).toISOString(),
    ultimo_acesso: null,
    aulas_concluidas: 0,
    aulas_total: 4,
    avaliacoes: [],
    tarefa: { status: null },
    concluido_em: null,
    certificado_codigo: null,
    ...rest,
  };
}
const act = (attempts: number, lastDaysAgo: number | null) => ({ attempts, firstActivity: null, lastActivity: lastDaysAgo === null ? null : daysAgo(lastDaysAgo) });

describe('situacaoOf', () => {
  it('classifica pela ordem cancelada > concluiu > não começou > parado > em dia', () => {
    expect(situacaoOf({ status: 'canceled', started: true, lastStudy: daysAgo(1) }, NOW)).toBe('cancelada');
    expect(situacaoOf({ status: 'completed', started: true, lastStudy: daysAgo(90) }, NOW)).toBe('concluiu');
    expect(situacaoOf({ status: 'active', started: false, lastStudy: null }, NOW)).toBe('nao_comecou');
    expect(situacaoOf({ status: 'active', started: true, lastStudy: daysAgo(STALE_DAYS + 1) }, NOW)).toBe('parado');
    expect(situacaoOf({ status: 'active', started: true, lastStudy: daysAgo(STALE_DAYS - 1) }, NOW)).toBe('em_dia');
  });
  it('começou sem data de atividade conta como parado', () => {
    expect(situacaoOf({ status: 'active', started: true, lastStudy: null }, NOW)).toBe('parado');
  });
});

describe('buildTrackRow', () => {
  it('calcula progresso, avaliações e dias parado', () => {
    const r = buildTrackRow(
      progress({ aulas_concluidas: 1, avaliacoes: [{ aprovado: true }, { aprovado: false }, { aprovado: null }], tarefa: { status: 'devolvida' } }),
      act(3, 20),
      NOW,
    );
    expect(r).toMatchObject({ percent: 25, assessmentsPassed: 1, assessmentsFailed: 1, assessmentsTotal: 3, task: 'devolvida', situacao: 'parado', idleDays: 20 });
  });
  it('sem tentativa e sem aula concluída = não começou, mesmo tendo entrado na plataforma', () => {
    const r = buildTrackRow(progress({ ultimo_acesso: daysAgo(0).toISOString() }), undefined, NOW);
    expect(r.situacao).toBe('nao_comecou');
    expect(r.lastStudy).toBeNull();
    expect(r.lastAccess).not.toBeNull();
  });
  it('concluído vale 100% e curso sem aulas obrigatórias vale 0%', () => {
    expect(buildTrackRow(progress({ status_matricula: 'completed', aulas_concluidas: 2 }), act(2, 3), NOW).percent).toBe(100);
    expect(buildTrackRow(progress({ aulas_total: 0 }), act(1, 1), NOW).percent).toBe(0);
  });
});

describe('summarize', () => {
  const rows = [
    buildTrackRow(progress({ nome: 'ana', status_matricula: 'completed', aulas_concluidas: 4, certificado_codigo: 'X1' }), act(4, 2), NOW),
    buildTrackRow(progress({ nome: 'ana', cursoSlug: 'b', aulas_concluidas: 2 }), act(2, 1), NOW),
    buildTrackRow(progress({ nome: 'bia', aulas_concluidas: 1 }), act(1, 40), NOW),
    buildTrackRow(progress({ nome: 'caio' }), undefined, NOW),
    buildTrackRow(progress({ nome: 'dani', status_matricula: 'canceled' }), act(1, 1), NOW),
  ];
  it('conta situações, alunos únicos, ativos e médias sem as canceladas', () => {
    const s = summarize(rows, NOW);
    expect(s.counts).toEqual({ concluiu: 1, em_dia: 1, parado: 1, nao_comecou: 1, cancelada: 1 });
    expect(s.enrollments).toBe(5);
    expect(s.students).toBe(4);
    expect(s.active7d).toBe(2); // ana (2 matrículas) e dani; bia parou há 40 dias
    expect(s.avgPercent).toBe(Math.round((100 + 50 + 25 + 0) / 4));
    expect(s.completionRate).toBe(25);
    expect(s.certificates).toBe(1);
  });
  it('resume por curso, do maior para o menor', () => {
    const by = summarizeByCourse(rows, NOW);
    expect(by.map((c) => [c.course.slug, c.enrollments])).toEqual([
      ['a', 4],
      ['b', 1],
    ]);
  });
});

describe('shares', () => {
  it('soma 100 e não dá ponto a quem tem zero', () => {
    expect(shares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(shares([0, 0])).toEqual([0, 0]);
    const p = shares([7, 0, 2, 991]);
    expect(p.reduce((n, x) => n + x, 0)).toBe(100);
    expect(p[1]).toBe(0);
  });
});

describe('lessonSteps / biggestDrop', () => {
  it('usa a ordem do curso e acha a maior queda', () => {
    const steps = lessonSteps(
      [
        { id: 'l1', title: 'Aula 1' },
        { id: 'l2', title: 'Aula 2' },
        { id: 'l3', title: 'Aula 3' },
      ],
      new Map([
        ['l1', { started: 10, completed: 9 }],
        ['l2', { started: 8, completed: 7 }],
        ['l3', { started: 3, completed: 2 }],
      ]),
      10,
    );
    expect(steps.map((s) => s.percent)).toEqual([90, 70, 20]);
    expect(biggestDrop(steps)).toEqual({ index: 2, lost: 5 });
    expect(biggestDrop(steps.slice(0, 1))).toBeNull();
  });
});

describe('filtros', () => {
  it('ignora valores inválidos e usa os padrões', () => {
    expect(parseFilters({ situacao: 'xyz', ordem: 'zzz', pagina: '-3', q: '  joão ' })).toEqual({ visao: 'matriculas', curso: '', situacao: '', q: 'joão', ordem: 'atencao', pagina: 1 });
    expect(parseFilters({ situacao: ['parado', 'x'], ordem: 'nome', pagina: '4', curso: 'c1' })).toMatchObject({ situacao: 'parado', ordem: 'nome', pagina: 4, curso: 'c1' });
  });
  it('monta o link sem os padrões e volta para a página 1 ao trocar filtro', () => {
    const f = parseFilters({ curso: 'c1', pagina: '3' });
    expect(filtersHref(f, { situacao: 'parado' })).toBe('/estudio/acompanhamento?curso=c1&situacao=parado');
    expect(filtersHref(f, { pagina: 2 })).toBe('/estudio/acompanhamento?curso=c1&pagina=2');
    expect(filtersHref(parseFilters({}), {})).toBe('/estudio/acompanhamento');
    expect(filtersHref(parseFilters({ visao: 'alunos' }), { q: 'ana' })).toBe('/estudio/acompanhamento?visao=alunos&q=ana');
  });
  it('busca sem acento e sem maiúsculas em nome, e-mail e RGM', () => {
    const r = buildTrackRow({ ...progress({ nome: 'João Conceição' }), aluno: { id: 'u', nome: 'João Conceição', email: 'JC@Escola.com', rgm: '12345' } }, undefined, NOW);
    expect(matchesSearch(r, 'conceicao')).toBe(true);
    expect(matchesSearch(r, 'escola')).toBe(true);
    expect(matchesSearch(r, '234')).toBe(true);
    expect(matchesSearch(r, 'maria')).toBe(false);
  });
});

describe('sortRows', () => {
  it('atenção primeiro: parados (há mais tempo), sem começar (matrícula mais antiga), em dia (menor progresso), concluídos', () => {
    const rows = [
      buildTrackRow(progress({ nome: 'em-dia-50', aulas_concluidas: 2 }), act(2, 1), NOW),
      buildTrackRow(progress({ nome: 'concluiu', status_matricula: 'completed' }), act(4, 1), NOW),
      buildTrackRow(progress({ nome: 'parado-20', aulas_concluidas: 1 }), act(1, 20), NOW),
      buildTrackRow(progress({ nome: 'novo', matriculado_em: daysAgo(2).toISOString() }), undefined, NOW),
      buildTrackRow(progress({ nome: 'parado-60', aulas_concluidas: 1 }), act(1, 60), NOW),
      buildTrackRow(progress({ nome: 'antigo', matriculado_em: daysAgo(50).toISOString() }), undefined, NOW),
      buildTrackRow(progress({ nome: 'em-dia-0' }), act(1, 0), NOW),
    ];
    expect(sortRows(rows, 'atencao').map((r) => r.student.name)).toEqual(['parado-60', 'parado-20', 'antigo', 'novo', 'em-dia-0', 'em-dia-50', 'concluiu']);
    expect(sortRows(rows, 'recentes')[0]!.student.name).toMatch(/em-dia-0/);
  });
});

describe('relativeDays', () => {
  it('fala em dias, semanas e meses', () => {
    expect(relativeDays(null, NOW)).toBe('nunca');
    expect(relativeDays(daysAgo(0), NOW)).toBe('hoje');
    expect(relativeDays(daysAgo(1), NOW)).toBe('ontem');
    expect(relativeDays(daysAgo(5), NOW)).toBe('há 5 dias');
    expect(relativeDays(daysAgo(21), NOW)).toBe('há 3 semanas');
    expect(relativeDays(daysAgo(95), NOW)).toBe('há 3 meses');
    expect(relativeDays(daysAgo(500), NOW)).toBe('há mais de um ano');
  });
});

describe('visão por aluno', () => {
  it('junta as matrículas da pessoa e calcula a situação geral', () => {
    const rows = [
      buildTrackRow(progress({ nome: 'ana', status_matricula: 'completed', certificado_codigo: 'C1' }), act(4, 30), NOW),
      buildTrackRow(progress({ nome: 'ana', cursoSlug: 'b', aulas_concluidas: 1 }), act(1, 20), NOW),
      buildTrackRow(progress({ nome: 'ana', cursoSlug: 'c', status_matricula: 'canceled' }), act(1, 1), NOW),
      buildTrackRow(progress({ nome: 'bia', aulas_concluidas: 2 }), act(2, 2), NOW),
      buildTrackRow(progress({ nome: 'bia', cursoSlug: 'b' }), undefined, NOW),
    ];
    const people = summarizeByStudent(rows, NOW);
    const ana = people.find((p) => p.student.id === 'usr_ana')!;
    expect(ana).toMatchObject({ courses: 2, situacao: 'parado', percent: Math.round((100 + 25) / 2), certificates: 1, idleDays: 1 });
    expect(ana.counts).toMatchObject({ concluiu: 1, parado: 1, cancelada: 1 });
    const bia = people.find((p) => p.student.id === 'usr_bia')!;
    expect(bia.situacao).toBe('em_dia');
    expect(sortStudents(people, 'atencao').map((p) => p.student.id)).toEqual(['usr_ana', 'usr_bia']);
  });
  it('situação geral: concluiu só se terminou todas; só canceladas = cancelada', () => {
    const c = (o: Partial<Record<'concluiu' | 'em_dia' | 'parado' | 'nao_comecou' | 'cancelada', number>>) => ({ concluiu: 0, em_dia: 0, parado: 0, nao_comecou: 0, cancelada: 0, ...o });
    expect(overallSituacao(c({ concluiu: 2 }))).toBe('concluiu');
    expect(overallSituacao(c({ concluiu: 1, nao_comecou: 1 }))).toBe('nao_comecou');
    expect(overallSituacao(c({ parado: 1, em_dia: 1 }))).toBe('em_dia');
    expect(overallSituacao(c({ cancelada: 2 }))).toBe('cancelada');
  });
});
