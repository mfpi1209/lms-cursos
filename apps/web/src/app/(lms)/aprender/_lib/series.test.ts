import { describe, expect, it } from 'vitest';
import { seriesForTrail } from '@lms/course-schema';
import { buildSeriesCard, buildSeriesCards, partLabel, seriesInfoFor, seriesLessonsCopy, seriesMetaCopy, type SeriesCourseInput } from './series';

const respeito = seriesForTrail('Respeito e diálogo')!;

/** curso do aluno: `done` = aulas concluídas (true/false por aula); sem `done` = não começou */
function course(slug: string, opts: { title?: string; done?: boolean[]; isDone?: boolean; trail?: string; presenter?: string; last?: number } = {}): SeriesCourseInput {
  const done = opts.done ?? [false, false, false, false];
  const completedLessons = done.filter(Boolean).length;
  const i = done.findIndex((d) => !d);
  const started = completedLessons > 0 || !!opts.isDone;
  return {
    slug,
    trail: opts.trail ?? 'Respeito e diálogo',
    enr: { id: `enr_${slug}`, courseTitle: opts.title ?? slug } as never,
    shortTitle: opts.title ?? slug,
    totalLessons: done.length,
    completedLessons,
    isDone: !!opts.isDone,
    started,
    startHref: opts.isDone ? `/aprender/enr_${slug}` : `/aprender/enr_${slug}/aulas/aula_0${Math.max(0, i) + 1}`,
    cta: opts.isDone ? 'Rever o curso' : started ? `Continuar aula ${i + 1}` : 'Começar',
    lastActivity: opts.last ?? 0,
    ...(opts.presenter ? { presenter: opts.presenter } : {}),
    portrait: `/api/assets/${slug}/thumb`,
    lessons: done.map((_, k) => ({ title: `Aula ${k + 1}` })) as never,
    done,
    ...(i >= 0 ? { nextLessonIndex: i } : {}),
  };
}
const allDone = (slug: string) => course(slug, { done: [true, true, true, true], isDone: true, presenter: 'Mauro' });

describe('cartão da série', () => {
  it('sem nenhum curso da série matriculado: nada aparece', () => {
    expect(buildSeriesCard(respeito, [course('outro-curso')])).toBeNull();
    expect(buildSeriesCard(respeito, [course('o-outro-so-e-diferente', { trail: 'Convivência' })])).toBeNull();
  });

  it('não começou: "Começar" na Parte 1, 3 partes com o instrutor', () => {
    const card = buildSeriesCard(respeito, [course('minha-ideia-tambem-conta'), course('o-outro-so-e-diferente', { presenter: 'Mauro' }), course('discordar-sem-brigar')])!;
    expect(card.parts.map((p) => p.slug)).toEqual(respeito.courses);
    expect(card.status).toBe('new');
    expect(card.cta).toEqual({ label: 'Começar', href: '/aprender/enr_o-outro-so-e-diferente/aulas/aula_01' });
    expect(card.nextPart).toBe(1);
    expect(card.instructor).toBe('Mauro');
    expect(seriesMetaCopy(card.total, card.instructor)).toBe('3 partes · com Mauro');
    expect(card.href).toBe('/aprender/trilhas/respeito-e-dialogo');
  });

  it('em andamento: "Continuar parte N" na próxima aula da primeira parte não concluída; progresso somado', () => {
    const card = buildSeriesCard(respeito, [allDone('o-outro-so-e-diferente'), course('discordar-sem-brigar', { done: [true, true, false, false] }), course('minha-ideia-tambem-conta')])!;
    expect(card.status).toBe('in_progress');
    expect(card.cta).toEqual({ label: 'Continuar parte 2', href: '/aprender/enr_discordar-sem-brigar/aulas/aula_03' });
    expect(card.lessons).toBe(12);
    expect(card.completed).toBe(6);
    expect(card.percent).toBe(50);
    expect(card.partsDone).toBe(1);
    expect(seriesLessonsCopy(card.completed, card.lessons)).toBe('6 de 12 aulas concluídas');
  });

  it('terminou a Parte 1 e não abriu a 2: continua na Parte 2 (primeira aula)', () => {
    const card = buildSeriesCard(respeito, [allDone('o-outro-so-e-diferente'), course('discordar-sem-brigar'), course('minha-ideia-tambem-conta')])!;
    expect(card.cta).toEqual({ label: 'Continuar parte 2', href: '/aprender/enr_discordar-sem-brigar/aulas/aula_01' });
  });

  it('as três concluídas: "Ver selo" na página da trilha, 100%', () => {
    const card = buildSeriesCard(respeito, respeito.courses.map(allDone), { badge: true })!;
    expect(card.status).toBe('completed');
    expect(card.cta).toEqual({ label: 'Ver selo', href: '/aprender/trilhas/respeito-e-dialogo' });
    expect(card.percent).toBe(100);
    expect(card.nextPart).toBeUndefined();
    expect(card.badge).toBe(true);
  });

  it('parte não liberada: aparece como indisponível e a série só fecha com as três', () => {
    const card = buildSeriesCard(respeito, [allDone('o-outro-so-e-diferente'), allDone('discordar-sem-brigar')])!;
    expect(card.parts[2]).toMatchObject({ n: 3, available: false });
    expect(card.status).toBe('in_progress');
    expect(card.cta).toEqual({ label: 'Ver trilha', href: '/aprender/trilhas/respeito-e-dialogo' });
  });

  it('só a Parte 3 liberada e não começada: "Começar" nela', () => {
    const card = buildSeriesCard(respeito, [course('minha-ideia-tambem-conta')])!;
    expect(card.cta.label).toBe('Começar');
    expect(card.cta.href).toBe('/aprender/enr_minha-ideia-tambem-conta/aulas/aula_01');
    expect(card.nextPart).toBe(3);
  });

  it('a imagem é a do instrutor da parte do botão', () => {
    const card = buildSeriesCard(respeito, [allDone('o-outro-so-e-diferente'), course('discordar-sem-brigar')])!;
    expect(card.portrait).toBe('/api/assets/discordar-sem-brigar/thumb');
  });
});

