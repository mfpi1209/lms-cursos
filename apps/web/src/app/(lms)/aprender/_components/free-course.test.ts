import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Catalog, type CatalogItem } from './catalog';
import type { CourseTileData } from './course-tile';
import { FreeCourseCard, FreeCoursesSection } from './free-course-card';
import { FreeCourseHeader, FreeCourseModules, FreeCourseRemaining } from './free-course-view';
import { buildFreeCourseOutline } from '../_lib/free-course';
import { freeCardFixture, freeCourseDocument } from '../_lib/free-course-fixture';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('cartão do curso livre', () => {
  it('mostra título, instrutor, carga horária, módulos, aulas, progresso e a ação do estado real', () => {
    const h = renderToStaticMarkup(createElement(FreeCourseCard, { c: freeCardFixture(), testId: 'free-course-enr_ia' }));
    const t = text(h);
    expect(t).toContain('IA na prática para estudar e trabalhar');
    expect(t).toContain('com Thiago');
    expect(t).toContain('8 h');
    expect(t).toContain('8 horas de carga horária');
    expect(t).toContain('7 módulos');
    expect(t).toContain('21 aulas');
    expect(t).toContain('3 de 21 aulas concluídas');
    expect(h).toMatch(/role="progressbar"[^>]*aria-valuenow="14"[^>]*aria-valuetext="3 de 21 aulas concluídas"/);
    expect(h).toContain('data-testid="free-start" href="/aprender/enr_ia/aulas/aula_04"');
    expect(t).toContain('Continuar módulo 2');
    expect(h).toContain('data-testid="free-open" href="/aprender/enr_ia"');
    expect(h).toContain('data-testid="free-modules" href="/aprender/enr_ia"');
    // foto do instrutor: só do nosso domínio
    expect(h).toContain('src="/api/assets/ast_thiago"');
    expect(h).not.toMatch(/src="https?:/);
  });

  it('selo "Curso livre" sempre; "Com certificado" só com certificado ligado', () => {
    const without = renderToStaticMarkup(createElement(FreeCourseCard, { c: freeCardFixture() }));
    expect(without).toContain('data-testid="free-badge"');
    expect(without).not.toContain('Com certificado');
    expect(without.toLocaleLowerCase('pt-BR')).not.toContain('certificado');
    const withCert = renderToStaticMarkup(createElement(FreeCourseCard, { c: freeCardFixture({ certificate: true }) }));
    expect(withCert).toContain('data-testid="free-certificate"');
    expect(text(withCert)).toContain('Com certificado');
  });

  it('novo: "Começar" e "Você ainda não começou"; concluído: "Rever o curso" e "Curso concluído"', () => {
    const fresh = text(renderToStaticMarkup(createElement(FreeCourseCard, { c: freeCardFixture({ status: 'new', completed: 0, percent: 0, cta: 'Começar', startHref: '/aprender/enr_ia/aulas/aula_01' }) })));
    expect(fresh).toContain('Começar');
    expect(fresh).toContain('Você ainda não começou');
    const done = renderToStaticMarkup(createElement(FreeCourseCard, { c: freeCardFixture({ status: 'completed', completed: 21, percent: 100, cta: 'Rever o curso', startHref: '/aprender/enr_ia' }) }));
    expect(text(done)).toContain('Rever o curso');
    expect(text(done)).toContain('Curso concluído');
    expect(done).not.toContain('data-testid="free-modules"');
  });

  it('sem foto: fundo marinho com a inicial (nada quebra)', () => {
    const { photo: _photo, ...noPhoto } = freeCardFixture();
    const h = renderToStaticMarkup(createElement(FreeCourseCard, { c: noPhoto }));
    expect(h).toContain('data-testid="cover-missing"');
  });
});

describe('seção "Cursos livres"', () => {
  it('título, contagem para leitor de tela, link "Ver todos" e um cartão por curso', () => {
    const h = renderToStaticMarkup(createElement(FreeCoursesSection, { courses: [freeCardFixture(), freeCardFixture({ id: 'enr_b', title: 'Atendimento ao cliente', status: 'completed' })], href: '/aprender/cursos-livres' }));
    expect(h).toContain('data-testid="free-courses"');
    expect(text(h)).toContain('Cursos livres , 2 cursos livres');
    expect(text(h)).toContain('1 de 2 concluídos');
    expect(h).toMatch(/<a aria-label="Ver todos: Cursos livres"[^>]*href="\/aprender\/cursos-livres"/);
    expect(h).toContain('dna-rail--free');
    expect(h.match(/data-testid="free-course-/g)).toHaveLength(2);
  });
  it('sem cursos livres a seção não existe', () => {
    expect(renderToStaticMarkup(createElement(FreeCoursesSection, { courses: [] }))).toBe('');
  });
});

const tile = (id: string, title: string, trail?: string): CourseTileData => ({ id, href: `/aprender/${id}/aulas/a1`, chaptersHref: `/aprender/${id}`, title, fullTitle: title, lessons: 3, lessonsTotal: 3, completed: 0, video: { minS: 300, maxS: 300 }, decisions: 1, lessonTitles: ['A', 'B', 'C'], status: 'new', cta: 'Começar', ...(trail ? { trail } : {}) });
const item = (id: string, title: string, trail?: string): CatalogItem => ({ tile: tile(id, title, trail), slug: id, done: false, started: false, ...(trail ? { trail } : {}) });

describe('vitrine com cursos livres', () => {
  const items = [item('enr_h', 'Horário é combinado', 'Primeiros dias'), item('enr_s', 'Curso solto')];
  const trails = [{ name: 'Primeiros dias', slug: 'primeiros-dias' }];
  const render = (extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(Catalog, { items, trails, free: [freeCardFixture()], ...extra }));

  it('a seção fica ACIMA dos filtros e das trilhas; "Mais cursos" continua no fim, sem o curso livre', () => {
    const h = render();
    const at = (s: string) => h.indexOf(s);
    expect(at('data-testid="free-courses"')).toBeGreaterThan(-1);
    expect(at('data-testid="free-courses"')).toBeLessThan(at('aria-label="Filtrar por trilha"'));
    expect(at('aria-label="Filtrar por trilha"')).toBeLessThan(at('data-testid="trail-primeiros-dias"'));
    expect(at('data-testid="trail-primeiros-dias"')).toBeLessThan(at('data-testid="trail-mais-cursos"'));
    const more = h.slice(at('data-testid="trail-mais-cursos"'));
    expect(more).toContain('Curso solto');
    expect(more).not.toContain('IA na prática');
    // o curso livre aparece uma vez só, no cartão próprio
    expect(h.match(/IA na prática para estudar e trabalhar<\/a>/g)).toHaveLength(1);
  });

  it('filtro "Cursos livres" junto de "Todos"', () => {
    const h = render();
    const filters = h.slice(h.indexOf('aria-label="Filtrar por trilha"'), h.indexOf('data-testid="trail-primeiros-dias"'));
    expect(filters.indexOf('Todos')).toBeLessThan(filters.indexOf('data-testid="filter-free"'));
    expect(filters.indexOf('data-testid="filter-free"')).toBeLessThan(filters.indexOf('Primeiros dias'));
    expect(filters).toMatch(/aria-pressed="false"[^>]*data-testid="filter-free"/);
  });

  it('sem cursos livres: nem seção nem filtro (vitrine como antes)', () => {
    const h = renderToStaticMarkup(createElement(Catalog, { items, trails }));
    expect(h).not.toContain('free-courses');
    expect(h).not.toContain('filter-free');
    expect(h).toContain('data-testid="trail-mais-cursos"');
  });

  it('a busca acha o curso livre e conta o resultado', () => {
    const h = render({ query: 'ia na pratica' });
    expect(h).toContain('data-testid="free-courses"');
    expect(text(h)).toContain('1 resultado encontrado para “ia na pratica”.');
    expect(h).not.toContain('data-testid="trail-primeiros-dias"');
    const other = render({ query: 'horario' });
    expect(other).not.toContain('data-testid="free-courses"');
    expect(other).toContain('data-testid="trail-primeiros-dias"');
    const none = render({ query: 'zzz' });
    expect(text(none)).toContain('Nenhum curso encontrado');
    expect(none).not.toContain('data-testid="free-courses"');
  });

  it('aluno só com curso livre: a seção aparece sem filtros vazios nem "nenhum curso nesta trilha"', () => {
    const h = renderToStaticMarkup(createElement(Catalog, { items: [], trails: [], free: [freeCardFixture()] }));
    expect(h).toContain('data-testid="free-courses"');
    expect(h).not.toContain('catalog-empty');
    expect(h).toMatch(/class="hidden"><div role="group" aria-label="Filtrar por trilha"/);
  });
});

describe('página do curso livre', () => {
  const document = freeCourseDocument();
  const outline = buildFreeCourseOutline({
    document,
    lessons: { aula_01: { kind: 'completed' }, aula_02: { kind: 'completed' }, aula_03: { kind: 'completed' }, aula_04: { kind: 'in_progress', percent: 40 } },
    answers: { aula_03_q1: { passed: true }, aula_03_q2: { passed: true }, aula_03_q3: { passed: true }, aula_03_q4: { passed: true } },
    completed: false,
  });

  it('cabeçalho: carga horária, módulos, aulas, progresso e a ação', () => {
    const h = renderToStaticMarkup(createElement(FreeCourseHeader, { title: document.title, presenter: 'Thiago', workloadMinutes: 480, certificate: false, outline, primary: { href: '/aprender/enr_ia/aulas/aula_04', label: 'Continuar módulo 2' } }));
    const t = text(h);
    expect(h).toContain('data-testid="course-hero"');
    expect(h).toMatch(/<h1[^>]*>IA na prática para estudar e trabalhar<\/h1>/);
    expect(t).toContain('Curso livre');
    expect(t).not.toContain('Com certificado');
    expect(t).toContain('com Thiago');
    expect(t).toContain('8 h');
    expect(t).toContain('7 módulos');
    expect(t).toContain('21 aulas');
    expect(t).toContain('3 de 21 aulas concluídas · 14%');
    expect(h).toMatch(/role="progressbar"[^>]*aria-valuenow="14"/);
    expect(h).toContain('data-testid="course-start" href="/aprender/enr_ia/aulas/aula_04"');
    expect(t).toContain('Você parou em: Módulo 2 · Aula 4 · A diferença está no pedido');
    expect(text(renderToStaticMarkup(createElement(FreeCourseHeader, { title: document.title, workloadMinutes: 360, certificate: true, outline })))).toContain('Com certificado');
  });

  it('o que falta para concluir: aulas obrigatórias e avaliações; missões só quando o curso tem', () => {
    const h = renderToStaticMarkup(createElement(FreeCourseRemaining, { outline }));
    const t = text(h);
    expect(t).toContain('O que falta para concluir');
    expect(t).toContain('Faltam 18 aulas obrigatórias e 24 avaliações.');
    expect(t).toContain('Aulas obrigatórias 3 de 21 concluídas');
    expect(t).toContain('Avaliações 4 de 28 questões aprovadas');
    expect(h).not.toContain('remaining-missions');
    const withMission = buildFreeCourseOutline({ document: freeCourseDocument({}, { mission: true }), lessons: {}, completed: false });
    const m = text(renderToStaticMarkup(createElement(FreeCourseRemaining, { outline: withMission })));
    expect(m).toContain('Missões 0 de 1 feita');
    expect(m).toContain('Não travam o curso.');
  });

  it('módulos em acordeão: o módulo atual abre; aulas com estado, link certo e avaliação do módulo', () => {
    const h = renderToStaticMarkup(createElement(FreeCourseModules, { outline, enrollmentId: 'enr_ia' }));
    const t = text(h);
    expect(h.match(/<details/g)).toHaveLength(7);
    expect(h.match(/<details open=""/g)).toHaveLength(1);
    expect(h).toMatch(/<details open=""[^>]*data-testid="module-mod_2"[^>]*data-state="in_progress"[^>]*data-current="true"/);
    expect(h).toMatch(/data-testid="module-mod_1"[^>]*data-state="completed"/);
    expect(t).toContain('Módulo 2 Você está aqui');
    expect(t).toContain('Os 4 P: como pedir bem');
    expect(t).toContain('3 de 3 aulas concluídas');
    expect(t).toContain('0 de 3 aulas concluídas');
    expect(t).toContain('1 h 9 min');
    // concluída abre a revisão; em andamento e as demais abrem a aula
    expect(h).toMatch(/data-testid="lesson-aula_01" data-state="completed"><a[^>]*href="\/aprender\/enr_ia\/aulas\/aula_01\/rever"/);
    expect(h).toMatch(/data-testid="lesson-aula_04" data-state="in_progress"><a[^>]*aria-current="step"[^>]*href="\/aprender\/enr_ia\/aulas\/aula_04"/);
    expect(h).toMatch(/data-testid="lesson-aula_05" data-state="not_started"><a[^>]*href="\/aprender\/enr_ia\/aulas\/aula_05"/);
    expect(h).toContain('aria-label="Aula 4: A diferença está no pedido. Em andamento, 40%. Cerca de 23 minutos. Continuar."');
    expect(h).toContain('aria-label="Aula 3: Caça-alucinação. Concluída. Cerca de 23 minutos. Avaliação: 4 de 4 questões aprovadas. Rever."');
    expect(t).toContain('Em andamento · 40%');
    expect(t).toContain('Avaliação do módulo: 4 de 4 questões aprovadas');
    expect(t).toContain('Avaliação do módulo: 0 de 4 questões aprovadas (ainda não feita)');
  });

  it('nada começado: abre o módulo 1 com a aula 1 como próxima; concluído: abre o primeiro', () => {
    const fresh = renderToStaticMarkup(createElement(FreeCourseModules, { outline: buildFreeCourseOutline({ document, lessons: {}, completed: false }), enrollmentId: 'enr_ia' }));
    expect(fresh).toMatch(/<details open=""[^>]*data-testid="module-mod_1"/);
    expect(fresh).toMatch(/data-testid="lesson-aula_01" data-state="next"/);
    expect(text(fresh)).toContain('Aula 1 · Próxima');
    const all = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`aula_${String(i + 1).padStart(2, '0')}`, { kind: 'completed' as const }]));
    const done = buildFreeCourseOutline({ document, lessons: all, completed: true });
    const h = renderToStaticMarkup(createElement(FreeCourseModules, { outline: done, enrollmentId: 'enr_ia' }));
    expect(h.match(/<details open=""/g)).toHaveLength(1);
    expect(h).toMatch(/<details open=""[^>]*data-testid="module-mod_1"/);
    expect(text(renderToStaticMarkup(createElement(FreeCourseRemaining, { outline: done })))).toContain('Você concluiu este curso.');
  });
});
