'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { messageOf } from '@/components/player/use-player-session';

/** "Refazer aula": nova tentativa (a revisada continua no histórico) e abre o player. */
export function RedoLessonButton({ enrollmentId, lessonId, className }: { enrollmentId: string; lessonId: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={className}
        disabled={busy}
        aria-busy={busy}
        data-testid="redo-lesson"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api(`/api/enrollments/${enrollmentId}/lessons/${lessonId}/attempts`, { json: { forceNew: true, abandonOpen: true } });
            router.push(`/aprender/${enrollmentId}/aulas/${lessonId}`);
          } catch (e) {
            setError(messageOf(e));
            setBusy(false);
          }
        }}
      >
        <RotateCcw className="size-5" aria-hidden="true" /> {busy ? 'Abrindo…' : 'Refazer aula'}
      </button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
