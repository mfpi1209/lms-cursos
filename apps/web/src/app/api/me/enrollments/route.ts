import { getDb, learning } from '@lms/db';
import { route } from '@/server/http';
import { requireViewer } from '@/server/viewer';

export async function GET() {
  return route(async () => {
    const viewer = await requireViewer();
    return { enrollments: await learning.listEnrollmentsForUser(getDb(), viewer.user.id) };
  });
}
