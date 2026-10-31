'use client';

import * as React from 'react';
import { Scissors } from 'lucide-react';
import { reactionOpener } from '@lms/media/adjust';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDraft } from './draft-provider';

/*
 * Ajuste fino SEM REGRAVAR (A17): o worker remonta o vídeo com os clipes já pagos (custo 0).
 * A cena: tirar plano, tirar a primeira/última frase de um plano, trocar o cartão "Pergunta a seguir".
 * A reação: começar direto no conteúdo (sem "Boa escolha!"…).
 */

interface ShotOption { id: string; line: string; canDrop: boolean; canCutFirst: boolean; canCutLast: boolean }
type Options = { available: false; reason: string } | { available: true; sourceJobId: string; shots: ShotOption[]; teaser: string | null };
type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'reconciliation_required';
interface Job { id: string; status: JobStatus; lastError: string | null; createdAt: string; provider: string }
type ShotAction = 'keep' | 'drop' | 'first' | 'last';

const POLL_MS = 3000;
const message = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);

/** Pede o ajuste e acompanha o job até o fim; ao concluir, recarrega o rascunho (a mídia nova já está nele). */
function useAdjustJob(courseId: string, lessonId: string) {
  const { status: draftStatus, reload } = useDraft();
  const [state, setState] = React.useState<{ busy: boolean; nodeId: string | null; status: JobStatus | null; error: string | null; done: string | null }>({ busy: false, nodeId: null, status: null, error: null, done: null });
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const run = React.useCallback(
    async (nodeId: string, body: Record<string, unknown>, doneText: string, onDone?: () => void) => {
      if (draftStatus !== 'saved') {
        setState({ busy: false, nodeId, status: null, error: 'Espere o rascunho salvar e tente de novo.', done: null });
        return;
      }
      setState({ busy: true, nodeId, status: 'queued', error: null, done: null });
      try {
        const { job } = await api<{ job: Job }>(`/api/courses/${courseId}/media-jobs/adjust`, { json: { lessonId, ...body } });
        const poll = async () => {
          try {
            const r = await api<{ jobs: Job[] }>(`/api/courses/${courseId}/media-jobs?lessonId=${encodeURIComponent(lessonId)}&nodeId=${encodeURIComponent(nodeId)}`);
            const j = r.jobs.find((x) => x.id === job.id);
            if (!j || j.status === 'queued' || j.status === 'running') {
              setState((s) => ({ ...s, status: j?.status ?? s.status }));
              timer.current = setTimeout(() => void poll(), POLL_MS);
              return;
            }
            if (j.status === 'succeeded') {
              try {
                await reload();
              } catch {
                /* a mídia nova aparece ao recarregar a página */
              }
              setState({ busy: false, nodeId, status: j.status, error: null, done: doneText });
              onDone?.();
            } else {
              setState({ busy: false, nodeId, status: j.status, error: j.lastError ?? 'O ajuste não foi aplicado.', done: null });
            }
          } catch (e) {
            setState({ busy: false, nodeId, status: null, error: message(e, 'Não foi possível acompanhar o ajuste'), done: null });
          }
        };
        timer.current = setTimeout(() => void poll(), POLL_MS);
      } catch (e) {
        setState({ busy: false, nodeId, status: null, error: message(e, 'Não foi possível pedir o ajuste'), done: null });
      }
    },
    [courseId, lessonId, draftStatus, reload],
  );
  return { ...state, run };
}

function Progress({ status }: { status: JobStatus | null }) {
  return (
    <p role="status" aria-live="polite" className="text-sm text-fg-muted">
      {status === 'running' ? 'Montando o vídeo de novo com os clipes já gravados…' : 'Na fila para montar…'}
    </p>
  );
}

