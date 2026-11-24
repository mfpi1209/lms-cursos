import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireViewer } from '@/server/viewer';
import { FREE_SECTION_TITLE, FreeCoursesSection } from '../_components/free-course-card';
import { loadLearnerCourses, loadOpenCourses } from '../_lib/learner-courses';

export const metadata = { title: FREE_SECTION_TITLE };
export const dynamic = 'force-dynamic';

/**
 * Link direto para parceiros: os cursos livres (EaD), com os mesmos cartões da vitrine (os do aluno e, depois, os que ele
 * ainda pode começar). O app do parceiro abre
 * `/aprender/cursos-livres` e a pessoa cai direto aqui (sem login, o layout da área do aluno manda para a entrada).
 */
export default async function FreeCoursesPage() {
  const viewer = await requireViewer();
  const { courses } = await loadLearnerCourses(viewer.user.id);
  const open = await loadOpenCourses(viewer.workspace.id, viewer.user.id);
  const mine = courses.flatMap((c) => (c.free ? [c.free] : []));
  // os ainda sem matrícula vêm depois, com o botão que inscreve
  const free = [...mine, ...open.flatMap((c) => (c.free ? [c.free] : []))];
  return (
    <div className="lms-editorial" data-testid="free-courses-page">
      <nav aria-label="Navegação" className="-mt-2 text-sm">
        <Link href="/aprender" className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-fg-muted hover:text-fg">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Todos os cursos
        </Link>
      </nav>
      <div className="mt-2 space-y-3">
        <h1 className="text-[32px]! font-extrabold! leading-9! tracking-[-0.025em]! text-fg md:text-[48px]! md:leading-[52px]!">
          Cursos <span className="text-[var(--im-accent-ink)]">livres</span>
        </h1>
        <p className="max-w-prose text-[15px] leading-[22px] text-fg-muted md:text-base md:leading-6">Cursos completos, com módulos, aulas e avaliações. Estude no seu ritmo: o curso guarda onde você parou.</p>
      </div>
      {free.length > 0 ? (
        <FreeCoursesSection courses={free} title={free.length === mine.length ? 'Seus cursos livres' : 'Todos os cursos livres'} />
      ) : (
        <div className="mt-8 rounded-[16px] border border-line bg-surface p-6 sm:p-8" data-testid="free-courses-empty">
          <p className="text-lg font-medium text-fg">Você ainda não tem cursos livres.</p>
          <p className="mt-1 text-base text-fg-muted">Quando houver um curso livre publicado, ele aparece aqui.</p>
          <Link href="/aprender" className="mt-4 inline-flex min-h-11 items-center font-semibold text-fg underline underline-offset-4">
            Ver todos os cursos
          </Link>
        </div>
      )}
    </div>
  );
}
