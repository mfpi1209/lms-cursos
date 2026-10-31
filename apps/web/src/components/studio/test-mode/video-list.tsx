'use client';

import * as React from 'react';
import Link from 'next/link';
import { Clapperboard, Play } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useDraft } from '@/components/studio/draft-provider';
import { useMediaQueue } from '@/components/studio/media-queue/use-media-queue';
import { PreviewLink } from './preview-link';
import { defaultTestValues, hasDirection, isNarratedScene, isVideoScene, previewHref, sceneVideoStatus, testScenes, VIDEO_STATUS_LABEL, type SceneVideoStatus } from './test-model';

const TONE: Record<SceneVideoStatus, 'success' | 'warning' | 'brand' | 'neutral'> = { ready: 'success', stale: 'warning', stale_presentation: 'warning', generating: 'brand', none: 'neutral' };
const FILTERS: Array<{ id: 'all' | SceneVideoStatus; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'ready', label: 'Pronto' },
  { id: 'stale', label: 'Desatualizado' },
  { id: 'stale_presentation', label: 'Apresentação mudou' },
  { id: 'generating', label: 'Em geração' },
  { id: 'none', label: 'Sem vídeo' },
];

/**
 * Atalho do painel do curso: toda cena que recebe vídeo (com texto para narrar,
 * com direção ou já com vídeo), o estado do vídeo e "Testar", que abre a prévia
 * já nessa cena (com os valores de teste padrão, ex.: o `perfil` do ramo). Um
 * clique. Cenas com texto mas sem direção nem vídeo também aparecem (auditoria
 * P2: antes ficavam escondidas, e o autor não via o que faltava produzir).
 */
export function CourseVideoList({ courseId }: { courseId: string }) {
  const { document: doc } = useDraft();
  const queue = useMediaQueue(courseId);
  const [filter, setFilter] = React.useState<'all' | SceneVideoStatus>('all');
  const rows = React.useMemo(
    () =>
      doc.modules.flatMap((m) => m.lessons).flatMap((lesson, li) =>
        testScenes(lesson.graph)
          .filter((s) => isVideoScene(s.node) || isNarratedScene(s.node))
          .map((s) => ({ lesson, li, scene: s, status: sceneVideoStatus(lesson.id, s.node, queue.data?.items, doc.presentation), direction: hasDirection(s.node) })),
      ),
    [doc, queue.data],
  );
  if (rows.length === 0) return null;
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, f.id === 'all' ? rows.length : rows.filter((r) => r.status === f.id).length])) as Record<string, number>;
  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const base = `/estudio/cursos/${courseId}`;

  return (
    <section aria-labelledby="panel-videos" className="space-y-4" data-testid="course-video-list">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="panel-videos" className="flex items-center gap-2 text-2xl sm:text-3xl">
          <Clapperboard className="h-6 w-6 text-fg-muted" aria-hidden="true" /> Vídeos
        </h2>
        <p className="text-sm text-fg-faint">Cenas com texto para narrar, com direção ou com vídeo. “Testar” abre a prévia nessa cena; nada é salvo.</p>
      </div>
      <div role="group" aria-label="Filtrar por estado do vídeo" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            disabled={counts[f.id] === 0 && f.id !== 'all'}
            className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm', filter === f.id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-muted hover:text-fg', 'disabled:opacity-40')}
            data-testid={`video-filter-${f.id}`}
          >
            {f.label} <span className="tabular-nums text-fg-faint">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <ul className="panel divide-y divide-line">
        {shown.map(({ lesson, li, scene, status, direction }) => {
          const titleId = `video-row-${lesson.id}-${scene.node.id}`;
          return (
            <li key={`${lesson.id}:${scene.node.id}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`video-row-${scene.node.id}`} data-video-status={status}>
              <div className="min-w-0">
                <p id={titleId} className="truncate font-medium text-fg">{scene.title}</p>
                <p className="truncate text-xs text-fg-muted">
                  Aula {li + 1} · {lesson.title} · cena {scene.seq || 'fora do caminho'}
                  {direction ? ' · com direção' : status === 'none' ? ' · sem direção' : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={TONE[status]}>{VIDEO_STATUS_LABEL[status]}</Badge>
                <Link href={`${base}/aulas/${lesson.id}?node=${encodeURIComponent(scene.node.id)}`} aria-describedby={titleId} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-3')}>
                  Editar
                </Link>
                <PreviewLink
                  href={previewHref(courseId, lesson.id, { nodeId: scene.node.id, variables: defaultTestValues(lesson.graph, scene.node.id, doc) })}
                  aria-describedby={titleId}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-1.5 px-3')}
                  data-testid={`video-test-${scene.node.id}`}
                >
                  <Play className="h-4 w-4" aria-hidden="true" /> Testar
                </PreviewLink>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
