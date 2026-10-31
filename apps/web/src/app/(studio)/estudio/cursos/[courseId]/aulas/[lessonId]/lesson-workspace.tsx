'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Clapperboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StoryboardEditor } from '@/components/studio/storyboard/storyboard-editor';
import { LessonEditor } from './lesson-editor';

/**
 * Alterna entre as cenas (padrão) e o editor avançado. O modo vive na URL
 * (`?modo=avancado`), então recarregar ou compartilhar o link preserva a vista.
 * O editor avançado é renderizado sem alterações.
 */
export function LessonWorkspace({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const advanced = searchParams.get('modo') === 'avancado';

  const setMode = React.useCallback(
    (mode: 'roteiro' | 'avancado', nodeId?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (mode === 'avancado') params.set('modo', 'avancado');
      else params.delete('modo');
      if (nodeId) params.set('node', nodeId);
      else params.delete('node');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  if (!advanced) return <StoryboardEditor courseId={courseId} lessonId={lessonId} onOpenAdvanced={(nodeId) => setMode('avancado', nodeId)} />;

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="advanced-mode-bar">
        <p className="text-fg-muted">
          <span className="font-medium text-fg">Modo avançado.</span> Blocos, mapa de fluxo e validação técnica.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setMode('roteiro')} aria-pressed data-testid="advanced-toggle">
          <Clapperboard className="h-4 w-4" aria-hidden="true" /> Voltar às cenas
        </Button>
      </div>
      {/* key força o editor a reler ?node= ao entrar no modo avançado */}
      <LessonEditor key={searchParams.get('node') ?? 'editor'} courseId={courseId} lessonId={lessonId} />
    </div>
  );
}
