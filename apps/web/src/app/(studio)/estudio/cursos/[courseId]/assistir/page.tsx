import { notFound } from 'next/navigation';
import { getDb, authoring, identity, reviewMarks } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { reviewLessons } from '@/server/video-review';
import { lessonMarkViews } from '@/server/video-review-fix';
import { Card } from '@/components/ui/card';
import { WatchAndMark } from './watch-and-mark';

export const metadata = { title: 'Assistir e marcar' };
export const dynamic = 'force-dynamic';

/**
 * Revisão dos vídeos gerados: o revisor assiste às cenas de uma aula em sequência, pausa no problema e marca (tecla M).
 * Cada marca mostra em que tomada, plano, fala, passo da tela ou tópico ela cai; `revisao-acoes.ts` vira o plano de ações.
 */
export default async function WatchAndMarkPage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ aula?: string }> }) {
  const viewer = await requireStaff();
  const { courseId } = await params;
  const { aula } = await searchParams;
  await requireCourseInWorkspace(viewer, courseId);
  const db = getDb();
  const draft = await authoring.getDraft(db, courseId);
  if (!draft) notFound();
  const lessons = reviewLessons(draft.document);
  if (!lessons.length) return <Card className="text-sm text-fg-muted">Nenhuma aula tem vídeo gerado ainda. Gere os vídeos na aba Produção e volte aqui.</Card>;
  const lesson = lessons.find((l) => l.id === aula) ?? lessons[0]!;
  const [{ marks, scenes }, allOpen] = await Promise.all([
    lessonMarkViews(viewer.workspace.id, courseId, lesson.id),
    reviewMarks.listMarks(db, { workspaceId: viewer.workspace.id, courseId, status: ['open', 'awaiting_fix', 'awaiting_approval', 'reprocessing', 'ready_to_check'] }),
  ]);
  const openByLesson: Record<string, number> = {};
  for (const m of allOpen) openByLesson[m.lessonId] = (openByLesson[m.lessonId] ?? 0) + 1;
  return (
    <WatchAndMark
      key={lesson.id}
      courseId={courseId}
      lessons={lessons.map((l) => ({ ...l, open: openByLesson[l.id] ?? 0 }))}
      lessonId={lesson.id}
      scenes={scenes}
      initialMarks={marks}
      canEdit={identity.canEdit(viewer.role)}
    />
  );
}