describe('várias trilhas', () => {
  it('só as séries viram cartão; as outras trilhas ficam de fora', () => {
    const cards = buildSeriesCards([course('o-outro-so-e-diferente'), course('meu-primeiro-dia', { trail: 'Primeiro emprego' })], ['Primeiro emprego', 'Respeito e diálogo'], new Set(['respeito-e-dialogo']), () => true);
    expect([...cards.keys()]).toEqual(['Respeito e diálogo']);
    expect(cards.get('Respeito e diálogo')!.badge).toBe(true);
  });

  it('informa a parte de um curso de série (e nada para os outros)', () => {
    expect(seriesInfoFor({ slug: 'faz-sentido', trail: 'Pensar e resolver' })).toEqual({ trail: 'Pensar e resolver', part: 2, total: 3 });
    expect(seriesInfoFor({ slug: 'meu-primeiro-dia', trail: 'Primeiro emprego' })).toBeNull();
    expect(partLabel(2, 3)).toBe('Parte 2 de 3');
  });
});

describe('próxima parte no fim do curso', () => {
  const sib = (n: number, over: Partial<import('./series').SeriesSibling> = {}) => ({ n, title: `Parte ${n} título`, available: true, done: false, started: false, href: `/aprender/e${n}/aulas/a1`, ...over });
  it('fim da Parte 1: abre a Parte 2 (começar)', async () => {
    const { pickNextPart } = await import('./series');
    expect(pickNextPart(1, [sib(2), sib(3)])).toEqual({ othersDone: false, next: { n: 2, title: 'Parte 2 título', href: '/aprender/e2/aulas/a1', started: false } });
  });
  it('fim da Parte 2 com a 3 em andamento: continua a Parte 3', async () => {
    const { pickNextPart } = await import('./series');
    expect(pickNextPart(2, [sib(1, { done: true }), sib(3, { started: true })]).next).toMatchObject({ n: 3, started: true });
  });
  it('fim da Parte 3 com a 1 pendente: volta à primeira que falta', async () => {
    const { pickNextPart } = await import('./series');
    const r = pickNextPart(3, [sib(1), sib(2, { done: true })]);
    expect(r.othersDone).toBe(false);
    expect(r.next?.n).toBe(1);
  });
  it('fim da última parte com as outras concluídas: trilha concluída, sem próxima', async () => {
    const { pickNextPart } = await import('./series');
    expect(pickNextPart(3, [sib(1, { done: true }), sib(2, { done: true })])).toEqual({ othersDone: true });
  });
  it('parte não liberada impede "trilha concluída" e não é aberta', async () => {
    const { pickNextPart } = await import('./series');
    expect(pickNextPart(2, [sib(1, { done: true }), sib(3, { available: false })])).toEqual({ othersDone: false });
  });
});
