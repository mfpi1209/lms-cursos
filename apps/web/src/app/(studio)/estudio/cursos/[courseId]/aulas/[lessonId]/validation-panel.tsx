'use client';

import * as React from 'react';
import type { CompileIssue, CourseCompileResult, LessonCompileResult } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ValidationPanelProps {
  courseId: string;
  lessonId: string;
  /** resultado local (compileLesson a cada alteração) */
  live: LessonCompileResult;
  onSelectNode(nodeId: string): void;
}

type ServerResult = CourseCompileResult & { revision: number };

export function ValidationPanel({ courseId, lessonId, live, onSelectNode }: ValidationPanelProps) {
  const [result, setResult] = React.useState<ServerResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const validate = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api<ServerResult>(`/api/courses/${courseId}/validate`, { method: 'POST' }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível validar');
    } finally {
      setLoading(false);
    }
  };

  const lessonResult = result?.lessons[lessonId];
  const courseLevel = result
    ? {
        errors: result.errors.filter((i) => !i.lessonId),
        warnings: result.warnings.filter((i) => !i.lessonId),
      }
    : null;

  return (
    <section aria-labelledby="validation-heading" className="space-y-3" data-testid="validation-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="validation-heading" className="text-sm font-semibold text-fg">Validação</h2>
        <div className="flex items-center gap-1" aria-label="Pendências ao vivo">
          <Badge tone={live.errors.length ? 'danger' : 'success'} data-testid="live-errors">{live.errors.length} {live.errors.length === 1 ? 'erro' : 'erros'}</Badge>
          <Badge tone={live.warnings.length ? 'warning' : 'neutral'} data-testid="live-warnings">{live.warnings.length} {live.warnings.length === 1 ? 'aviso' : 'avisos'}</Badge>
        </div>
      </div>
      <p className="text-xs text-fg-muted">Contagem ao vivo desta aula. A validação completa usa o rascunho gravado no servidor.</p>
      <Button variant="secondary" size="sm" onClick={() => void validate()} disabled={loading} data-testid="validate">
        {loading ? 'Validando…' : 'Validar no servidor'}
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {result && (
        <div data-testid="validation-issues" className="space-y-2">
          <p className="text-xs text-fg-muted">
            Revisão {result.revision} · {result.ok ? 'pronto para publicar' : 'há erros que bloqueiam a publicação'}
          </p>
          <IssueList title="Erros desta aula" issues={lessonResult?.errors ?? []} tone="error" onSelectNode={onSelectNode} />
          <IssueList title="Avisos desta aula" issues={lessonResult?.warnings ?? []} tone="warning" onSelectNode={onSelectNode} />
          {courseLevel && (courseLevel.errors.length > 0 || courseLevel.warnings.length > 0) && (
            <>
              <IssueList title="Erros do curso" issues={courseLevel.errors} tone="error" onSelectNode={onSelectNode} />
              <IssueList title="Avisos do curso" issues={courseLevel.warnings} tone="warning" onSelectNode={onSelectNode} />
            </>
          )}
          {(lessonResult?.errors.length ?? 0) + (lessonResult?.warnings.length ?? 0) + (courseLevel?.errors.length ?? 0) + (courseLevel?.warnings.length ?? 0) === 0 && (
            <p className="text-sm text-success">Nenhuma pendência nesta aula.</p>
          )}
        </div>
      )}
    </section>
  );
}

function IssueList({ title, issues, tone, onSelectNode }: { title: string; issues: CompileIssue[]; tone: 'error' | 'warning'; onSelectNode: (id: string) => void }) {
  if (issues.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold text-fg-muted">{title}</h3>
      <ul className="mt-1 space-y-1">
        {issues.map((i, idx) => {
          const cls = cn('block w-full rounded-md px-2 py-1.5 text-left text-sm', tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg-muted');
          return (
            <li key={`${i.code}-${idx}`} data-testid={`issue-${i.code}`}>
              {i.nodeId ? (
                <button type="button" className={cn(cls, 'hover:underline')} onClick={() => onSelectNode(i.nodeId!)}>
                  {i.message}
                </button>
              ) : (
                <span className={cls}>{i.message}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Lista compacta das pendências ao vivo (sem chamada ao servidor). */
export function LiveIssues({ live, onSelectNode }: { live: LessonCompileResult; onSelectNode: (id: string) => void }) {
  if (live.errors.length === 0 && live.warnings.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="live-issues">
      <IssueList title="Erros (ao vivo)" issues={live.errors} tone="error" onSelectNode={onSelectNode} />
      <IssueList title="Avisos (ao vivo)" issues={live.warnings} tone="warning" onSelectNode={onSelectNode} />
    </div>
  );
}
