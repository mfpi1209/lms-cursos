'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Lesson } from '@lms/course-schema';
import { LessonPlayer } from '@/components/player/lesson-player';
import { createPreviewDriver, type PreviewStartAt } from '@/components/player/preview-driver';
import { TestModeToolbar } from '@/components/studio/test-mode/test-toolbar';
import { previewHref } from '@/components/studio/test-mode/test-model';
import type { PlatformContext } from '@/components/player/types';

export function PreviewClient({
  courseId,
  startAt: initialStartAt,
  lessons,
  lesson,
  courseTitle,
  exitHref,
  revision,
  platform,
}: {
  courseId: string;
  /** modo de teste: começar nesta cena com estes valores (?cena=&v.*=) */
  startAt?: PreviewStartAt;
  lessons: Array<{ id: string; title: string }>;
  lesson: Lesson;
  courseTitle: string;
  exitHref: string;
  revision: number;
  platform?: PlatformContext;
}) {
  // O driver de prévia roda o motor sem persistir nada; recriado se a aula ou o ponto de partida (modo de teste) mudar.
  const pathname = usePathname();
  const [test, setTest] = React.useState<{ startAt?: PreviewStartAt; n: number }>({ startAt: initialStartAt, n: 0 });
  const driver = React.useMemo(
    () => createPreviewDriver(lesson.graph, { startAt: test.startAt, allowBack: lesson.allowBack }),
    // `n` força um driver novo mesmo com o mesmo ponto de partida (Recomeçar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lesson.graph, lesson.allowBack, test],
  );
  const startTest = React.useCallback(
    (next: PreviewStartAt) => {
      setTest((t) => ({ startAt: next, n: t.n + 1 }));
      // o link reflete o teste (recarregar ou compartilhar volta ao mesmo ponto)
      const href = previewHref(courseId, lesson.id, next);
      const qs = href.split('?')[1];
      // history.replaceState: muda só a URL, sem ir ao servidor (o player não reinicia duas vezes)
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
    },
    [courseId, lesson.id, pathname],
  );
  const toolbar = <TestModeToolbar courseId={courseId} lesson={lesson} lessons={lessons} driver={driver} startAt={test.startAt} onStart={startTest} />;
  // Visual da plataforma: a prévia é idêntica ao que o aluno vê; o aviso vira uma pílula flutuante.
  if (platform && platform.theme !== 'classic') {
    return (
      <div data-testid="lesson-preview">
        {toolbar}
        <div
          role="status"
          className="theme-platform z-40 m-3 flex w-fit max-w-[calc(100vw-1.5rem)] md:fixed md:bottom-4 md:right-4 md:m-0 items-center gap-3 rounded-full border border-line-strong bg-[var(--im-sticky)] py-1.5 pl-4 pr-1.5 text-sm text-fg/85 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.5)] backdrop-blur-md"
          data-testid="preview-pill"
        >
          <span className="truncate">
            <strong className="font-semibold text-fg">Prévia</strong>
            <span className="sr-only"> do rascunho, revisão {revision} da aula “{lesson.title}”. Nada é salvo.</span>
          </span>
          <Link href={exitHref} className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-fg/10 px-3.5 font-medium text-fg hover:bg-fg/15">
            Voltar ao editor
          </Link>
        </div>
        <LessonPlayer lesson={lesson} driver={driver} courseTitle={courseTitle} exitHref={exitHref} platform={platform} />
      </div>
    );
  }
  return (
    <div className="space-y-4" data-testid="lesson-preview">
      {toolbar}
      <div role="status" className="panel flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm text-fg-muted">
        <span>
          <strong className="text-fg">Prévia do rascunho — nada é salvo.</strong> Revisão {revision} da aula "{lesson.title}".
        </span>
        <Link href={exitHref} className="inline-flex min-h-9 items-center rounded-md font-medium text-accent underline underline-offset-2">Voltar ao editor</Link>
      </div>
      <LessonPlayer lesson={lesson} driver={driver} courseTitle={courseTitle} exitHref={exitHref} platform={platform} />
    </div>
  );
}
