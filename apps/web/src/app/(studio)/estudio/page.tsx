import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getDb, authoring, identity } from '@lms/db';
import { WIZARD_STEPS } from '@lms/course-schema';
import { requireStaff } from '@/server/viewer';
import { Badge, type BadgeTone } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { BrandMark } from '@/components/brand-mark';
import { PresenterThumb } from '@/components/studio/presenter-thumb';
import { cn, formatDate } from '@/lib/utils';
import { STEP_META } from '@/components/studio/wizard/wizard-state';

export const metadata = { title: 'Cursos' };
export const dynamic = 'force-dynamic';

const statusLabel = { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' } as const;

export default async function LibraryPage() {
  const viewer = await requireStaff();
  const db = getDb();
  // arquivados saem da lista (continuam no banco e podem voltar a rascunho)
  const allCourses = await authoring.listCourses(db, viewer.workspace.id);
  const courses = allCourses.filter((c) => c.status !== 'archived');
  const drafts = await Promise.all(courses.map((c) => authoring.getDraft(db, c.id).catch(() => null)));
  const canEdit = identity.canEdit(viewer.role);
  const published = courses.filter((c) => c.status === 'published').length;

  return (
    <div className="space-y-12">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-4">
          <p className="eyebrow">Estúdio de cursos</p>
          <h1>Seus cursos</h1>
          <p className="text-lg text-fg-muted">
            {courses.length === 0
              ? 'Do tema à publicação em seis passos, com apresentador em vídeo e cenas escritas com IA.'
              : `${courses.length} ${courses.length === 1 ? 'curso' : 'cursos'}, ${published} ${published === 1 ? 'publicado' : 'publicados'}. Continue uma montagem ou comece um curso novo.`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link href="/estudio/modelos" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}>Modelos prontos</Link>
          {canEdit && (
            <Link href="/estudio/novo" className={cn(buttonVariants({ size: 'lg' }))} data-testid="new-course">
              <Plus className="h-5 w-5" aria-hidden="true" /> Novo curso
            </Link>
          )}
        </div>
      </section>

      {courses.length === 0 ? (
        <div className="panel rise flex flex-col items-center px-6 py-16 text-center">
          <BrandMark className="h-12 w-12 text-accent" />
          <h2 className="mt-6 text-2xl sm:text-3xl">Seu primeiro curso começa aqui</h2>
          <p className="mt-3 max-w-md text-fg-muted">O assistente leva você do tema à publicação: tema, conteúdo, estrutura, apresentação, aulas e revisão.</p>
          {canEdit && (
            <Link href="/estudio/novo" className={cn(buttonVariants({ size: 'lg' }), 'mt-8')}>
              <Plus className="h-5 w-5" aria-hidden="true" /> Criar o primeiro curso
            </Link>
          )}
        </div>
      ) : (
        <ul className="rise space-y-3" data-testid="course-list">
          {courses.map((c, i) => {
            const draftDoc = drafts[i]?.document;
            const wizard = draftDoc?.wizard;
            const inProgress = wizard ? !wizard.finished && c.latestVersionNumber === 0 : false;
            const stepNo = wizard ? WIZARD_STEPS.indexOf(wizard.step) + 1 : 0;
            const href = inProgress ? `/estudio/cursos/${c.id}/montar` : `/estudio/cursos/${c.id}`;
            const chip: { label: string; tone: BadgeTone } = inProgress
              ? { label: `Em montagem · passo ${stepNo} de ${WIZARD_STEPS.length}`, tone: 'warning' }
              : c.status === 'published'
                ? { label: statusLabel.published, tone: 'success' }
                : { label: statusLabel[c.status], tone: 'neutral' };
            const action = inProgress
              ? { href, label: 'Continuar montagem', variant: 'primary' as const }
              : c.hasUnpublishedChanges
                ? { href: `/estudio/cursos/${c.id}/revisao`, label: 'Revisar e publicar', variant: 'primary' as const }
                : { href, label: 'Abrir painel', variant: 'secondary' as const };
            return (
              <li key={c.id} className="panel flex flex-col gap-5 p-5 transition-colors hover:border-line-strong sm:flex-row sm:items-center sm:p-6" data-testid={`course-${c.id}`}>
                <PresenterThumb src={draftDoc?.presentation.avatarPreviewUrl} name={c.title} size={48} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link href={href} className="inline-flex min-h-11 items-center break-words font-display text-xl font-semibold leading-tight tracking-[-0.01em] text-fg hover:text-accent hover:underline">{c.title}</Link>
                    <Badge tone={chip.tone}>{chip.label}</Badge>
                  </div>
                  <p className="text-sm text-fg-muted">
                    {inProgress && wizard
                      ? `Próximo passo: ${STEP_META[wizard.step].label}.`
                      : `${c.latestVersionNumber > 0 ? `Versão publicada ${c.latestVersionNumber}` : 'Nunca publicado'}${c.hasUnpublishedChanges ? '. Há alterações ainda não publicadas.' : '.'}`}
                    <span className="text-fg-faint"> Por {c.createdByName}, atualizado em {formatDate(c.updatedAt)}.</span>
                  </p>
                </div>
                <Link href={action.href} className={cn(buttonVariants({ variant: action.variant }), 'shrink-0 self-start sm:self-center')}>{action.label}</Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
