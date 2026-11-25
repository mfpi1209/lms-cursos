import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb, identity, learning, schema } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { Card, Badge } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';
import { EnrollCourses } from '../enroll-courses';

export const metadata = { title: 'Pessoa' };
export const dynamic = 'force-dynamic';

export default async function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const viewer = await requireStaff();
  const { userId } = await params;
  const db = getDb();
  const membership = await identity.getMembership(db, viewer.workspace.id, userId);
  if (!membership || membership.role !== 'student') notFound();
  const [person] = await db.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, createdAt: schema.user.createdAt }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  if (!person) notFound();
  const [enrollments, open] = await Promise.all([learning.listEnrollmentsForUser(db, userId), learning.listOpenPublishedCourses(db, viewer.workspace.id, userId)]);
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Link href="/estudio/pessoas" className="text-sm text-fg-muted hover:text-fg">← Pessoas</Link>
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-xl font-bold text-accent-strong" aria-hidden="true">{(person.name.trim()[0] ?? '?').toUpperCase()}</span>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl">{person.name}</h1>
            <p className="text-sm text-fg-muted">{person.email} · cadastrada em {formatDate(person.createdAt)}</p>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl">Cursos em que está inscrita</h2>
        {enrollments.length === 0 ? (
          <Card className="px-6 py-8 text-center text-fg-muted">Ainda não está inscrita em nenhum curso.</Card>
        ) : (
          <ul className="space-y-3" data-testid="person-enrollments">
            {enrollments.map((e) => (
              <li key={e.id} className="panel flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{e.courseTitle}</p>
                  <p className="text-sm text-fg-muted">v{e.versionNumber} · inscrita em {formatDate(e.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={e.status === 'completed' ? 'success' : e.status === 'active' ? 'brand' : 'neutral'}>{e.status === 'completed' ? 'Concluído' : e.status === 'active' ? 'Em andamento' : 'Cancelado'}</Badge>
                  <Link href={`/estudio/cursos/${e.courseId}/matriculas/${e.id}`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Relatório</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {identity.canEnroll(viewer.role) && (
        <section className="space-y-4">
          <h2 className="text-xl">Inscrever em cursos</h2>
          <EnrollCourses userId={userId} courses={open.map((c) => ({ id: c.id, title: c.title, trail: c.trail }))} />
        </section>
      )}
    </div>
  );
}
