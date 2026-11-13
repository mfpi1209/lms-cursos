import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseDocument } from '@lms/course-schema';
import { freeCourseDocument, pillDocument } from './free-course-fixture';

/*
 * `loadLearnerCourses` com o banco trocado por dados fixos: a classificação de curso livre (sem migração, pelo documento
 * publicado da matrícula) e a regra de que curso livre não entra nas trilhas de pílulas nem em "Mais cursos".
 */

interface Row {
  id: string;
  status: 'active' | 'completed';
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  courseTrail: string | null;
  versionId: string;
  document: CourseDocument;
  attempts?: Array<{ lessonId: string; status: 'in_progress' | 'completed' }>;
}

const state = vi.hoisted(() => ({ rows: [] as unknown[] }));
const rows = () => state.rows as Row[];

vi.mock('@lms/db', () => ({
  getDb: () => ({}),
  learning: {
    listEnrollmentsForUser: async () => rows().map((r) => ({ id: r.id, status: r.status, createdAt: new Date(0), completedAt: null, optionalLessonIds: [], courseId: r.courseId, courseTitle: r.courseTitle, courseSlug: r.courseSlug, courseTrail: r.courseTrail, coursePosterAssetId: null, versionNumber: 1, versionId: r.versionId })),
    listAttemptsForEnrollment: async (_db: unknown, id: string) => (rows().find((r) => r.id === id)?.attempts ?? []).map((a, i) => ({ id: `att_${i}`, enrollmentId: id, lessonId: a.lessonId, status: a.status, attemptNumber: 1, startedAt: new Date(1000 + i), state: { path: [], answers: {} } })),
  },
  publishing: {
    getVersion: async (_db: unknown, versionId: string) => {
      const r = rows().find((x) => x.versionId === versionId);
      return r ? { id: r.versionId, document: r.document } : null;
    },
  },
}));
vi.mock('@/server/lesson-runtime', () => ({ versionsRuntime: async () => new Map() }));

const { loadLearnerCourses } = await import('./learner-courses');

const pill = (id: string, title: string, trail: string | null): Row => ({ id: `enr_${id}`, status: 'active', courseId: `crs_${id}`, courseTitle: title, courseSlug: id, courseTrail: trail, versionId: `ver_${id}`, document: pillDocument(title) });
const ia = (o: Partial<Row> = {}): Row => ({ id: 'enr_ia', status: 'active', courseId: 'crs_g3vzc9kcvbkt284c', courseTitle: 'IA na prática para estudar e trabalhar', courseSlug: 'ia-na-pratica-para-estudar-e-trabalhar', courseTrail: null, versionId: 'ver_ia', document: freeCourseDocument(), ...o });

beforeEach(() => {
  state.rows = [];
});

describe('loadLearnerCourses: cursos livres', () => {
  it('curso com perfil EaD (480 min, sem formato gravado) vem marcado como livre, com os dados do cartão', async () => {
    state.rows = [pill('horario', 'Horário é combinado', 'Primeiros dias'), ia()];
    const { courses } = await loadLearnerCourses('usr_1');
    const free = courses.find((c) => c.enr.id === 'enr_ia')!.free!;
    expect(free).toMatchObject({
      id: 'enr_ia',
      href: '/aprender/enr_ia',
      startHref: '/aprender/enr_ia/aulas/aula_01',
      title: 'IA na prática para estudar e trabalhar',
      presenter: 'Thiago',
      photo: '/api/assets/ast_thiago',
      workloadMinutes: 480,
      modules: 7,
      lessons: 21,
      required: 21,
      completed: 0,
      percent: 0,
      status: 'new',
      cta: 'Começar',
      certificate: false,
    });
    expect(courses.find((c) => c.enr.id === 'enr_horario')!.free).toBeUndefined();
  });

  it('formato EaD gravado e certificado ligado: livre e "com certificado"; pílula com `micro` nunca é livre', async () => {
    state.rows = [
      ia({ document: freeCourseDocument({ brief: { format: 'ead', targetMinutes: 360 }, certificate: { enabled: true, workloadMinutes: 360 } }) }),
      { ...pill('longa', 'Pílula com meta longa', null), document: freeCourseDocument({ brief: { format: 'micro', targetMinutes: 480 } }) },
    ];
    const { courses } = await loadLearnerCourses('usr_1');
    expect(courses.find((c) => c.enr.id === 'enr_ia')!.free).toMatchObject({ certificate: true, workloadMinutes: 360 });
    expect(courses.find((c) => c.enr.id === 'enr_longa')!.free).toBeUndefined();
  });

  it('curso livre não entra nas trilhas de pílulas, mesmo com trilha no cadastro, nem em "Mais cursos"', async () => {
    state.rows = [pill('horario', 'Horário é combinado', 'Primeiros dias'), pill('solto', 'Curso solto', null), ia({ courseTrail: 'Tecnologia com critério' })];
    const { courses, trails } = await loadLearnerCourses('usr_1');
    const free = courses.find((c) => c.enr.id === 'enr_ia')!;
    expect(free.trail).toBeUndefined();
    expect(free.tile.trail).toBeUndefined();
    expect(trails).toEqual(['Primeiros dias']);
    // a vitrine monta as trilhas e "Mais cursos" só com o que não é livre
    const pills = courses.filter((c) => !c.free);
    expect(pills.map((c) => c.enr.id).sort()).toEqual(['enr_horario', 'enr_solto']);
    expect(pills.filter((c) => !c.trail).map((c) => c.enr.id)).toEqual(['enr_solto']);
  });

  it('ação e progresso do cartão pelo estado real: "Continuar módulo N" aponta para a aula certa', async () => {
    state.rows = [ia({ attempts: [{ lessonId: 'aula_01', status: 'completed' }, { lessonId: 'aula_02', status: 'completed' }, { lessonId: 'aula_03', status: 'completed' }, { lessonId: 'aula_04', status: 'in_progress' }] })];
    const { courses } = await loadLearnerCourses('usr_1');
    const c = courses[0]!;
    expect(c.free).toMatchObject({ status: 'in_progress', completed: 3, required: 21, percent: 14, cta: 'Continuar módulo 2', startHref: '/aprender/enr_ia/aulas/aula_04' });
    expect(c.cta).toBe('Continuar módulo 2');
    expect(c.started && !c.isDone).toBe(true);
  });

  it('concluído: "Rever o curso" e 100%', async () => {
    state.rows = [ia({ status: 'completed', attempts: Array.from({ length: 21 }, (_, i) => ({ lessonId: `aula_${String(i + 1).padStart(2, '0')}`, status: 'completed' as const })) })];
    const { courses } = await loadLearnerCourses('usr_1');
    expect(courses[0]!.free).toMatchObject({ status: 'completed', percent: 100, cta: 'Rever o curso', startHref: '/aprender/enr_ia' });
  });

  it('pílulas seguem como antes (ação por aula, trilha do cadastro)', async () => {
    state.rows = [{ ...pill('horario', 'Horário é combinado', 'Primeiros dias'), attempts: [{ lessonId: 'aula_01', status: 'in_progress' }] }];
    const { courses, trails } = await loadLearnerCourses('usr_1');
    expect(courses[0]!.cta).toBe('Continuar aula 1');
    expect(courses[0]!.trail).toBe('Primeiros dias');
    expect(trails).toEqual(['Primeiros dias']);
  });
});
