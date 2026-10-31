import { getDb, authoring, DomainError } from '@lms/db';
import type { Viewer } from './viewer';
import { HttpError } from './viewer';

/** Garante que o curso pertence ao workspace do viewer (isolamento no backend). */
export async function requireCourseInWorkspace(viewer: Viewer, courseId: string) {
  const course = await authoring.getCourse(getDb(), courseId);
  if (!course) throw new DomainError('NOT_FOUND', 'Curso não encontrado');
  if (course.workspaceId !== viewer.workspace.id) throw new HttpError(404, 'Curso não encontrado');
  return course;
}
