import { getDb, identity } from '@lms/db';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';

export async function GET() {
  return route(async () => {
    const viewer = await requireStaff();
    return { students: await identity.listWorkspaceUsers(getDb(), viewer.workspace.id, 'student') };
  });
}
