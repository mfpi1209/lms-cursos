'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, CircleAlert, Clapperboard } from 'lucide-react';
import { findLesson, type CourseCompileResult, type CompileIssue } from '@lms/course-schema';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, Badge } from '@/components/ui/card';
import { useDraft } from '@/components/studio/draft-provider';
import { useSharedMediaQueue } from '@/components/studio/media-queue/use-media-queue';
import { countLabel, issueCodeLabel } from '@/components/studio/storyboard/scene-model';
import { courseVideoStats, videosReadyLine } from '@/components/studio/video-stats';
import { ReviewQuality } from '@/components/studio/quality/review-quality';
import { PublishConfirm, type MediaCounts } from '@/components/studio/publish-confirm';

type Validation = CourseCompileResult & { revision: number; media?: MediaCounts };
const NO_MEDIA: MediaCounts = { stale: 0, simulated: 0, missing: 0, inProgress: 0 };

function IssueList({ issues, tone, courseId, sceneTitle }: { issues: CompileIssue[]; tone: 'danger' | 'warning'; courseId: string; sceneTitle: (lessonId: string, nodeId?: string) => string | undefined }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1.5 text-sm">
      {issues.map((i, idx) => {
        const scene = i.lessonId ? sceneTitle(i.lessonId, i.nodeId) : undefined;
        return (
          <li key={idx} className="flex flex-wrap items-start gap-2">
            <Badge tone={tone} title={i.code}>{issueCodeLabel(i.code)}</Badge>
            <span className="text-fg">
              {scene && <span className="font-medium">{scene}: </span>}
              {i.message}
            </span>
            {i.lessonId && (
              <Link
                className="font-medium text-accent-strong underline"
                href={`/estudio/cursos/${courseId}/aulas/${i.lessonId}${i.nodeId ? `?node=${encodeURIComponent(i.nodeId)}` : ''}`}
                aria-label={scene ? `Abrir a cena “${scene}” no editor` : 'Abrir a aula no editor'}
              >
                {i.nodeId ? 'ver na cena' : 'abrir aula'}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ReviewPanel({ courseId, initial, canPublish }: { courseId: string; initial: Validation; canPublish: boolean }) {
  const router = useRouter();
  const { document: doc } = useDraft();
  const queue = useSharedMediaQueue();
  const [validation, setValidation] = useState<Validation>(initial);
  const [busy, setBusy] = useState<'validate' | 'publish' | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  /** confirmação em linha com o estado da mídia (auditoria P1-2) */
  const [confirming, setConfirming] = useState(false);
  const videos = useMemo(() => courseVideoStats(doc, queue?.data?.items), [doc, queue?.data?.items]);

  const lessonTitle = (lessonId: string) => findLesson(doc, lessonId)?.lesson.title || lessonId;
  const sceneTitle = (lessonId: string, nodeId?: string) => {
    if (!nodeId) return undefined;
    const node = findLesson(doc, lessonId)?.lesson.graph.nodes.find((n) => n.id === nodeId);
    return node?.title?.trim() || undefined;
  };

  async function revalidate() {
    setBusy('validate');
    setMessage(null);
    try {
      setValidation(await api<Validation>(`/api/courses/${courseId}/validate`, { method: 'POST' }));
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erro ao validar' });
    } finally {
      setBusy(null);
    }
  }

  async function publish(opts: { allowSimulatedMedia: boolean }) {
    setBusy('publish');
    setMessage(null);
    try {
      // `expectedRevision` obrigatório: publica exatamente a revisão validada
      const r = await api<{ versionNumber: number }>(`/api/courses/${courseId}/publish`, { json: { expectedRevision: validation.revision, allowSimulatedMedia: opts.allowSimulatedMedia } });
      setConfirming(false);
      setMessage({ tone: 'success', text: `Versão v${r.versionNumber} publicada.` });
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PUBLISH_BLOCKED' && e.details) {
        setValidation({ ...(e.details as CourseCompileResult & { media?: MediaCounts }), revision: validation.revision });
        setMessage({ tone: 'danger', text: e.message });
      } else if (e instanceof ApiError && e.code === 'CONFLICT') {
        setConfirming(false);
        setMessage({ tone: 'danger', text: e.message });
        await revalidate();
      } else {
        setMessage({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Erro ao publicar' });
      }
    } finally {
      setBusy(null);
    }
  }

  const lessonEntries = Object.entries(validation.lessons);
  const errorsLabel = countLabel(validation.errors.length, 'erro', 'erros');
  const warningsLabel = countLabel(validation.warnings.length, 'aviso', 'avisos');
  return (
    <section className="space-y-6" aria-labelledby="review-title">
      <div className="space-y-3">
        <h2 id="review-title" className="text-2xl sm:text-3xl">Validação do rascunho <span className="text-fg-faint">rev. {validation.revision}</span></h2>
        <p className="max-w-prose text-fg-muted">Erros bloqueiam a publicação. Avisos são editoriais e podem ser revisados. A validação estrutural não é prova de qualidade pedagógica.</p>
      </div>

      <Card accent className="rise space-y-5" data-testid="validation-summary">
        <div className="flex flex-wrap items-center gap-4">
          <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-full', validation.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')} aria-hidden="true">
            {validation.ok ? <Check className="h-6 w-6" strokeWidth={3} /> : <CircleAlert className="h-6 w-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-bold">{validation.ok ? 'Pronto para publicar' : `${errorsLabel} ${validation.errors.length === 1 ? 'bloqueia' : 'bloqueiam'} a publicação`}</p>
            <p className="text-sm text-fg-muted">
              {validation.errors.length === 0 && validation.warnings.length === 0 ? 'Nenhum problema estrutural encontrado.' : `${warningsLabel} ${validation.warnings.length === 1 ? 'editorial' : 'editoriais'}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={validation.ok ? 'success' : 'danger'}>{validation.ok ? 'Pronto para publicar' : errorsLabel}</Badge>
            <Badge tone={validation.warnings.length ? 'warning' : 'neutral'}>{warningsLabel}</Badge>
          </div>
        </div>
        {videos.total > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted" data-testid="review-video-stats">
            <Clapperboard className="h-4 w-4 shrink-0 text-paid" aria-hidden="true" />
            <span>
              <span className="font-medium text-fg">Vídeos:</span> {videosReadyLine(videos)}
            </span>
          </p>
        )}
        {/* Avaliação de qualidade (IA): informativa, não bloqueia a publicação */}
        <ReviewQuality courseId={courseId} lessonCount={doc.modules.reduce((s, m) => s + m.lessons.length, 0)} />
        {message && (
          <p role="status" className={cn('rounded-xl px-4 py-3 text-sm', message.tone === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')} data-testid="publish-message">
            {message.text}
          </p>
        )}
        {confirming ? (
          <PublishConfirm
            revision={validation.revision}
            media={validation.media ?? NO_MEDIA}
            videos={videos}
            warningsCount={validation.warnings.length}
            busy={busy === 'publish'}
            onConfirm={(o) => void publish(o)}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {canPublish && (
              <Button size="lg" onClick={() => { setMessage(null); setConfirming(true); }} disabled={busy !== null || !validation.ok} data-testid="publish">Publicar nova versão</Button>
            )}
            <Button variant="secondary" size={canPublish ? 'lg' : 'md'} onClick={revalidate} disabled={busy !== null} data-testid="revalidate">{busy === 'validate' ? 'Validando…' : 'Revalidar'}</Button>
          </div>
        )}
      </Card>

      {lessonEntries.map(([lessonId, r]) => (
        <Card key={lessonId} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-lg font-bold">
              Aula: {lessonTitle(lessonId)}
              <span className="sr-only"> (identificador {lessonId})</span>
            </h3>
            <div className="flex flex-wrap gap-1">
              <Badge tone={r.ok ? 'success' : 'danger'}>{r.ok ? 'Sem erros' : countLabel(r.errors.length, 'erro', 'erros')}</Badge>
              {r.warnings.length > 0 && <Badge tone="warning">{countLabel(r.warnings.length, 'aviso', 'avisos')}</Badge>}
            </div>
          </div>
          <IssueList issues={r.errors} tone="danger" courseId={courseId} sceneTitle={sceneTitle} />
          <IssueList issues={r.warnings} tone="warning" courseId={courseId} sceneTitle={sceneTitle} />
        </Card>
      ))}
      {(() => {
        const inLessons = new Set(lessonEntries.flatMap(([, r]) => [...r.errors, ...r.warnings]));
        const courseErrors = validation.errors.filter((i) => !inLessons.has(i));
        const courseWarnings = validation.warnings.filter((i) => !inLessons.has(i));
        if (courseErrors.length === 0 && courseWarnings.length === 0) return null;
        return (
          <Card className="space-y-3">
            <h3 className="font-display text-lg font-bold">Curso</h3>
            <IssueList issues={courseErrors} tone="danger" courseId={courseId} sceneTitle={sceneTitle} />
            <IssueList issues={courseWarnings} tone="warning" courseId={courseId} sceneTitle={sceneTitle} />
          </Card>
        );
      })()}
    </section>
  );
}
