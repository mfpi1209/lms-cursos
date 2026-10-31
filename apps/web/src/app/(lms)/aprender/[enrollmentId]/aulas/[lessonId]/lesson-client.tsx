'use client';

import { useEffect, useMemo } from 'react';
import type { Lesson } from '@lms/course-schema';
import { LessonPlayer } from '@/components/player/lesson-player';
import { createLmsDriver } from '@/components/player/lms-driver';
import type { PlatformContext } from '@/components/player/types';

/** Monta o player com o driver persistido do LMS. O driver é memoizado: trocá-lo reinicia o player. */
export function LessonClient({ lesson, enrollmentId, courseTitle, platform, restart = false }: { lesson: Lesson; enrollmentId: string; courseTitle: string; platform?: PlatformContext; /** veio de "Reiniciar": começa do zero */ restart?: boolean }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `restart` só vale na entrada
  const driver = useMemo(() => createLmsDriver({ enrollmentId, lessonId: lesson.id, fresh: restart }), [enrollmentId, lesson.id]);
  // tira o "?reiniciar=1" da barra: recarregar a página retoma de onde parou, não reinicia de novo
  useEffect(() => {
    if (!restart) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('reiniciar');
    window.history.replaceState(null, '', url.toString());
  }, [restart]);
  return <LessonPlayer lesson={lesson} driver={driver} courseTitle={courseTitle} exitHref={`/aprender/${enrollmentId}`} platform={platform} />;
}
