import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { getDb, identity, schema } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { Card, Badge } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';
import { PersonForm } from './person-form';

export const metadata = { title: 'Pessoas' };
export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const viewer = await requireStaff();
  const db = getDb();
  const [people, courses] = await Promise.all([
    identity.listStudentsWithEnrollmentCount(db, viewer.workspace.id),
    db
      .select({ id: schema.courses.id, title: schema.courses.title })
      .from(schema.courses)
      .where(and(eq(schema.courses.workspaceId, viewer.workspace.id), eq(schema.courses.status, 'published')))
      .orderBy(schema.courses.title),
  ]);
  return (
    <div className="space-y-10">
      <section className="max-w-2xl space-y-4">
        <p className="eyebrow">Alunos</p>
        <h1>Pessoas</h1>
        <p className="text-lg text-fg-muted">{people.length === 0 ? 'Ninguém cadastrado ainda.' : `${people.length} ${people.length === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'}.`} Cadastre alguém e inscreva nos cursos publicados.</p>
      </section>
      {identity.canEnroll(viewer.role) ? <PersonForm courses={courses} /> : <p className="rounded-xl bg-paid-soft px-4 py-3 text-sm text-paid">Apenas administradores cadastram pessoas e fazem inscrições.</p>}
      {people.length === 0 ? (
        <Card className="px-6 py-10 text-center text-fg-muted">Nenhuma pessoa cadastrada.</Card>
      ) : (
        <ul className="space-y-3" data-testid="people-list">
          {people.map((p) => (
            <li key={p.id} className="panel flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex min-w-0 items-center gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-base font-bold text-accent-strong" aria-hidden="true">{(p.name.trim()[0] ?? '?').toUpperCase()}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{p.name} <span className="font-normal text-fg-faint">· {p.email}</span></p>
                  <p className="text-sm text-fg-muted">cadastrada em {formatDate(p.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={p.enrollmentCount > 0 ? 'brand' : 'neutral'}>{p.enrollmentCount} {p.enrollmentCount === 1 ? 'curso' : 'cursos'}</Badge>
                <Link href={`/estudio/pessoas/${p.id}`} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Abrir</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
