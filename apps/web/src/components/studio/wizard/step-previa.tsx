'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, CircleAlert, CircleDashed, ExternalLink, Play } from 'lucide-react';
import { allLessons, richTextToPlain, type CourseCompileResult, type CourseDocument } from '@lms/course-schema';
import { LESSON_CAPS } from '@lms/ai/client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { useDraft } from '@/components/studio/draft-provider';
import { previewHref } from '@/components/studio/test-mode/test-model';
import { PreviewLink } from '@/components/studio/test-mode/preview-link';
import { errorMessage } from './agent-api';
import { isMediaNode, lessonStats, nodeText } from './wizard-state';

type Validation = CourseCompileResult & { revision?: number };
/** erros que significam "esta aula não chega ao fim" */
const END_CODES = new Set(['OPTION_WITHOUT_DESTINATION', 'NO_EXIT', 'DEAD_END_PATH', 'NO_END_REACHABLE', 'NO_END_NODE', 'EDGE_TO_MISSING', 'NO_FALLBACK']);

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Leituras locais do rascunho (sem rede): texto da tela acima do limite e cenas sem fala. */
function localChecks(doc: CourseDocument) {
  const longScenes: { lessonId: string; lessonTitle: string; nodeId: string; title: string; n: number; max: number }[] = [];
  const silent: { lessonId: string; lessonTitle: string; nodeId: string; title: string }[] = [];
  for (const l of allLessons(doc)) {
    for (const n of l.graph.nodes) {
      if (!isMediaNode(n)) continue;
      const text = richTextToPlain(nodeText(n));
      if (!text.trim()) continue;
      const max = n.type === 'content' ? LESSON_CAPS.maxContentWords : n.type === 'consequence' ? LESSON_CAPS.maxConsequenceWords : LESSON_CAPS.maxScreenWords;
      const count = words(text);
      if (count > max) longScenes.push({ lessonId: l.id, lessonTitle: l.title, nodeId: n.id, title: n.title ?? n.id, n: count, max });
      if (!('narration' in n) || !n.narration?.trim()) silent.push({ lessonId: l.id, lessonTitle: l.title, nodeId: n.id, title: n.title ?? n.id });
    }
  }
  return { longScenes, silent };
}

/**
 * Prévia: testar o curso como aluno antes de gastar com vídeo. Lista as aulas
 * com "Testar" (prévia com a barra de modo de teste; nada é salvo), "Testar do
 * início" e a lista de verificação com o resultado do compilador.
 */
