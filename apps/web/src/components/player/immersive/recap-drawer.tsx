'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { resolveRecap, type AttemptState, type CourseAnswer, type MissionRecord, type RecapSourceNode, type ResolvedRecapItem } from '@lms/course-engine';
import type { EndNode, Lesson } from '@lms/course-schema';
import { useFocusTrap } from '@/components/ui/focus-trap';
import { RecapView } from '../recap-view';
import { DEFAULT_RECAP_TITLE, findRecapEndNode } from '../use-recap';
import type { PlatformContext } from '../types';

interface CourseAnswers {
  answers: Record<string, CourseAnswer>;
  nodes: Record<string, RecapSourceNode>;
  /** missões "Leve para a vida real" (registro do banco, editável fora da aula) */
  missions: Record<string, MissionRecord>;
}

/**
 * Respostas do curso inteiro (outras aulas) para o roteiro. Só no LMS (com
 * matrícula); 404/erro = segue só com a tentativa atual. Recarrega quando
 * `refreshKey` muda (ex.: ao abrir a gaveta, ao concluir a aula).
 */
function useCourseAnswers(enrollmentId: string | undefined, refreshKey: unknown): CourseAnswers | null {
  const [data, setData] = useState<CourseAnswers | null>(null);
  useEffect(() => {
    if (!enrollmentId) return;
    let cancelled = false;
    fetch(`/api/enrollments/${encodeURIComponent(enrollmentId)}/answers`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: CourseAnswers | null) => {
        if (!cancelled && j && typeof j === 'object' && j.answers) setData({ answers: j.answers ?? {}, nodes: j.nodes ?? {}, missions: j.missions ?? {} });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enrollmentId, refreshKey]);
  return data;
}

export interface CourseRecap {
  endNode: EndNode;
  title: string;
  closingLine?: string;
  items: ResolvedRecapItem[];
  /** respostas salvas no curso (por cena), para restaurar uma atividade ao revisitá-la */
  answers?: Record<string, CourseAnswer>;
  /** registros das missões do curso (por cena) */
  missions?: Record<string, MissionRecord>;
}

/**
 * "Meu roteiro" do curso, resolvido contra a tentativa atual + respostas do
 * curso. Encerramento: o da aula atual (se tiver roteiro), senão o do curso.
 */
export function useCourseRecap(platform: PlatformContext, lesson: Lesson, state: AttemptState | null, refreshKey: unknown): CourseRecap | null {
  const course = useCourseAnswers(platform.enrollmentId, refreshKey);
  return useMemo(() => {
    const local = findRecapEndNode(lesson.graph, state);
    const endNode = local ?? platform.recap?.endNode;
    if (!endNode) return null;
    const empty: AttemptState = state ?? {
      stateVersion: 1,
      status: 'in_progress',
      currentNodeId: lesson.graph.startNodeId,
      variables: {},
      path: [],
      answers: {},
      completedNodeIds: [],
      startedAt: '',
    };
    const nodes: Record<string, RecapSourceNode> = { ...(platform.recap?.nodes ?? {}), ...(course?.nodes ?? {}) };
    const items = resolveRecap(lesson.graph, endNode, empty, { answers: course?.answers, ...(course?.missions ? { missions: course.missions } : {}), lookupNode: (id) => nodes[id] });
    return { endNode, title: endNode.recapTitle?.trim() || DEFAULT_RECAP_TITLE, closingLine: endNode.closingLine?.trim() || undefined, items, ...(course?.answers ? { answers: course.answers } : {}), ...(course?.missions ? { missions: course.missions } : {}) };
  }, [platform.recap, lesson.graph, state, course]);
}

/** Gaveta lateral "Meu roteiro": Esc fecha, foco preso, foco volta ao botão que abriu. */
export function RecapDrawer({ open, onClose, recap, enrollmentId }: { open: boolean; onClose: () => void; recap: CourseRecap | null; enrollmentId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useCallback(() => onClose(), [onClose]);
  useFocusTrap(ref, { active: open, onEscape: close, initialFocus: '[data-recap-close]' });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" data-testid="recap-drawer">
      <div className="absolute inset-0 bg-[var(--im-overlay)] backdrop-blur-[2px]" aria-hidden="true" onClick={close} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="theme-platform absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col border-l border-line bg-bg-2 shadow-[-24px_0_60px_-30px_rgb(0_0_0/0.8)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 md:px-7">
          <p id={titleId} className="eyebrow">
            Meu roteiro
          </p>
          <button
            type="button"
            data-recap-close
            onClick={close}
            aria-label="Fechar Meu roteiro"
            className="inline-flex size-11 items-center justify-center rounded-full text-fg hover:bg-fg/10"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-7">
          {recap ? (
            <RecapView items={recap.items} title={recap.title} closingLine={recap.closingLine} variant="drawer" headingLevel={2} {...(enrollmentId ? { enrollmentId } : {})} />
          ) : (
            <div className="space-y-2">
              <h2 className="text-2xl! font-semibold! text-fg">Meu roteiro</h2>
              <p className="text-base leading-relaxed text-fg/75">Este curso ainda não tem um roteiro para montar. As suas respostas continuam guardadas em cada aula.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Botão "Meu roteiro" fora do player (página do curso): resolve o roteiro do
 * curso com as respostas de todas as aulas e abre a mesma gaveta.
 */
export function CourseRecapButton({ recap, enrollmentId, className }: { recap: PlatformContext['recap']; enrollmentId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const course = useCourseAnswers(enrollmentId, open);
  const resolved = useMemo<CourseRecap | null>(() => {
    if (!recap) return null;
    const { endNode } = recap;
    const nodes: Record<string, RecapSourceNode> = { ...recap.nodes, ...(course?.nodes ?? {}) };
    const empty: AttemptState = { stateVersion: 1, status: 'in_progress', currentNodeId: endNode.id, variables: {}, path: [], answers: {}, completedNodeIds: [], startedAt: '' };
    const items = resolveRecap({ schemaVersion: 1, startNodeId: endNode.id, nodes: [], edges: [], variables: [] } as unknown as Lesson['graph'], endNode, empty, {
      answers: course?.answers,
      ...(course?.missions ? { missions: course.missions } : {}),
      lookupNode: (id) => nodes[id],
    });
    return { endNode, title: endNode.recapTitle?.trim() || DEFAULT_RECAP_TITLE, closingLine: endNode.closingLine?.trim() || undefined, items, ...(course?.answers ? { answers: course.answers } : {}), ...(course?.missions ? { missions: course.missions } : {}) };
  }, [recap, course]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="open-recap"
        className={
          className ??
          'inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[12px] border border-line-strong px-5 text-base font-medium text-fg hover:border-fg/40 hover:bg-fg/5'
        }
      >
        <FileText className="size-5" aria-hidden="true" /> Meu roteiro
      </button>
      <RecapDrawer open={open} onClose={() => setOpen(false)} recap={resolved} enrollmentId={enrollmentId} />
    </>
  );
}
