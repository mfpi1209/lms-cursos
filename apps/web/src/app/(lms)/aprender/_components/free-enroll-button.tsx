'use client';

import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEnroll } from './course-tile';
import { ctaPrimary } from './learner-ui';

/** Ação principal do curso livre ainda sem matrícula: inscreve e abre o curso. O erro aparece logo abaixo. */
export function FreeEnrollButton({ courseId, label, title }: { courseId: string; label: string; title: string }) {
  const { pending, error, enroll } = useEnroll(courseId);
  return (
    <>
      <button type="button" onClick={enroll} disabled={pending} aria-busy={pending} className={cn(ctaPrimary, 'px-5 disabled:opacity-60')} data-testid="free-enroll">
        <Play className="size-4 fill-current" aria-hidden="true" />
        {pending ? 'Inscrevendo…' : label}
        <span className="sr-only">: {title}</span>
      </button>
      {error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