/** Seção da cena com vídeo dirigido: só aparece quando o vídeo aceita ajuste fino. */
export function SceneFineAdjust({ courseId, lessonId, nodeId, mediaAssetId }: { courseId: string; lessonId: string; nodeId: string; mediaAssetId: string | undefined }) {
  const [opts, setOpts] = React.useState<Options | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actions, setActions] = React.useState<Record<string, ShotAction>>({});
  const [teaser, setTeaser] = React.useState('');
  const job = useAdjustJob(courseId, lessonId);

  const load = React.useCallback(async () => {
    try {
      const r = await api<Options>(`/api/courses/${courseId}/media-jobs/adjust?lessonId=${encodeURIComponent(lessonId)}&nodeId=${encodeURIComponent(nodeId)}`);
      setOpts(r);
      setActions({});
      setTeaser(r.available ? (r.teaser ?? '') : '');
      setLoadError(null);
    } catch (e) {
      setLoadError(message(e, 'Não foi possível carregar o ajuste fino'));
    }
  }, [courseId, lessonId, nodeId]);
  React.useEffect(() => {
    setOpts(null);
    void load();
  }, [load, mediaAssetId]);

  if (loadError) return <p role="alert" className="text-sm text-danger">{loadError}</p>;
  if (!opts || !opts.available) return null;

  const teaserChanged = teaser.trim() !== (opts.teaser ?? '').trim();
  const chosen = Object.entries(actions).filter(([, a]) => a !== 'keep');
  const remaining = opts.shots.length - chosen.filter(([, a]) => a === 'drop').length;
  const words = teaser.trim() ? teaser.trim().split(/\s+/).length : 0;
  const canApply = !job.busy && (chosen.length > 0 || teaserChanged) && remaining >= 1 && words <= 22;
  const headingId = `fine-adjust-${nodeId}`;

  const apply = () => {
    const body = {
      target: 'scene',
      nodeId,
      drop: chosen.filter(([, a]) => a === 'drop').map(([id]) => id),
      cut: chosen.filter(([, a]) => a === 'first' || a === 'last').map(([shotId, a]) => ({ shotId, side: a })),
      ...(teaserChanged ? { teaser: teaser.trim() ? teaser.trim() : null } : {}),
    };
    void job.run(nodeId, body, 'Ajuste aplicado: o vídeo novo já está na cena. Publique o curso para os alunos verem.', () => void load());
  };

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-lg border border-line bg-surface p-3" data-testid="fine-adjust">
      <div className="space-y-0.5">
        <h4 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Scissors className="h-4 w-4" aria-hidden="true" /> Ajuste fino (sem regravar, grátis)
        </h4>
        <p className="text-xs text-fg-muted">Tire um trecho ou troque o cartão do fim. O vídeo é montado de novo com o que já foi gravado; a boca continua sincronizada.</p>
      </div>

      <ol className="space-y-2">
        {opts.shots.map((s, i) => {
          const a = actions[s.id] ?? 'keep';
          const set = (v: ShotAction) => setActions((m) => ({ ...m, [s.id]: v }));
          const choices: Array<{ v: ShotAction; label: string; ok: boolean }> = [
            { v: 'keep', label: 'Manter', ok: true },
            { v: 'drop', label: 'Tirar o trecho', ok: s.canDrop },
            { v: 'first', label: 'Tirar a primeira frase', ok: s.canCutFirst },
            { v: 'last', label: 'Tirar a última frase', ok: s.canCutLast },
          ];
          return (
            <li key={s.id} className={cn('space-y-2 rounded-md border border-line p-2', a !== 'keep' && 'border-accent/50 bg-accent/5')} data-testid={`fine-shot-${s.id}`}>
              <p className="text-sm text-fg">
                <span className="mr-1 text-xs font-medium text-fg-muted">Trecho {i + 1}</span>
                <span className={cn(a === 'drop' && 'line-through opacity-60')}>{s.line}</span>
              </p>
              <div role="radiogroup" aria-label={`O que fazer com o trecho ${i + 1}`} className="flex flex-wrap gap-1.5">
                {choices.filter((c) => c.ok).map((c) => (
                  <button
                    key={c.v}
                    type="button"
                    role="radio"
                    aria-checked={a === c.v}
                    disabled={job.busy}
                    onClick={() => set(c.v)}
                    className={cn('min-h-9 rounded-full border px-3 text-xs font-medium', a === c.v ? 'border-accent bg-accent-fill text-accent-fill-fg' : 'border-line-strong text-fg hover:bg-fg/5')}
                    data-testid={`fine-${s.id}-${c.v}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="space-y-1">
        <label htmlFor={`fine-teaser-${nodeId}`} className="text-sm font-medium text-fg">Cartão “Pergunta a seguir”</label>
        <Textarea id={`fine-teaser-${nodeId}`} rows={2} maxLength={300} value={teaser} disabled={job.busy} onChange={(e) => setTeaser(e.target.value)} data-testid="fine-teaser" />
        <p className={cn('text-xs', words > 22 ? 'text-danger' : 'text-fg-muted')}>
          O fato da situação e a mesma pergunta do bloco de escolha. {words} de 22 palavras. Deixe vazio para tirar o cartão.
        </p>
      </div>

      {remaining < 1 && <p role="alert" className="text-sm text-danger">Deixe pelo menos um trecho no vídeo.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={apply} disabled={!canApply} data-testid="fine-apply">
          {job.busy ? 'Aplicando…' : 'Aplicar ajuste'}
        </Button>
        {job.busy && <Progress status={job.status} />}
      </div>
      {job.done && <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success" data-testid="fine-done">{job.done}</p>}
      {job.error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" data-testid="fine-error">{job.error}</p>}
    </section>
  );
}

/** Botão na resposta cuja reação começa com interjeição ("Boa escolha!"…): o vídeo passa a começar no conteúdo. */
export function ReactionFineAdjust({ courseId, lessonId, choiceId, optionId, reaction }: { courseId: string; lessonId: string; choiceId: string; optionId: string; reaction: { text: string; media?: { kind?: string } } | undefined }) {
  const job = useAdjustJob(courseId, lessonId);
  const opener = reactionOpener(reaction?.text);
  if (!reaction) return null;
  const nodeId = `${choiceId}~${optionId}`;
  return (
    <div className="space-y-2 rounded-md border border-line bg-surface p-2" data-testid={`reaction-${optionId}`}>
      <p className="text-sm text-fg">
        <span className="mr-1 text-xs font-medium text-fg-muted">Reação da instrutora</span>
        {reaction.text}
      </p>
      {opener && reaction.media?.kind === 'video' && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={job.busy}
            onClick={() => void job.run(nodeId, { target: 'reaction', choiceId, optionId }, `Pronto: a reação começa direto no conteúdo, sem “${opener}”.`)}
            data-testid={`reaction-trim-${optionId}`}
          >
            <Scissors className="h-4 w-4" aria-hidden="true" /> {job.busy ? 'Cortando…' : 'Começar direto no conteúdo'}
          </Button>
          {!job.busy && !job.done && <span className="text-xs text-fg-muted">Tira “{opener}” do vídeo, sem regravar.</span>}
          {job.busy && <Progress status={job.status} />}
        </div>
      )}
      {job.done && <p role="status" className="text-sm text-success">{job.done}</p>}
      {job.error && <p role="alert" className="text-sm text-danger">{job.error}</p>}
    </div>
  );
}
