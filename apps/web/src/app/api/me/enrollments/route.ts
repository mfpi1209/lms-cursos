import { z } from 'zod';
import { authoring, DomainError, getDb, learning } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireViewer } from '@/server/viewer';

export async function GET() {
  return route(async () => {
    const viewer = await requireViewer();
    return { enrollments: await learning.listEnrollmentsForUser(getDb(), viewer.user.id) };
  });
}

const EnrollSchema = z.object({ courseId: z.string().min(1) });

/** A própria pessoa se inscreve num curso publicado do workspace. */
export async function POST(req: Request) {
  return route(async () => {
    const viewer = await requireViewer();
    const { courseId } = await parseBody(req, EnrollSchema);
    const course = await authoring.getCourse(getDb(), courseId);
    if (!course || course.workspaceId !== viewer.workspace.id || course.status !== 'published') {
      throw new DomainError('NOT_FOUND', 'Este curso não está disponível para inscrição.');
    }
    const { enrollment } = await learning.enrollStudent(getDb(), { courseId, userId: viewer.user.id, createdBy: viewer.user.id });
    return { enrollmentId: enrollment.id, href: `/aprender/${enrollment.id}` };
  });
}
