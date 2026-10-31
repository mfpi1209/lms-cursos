import type { Metadata } from 'next';
import { findLesson } from '@lms/course-schema';
import { getViewer } from './viewer';
import { requireOwnEnrollment } from './learner';
import { getBrand } from '@/config/brand';

/**
 * Título da aba na área do aluno: o curso vem primeiro, depois a marca da
 * plataforma ("Pode entrar · DNA Work"); na aula, a aula + a marca do curso
 * ("Conte um pouco sobre você · pode entrar").
 * Falhas (sem sessão, matrícula de outro) caem num título neutro: a página em
 * si decide o 404.
 */
export async function learnerTabTitle(enrollmentId: string, opts: { lessonId?: string; prefix?: string; fallback: string }): Promise<Metadata> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { title: opts.fallback };
    const { course, document } = await requireOwnEnrollment(viewer, enrollmentId);
    const brand = document.branding.wordmark?.trim() || course.title;
    if (!opts.lessonId) return { title: { absolute: `${course.title} · ${getBrand(viewer.workspace.id).name}` } };
    const lesson = findLesson(document, opts.lessonId)?.lesson;
    if (!lesson) return { title: { absolute: course.title } };
    return { title: { absolute: `${opts.prefix ? `${opts.prefix}: ` : ''}${lesson.title} · ${brand}` } };
  } catch {
    return { title: opts.fallback };
  }
}