export function StepPrevia({ onTested }: { onTested?: () => void }) {
  const { courseId, document: doc, status } = useDraft();
  const [validation, setValidation] = React.useState<Validation | null>(null);
  const [valError, setValError] = React.useState<string | null>(null);
  const lessons = allLessons(doc);
  const base = `/estudio/cursos/${courseId}`;

  const validate = React.useCallback(async () => {
    setValError(null);
    try {
      setValidation(await api<Validation>(`/api/courses/${courseId}/validate`, { method: 'POST' }));
    } catch (e) {
      setValError(errorMessage(e, 'Não foi possível conferir o curso'));
    }
  }, [courseId]);

  // confere quando o rascunho estabiliza (depois de gravar)
  React.useEffect(() => {
    if (status === 'saved') void validate();
  }, [status, validate]);

  const errors = validation?.errors ?? [];
  const warnings = validation?.warnings ?? [];
  const endOk = validation ? !errors.some((e) => END_CODES.has(e.code)) : null;
  const objectivesOk = validation ? doc.objectives.length > 0 && !warnings.some((w) => w.code === 'OBJECTIVE_UNCOVERED') : null;
  const { longScenes, silent } = React.useMemo(() => localChecks(doc), [doc]);
  const otherErrors = errors.filter((e) => !END_CODES.has(e.code));
  const emptyLessons = lessons.filter((l) => lessonStats(l).empty);
  const first = lessons[0];
  const ready = [endOk, objectivesOk, longScenes.length === 0, silent.length === 0, validation ? otherErrors.length === 0 : null].filter((x) => x === true).length;

  const sceneHref = (lessonId: string, nodeId: string) => `${base}/aulas/${lessonId}?node=${encodeURIComponent(nodeId)}`;

  return (
    <div className="space-y-10">
      <section aria-labelledby="previa-testar" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="previa-testar" className="font-display text-xl font-bold">Teste como aluno</h2>
            <p className="text-sm text-fg-muted">A prévia abre numa nova aba com a barra de teste: pule cenas, mude as escolhas e volte quando quiser. Nada é salvo.</p>
          </div>
          {first ? (
            <PreviewLink
              href={previewHref(courseId, first.id)}
              target="_blank"
              rel="noopener"
              onClick={onTested}
              className={cn(buttonVariants({ size: 'lg' }))}
              data-testid="preview-start"
            >
              <Play className="h-5 w-5" aria-hidden="true" /> Testar do início
              <span className="sr-only"> (abre em nova aba)</span>
            </PreviewLink>
          ) : (
            <p className="text-sm text-fg-muted">Ainda não há aulas para testar. Volte à Estrutura.</p>
          )}
        </div>
        {lessons.length > 0 && (
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-bg-2" data-testid="preview-lessons">
            {lessons.map((l, i) => {
              const s = lessonStats(l);
              return (
                <li key={l.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`preview-lesson-${l.id}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-sm font-bold text-accent-strong tabular-nums" aria-hidden="true">{i + 1}</span>
                    <div className="min-w-0">
                      <p id={`preview-lesson-title-${l.id}`} className="font-medium text-fg">{l.title}</p>
                      <p className="text-xs text-fg-muted">
                        {s.empty ? 'Sem cenas ainda' : `${s.scenes} ${s.scenes === 1 ? 'cena' : 'cenas'}, ${s.decisions} ${s.decisions === 1 ? 'decisão' : 'decisões'}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link href={`${base}/aulas/${l.id}`} aria-describedby={`preview-lesson-title-${l.id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>Storyboard</Link>
                    {!s.empty && (
                      <PreviewLink
                        href={previewHref(courseId, l.id)}
                        target="_blank"
                        rel="noopener"
                        onClick={onTested}
                        aria-describedby={`preview-lesson-title-${l.id}`}
                        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                        data-testid={`preview-test-${l.id}`}
                      >
                        <Play className="h-4 w-4" aria-hidden="true" /> Testar <ExternalLink className="h-3.5 w-3.5 text-fg-faint" aria-hidden="true" />
                        <span className="sr-only"> (abre em nova aba)</span>
                      </PreviewLink>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="previa-checklist" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="previa-checklist" className="font-display text-xl font-bold">Lista de verificação</h2>
            <p className="text-sm text-fg-muted">{validation ? `${ready} de 5 itens prontos.` : 'Conferindo o curso…'}</p>
          </div>
          <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong hover:underline" onClick={() => void validate()}>Conferir de novo</button>
        </div>
        {valError && <p role="alert" className="text-sm text-danger">{valError}</p>}
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-bg-2" data-testid="preview-checklist">
          <CheckRow
            ok={emptyLessons.length ? false : endOk}
            label="Todas as aulas têm fim"
            detail={emptyLessons.length ? `${emptyLessons.length} aula(s) ainda sem cenas. Gere no passo "Aulas".` : endOk === false ? 'Há decisões ou cenas que não levam a lugar nenhum. Abra a cena para corrigir.' : undefined}
          />
          <CheckRow ok={objectivesOk} label="Objetivos cobertos" detail={objectivesOk === false ? (doc.objectives.length === 0 ? 'O curso não tem objetivos. Volte ao passo "Estrutura".' : 'Há objetivos obrigatórios que nenhuma cena trabalha.') : undefined} />
          <CheckRow ok={longScenes.length === 0} label="Texto por cena dentro do limite" detail={longScenes.length ? `${longScenes.length} cena(s) passam do limite de palavras na tela. Encurte ou peça "Encurtar" no storyboard.` : undefined} />
          <CheckRow ok={silent.length === 0} label="Cenas sem fala" soft detail={silent.length ? `${silent.length} cena(s) ainda usam o texto da tela como fala. Dá para publicar assim, mas a fala escrita para ser dita soa mais natural.` : 'Todas as cenas com texto têm fala escrita.'} />
          <CheckRow ok={validation ? otherErrors.length === 0 : null} label="Sem outros problemas que bloqueiem a publicação" detail={otherErrors.length ? `${otherErrors.length} problema(s) listados abaixo.` : undefined} />
        </ul>

        {(longScenes.length > 0 || errors.length > 0) && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-fg">O que corrigir</p>
            <ul className="space-y-1 text-sm">
              {errors.map((i, idx) => (
                <li key={`e-${idx}`} className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-danger">
                  {i.lessonId ? <Link href={sceneHref(i.lessonId, i.nodeId ?? '')} className="hover:underline">{i.message}</Link> : i.message}
                </li>
              ))}
              {longScenes.slice(0, 8).map((s) => (
                <li key={`l-${s.lessonId}-${s.nodeId}`} className="rounded-lg bg-surface-2 px-3 py-2 text-fg-muted">
                  <Link href={sceneHref(s.lessonId, s.nodeId)} className="hover:underline">
                    {s.lessonTitle} › {s.title}: {s.n} palavras na tela (limite {s.max}).
                  </Link>
                </li>
              ))}
              {longScenes.length > 8 && <li className="px-1 text-xs text-fg-faint">E mais {longScenes.length - 8}.</li>}
            </ul>
          </div>
        )}
        {warnings.length > 0 && (
          <details className="rounded-xl border border-line bg-bg-2 px-4 py-1">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-fg">{warnings.length} {warnings.length === 1 ? 'sugestão' : 'sugestões'} (não bloqueiam)</summary>
            <ul className="mb-3 mt-1 space-y-1 text-sm text-fg-muted">
              {warnings.map((i, idx) => (
                <li key={idx} className="rounded-lg bg-surface-2 px-3 py-2">
                  {i.lessonId ? <Link href={sceneHref(i.lessonId, i.nodeId ?? '')} className="hover:underline">{i.message}</Link> : i.message}
                </li>
              ))}
            </ul>
          </details>
        )}
        {silent.length > 0 && (
          <p className="text-xs text-fg-faint">
            <Badge tone="ai">Dica</Badge> No storyboard, peça à IA "Escrever as falas" para as cenas sem fala; você revisa antes de aplicar.
          </p>
        )}
      </section>
    </div>
  );
}

function CheckRow({ ok, label, detail, soft = false }: { ok: boolean | null; label: string; detail?: string; soft?: boolean }) {
  const Icon = ok === null ? CircleDashed : ok ? Check : CircleAlert;
  const tone = ok === null ? 'bg-surface-2 text-fg-faint' : ok ? 'bg-success-soft text-success' : soft ? 'bg-paid-soft text-paid' : 'bg-danger-soft text-danger';
  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <span className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full', tone)}>
        <Icon className="h-4 w-4" strokeWidth={ok ? 3 : 2} aria-hidden="true" />
      </span>
      <span className="min-w-0 text-sm">
        <span className="block font-medium text-fg">
          {label}
          <span className="sr-only">: {ok === null ? 'conferindo' : ok ? 'ok' : soft ? 'atenção' : 'pendente'}</span>
        </span>
        {detail && <span className="block text-fg-muted">{detail}</span>}
      </span>
    </li>
  );
}
