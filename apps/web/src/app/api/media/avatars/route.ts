import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { getHeyGen, SIMULATED_AVATARS } from '@/server/media';

export async function GET(req: Request) {
  return route(async () => {
    await requireStaff();
    const heygen = getHeyGen();
    if (!heygen) return { simulation: true, looks: SIMULATED_AVATARS, nextToken: undefined };
    const params = new URL(req.url).searchParams;
    const token = params.get('token') ?? undefined;
    // group = grupo do apresentador: lista só os visuais da mesma pessoa (câmeras do kit)
    const group = params.get('group');
    const groupId = group && /^[A-Za-z0-9_-]{1,120}$/.test(group) ? group : undefined;
    const r = await heygen.listAvatarLooks({ token, limit: 50, groupId });
    return { simulation: false, looks: r.looks, nextToken: r.hasMore ? r.nextToken : undefined };
  });
}
