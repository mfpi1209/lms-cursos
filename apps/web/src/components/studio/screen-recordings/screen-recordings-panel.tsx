'use client';

import * as React from 'react';
import Link from 'next/link';
import { MonitorPlay, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/card';
import { useDraft } from '@/components/studio/draft-provider';
import { cn } from '@/lib/utils';
import {
  RECORDING_STATE_LABEL,
  describeMock,
  formatLimit,
  isPendingRecording,
  listScreenRecordings,
  prepareBatch,
  previewMockSteps,
  recordingState,
  summarizeScreenRecordings,
  type BatchItem,
  type RecordingState,
  type ScreenRecordingRow,
} from '@/lib/screen-recordings';
import { uploadScreenRecording } from './upload';

const STATE_TONE: Record<RecordingState, BadgeTone> = { missing: 'warning', uploaded: 'success', short: 'danger', trimmed: 'warning', mock_pending: 'brand', mock_ready: 'success' };

const ITEM_LABEL: Record<BatchItem<File>['status'], string> = {
  waiting: 'Na fila',
  sending: 'Enviando',
  done: 'Enviado',
  error: 'Falhou',
  unrecognized: 'Não reconhecido',
  duplicate: 'Repetido',
  invalid: 'Recusado',
};

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

/**
 * Tela "Gravações de tela": as cenas do curso com vídeo próprio (MP4 em tela cheia), o estado de cada arquivo e o
 * envio em lote, em que cada arquivo é ligado pelo NOME à gravação correspondente. Nada é gerado nem montado aqui (as telas simuladas são geradas pela plataforma).
 */
export function ScreenRecordingsPanel({ courseId, canEdit, maxBytes }: { courseId: string; canEdit: boolean; maxBytes: number }) {
  const { document: doc, status, saveNow, reload } = useDraft();
  const rows = React.useMemo(() => listScreenRecordings(doc), [doc]);
  const summary = React.useMemo(() => summarizeScreenRecordings(rows), [rows]);
  const [onlyPending, setOnlyPending] = React.useState(false);
  const [items, setItems] = React.useState<BatchItem<File>[]>([]);
  const [running, setRunning] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const statusRef = React.useRef(status);
  statusRef.current = status;
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;

  const visible = onlyPending ? rows.filter(isPendingRecording) : rows;
  const lessons = React.useMemo(() => {
    const out: { lessonId: string; title: string; scenes: { nodeId: string; title: string; recs: ScreenRecordingRow[] }[] }[] = [];
    for (const r of visible) {
      let lesson = out.find((l) => l.lessonId === r.lessonId);
      if (!lesson) out.push((lesson = { lessonId: r.lessonId, title: r.lessonTitle, scenes: [] }));
      let scene = lesson.scenes.find((s) => s.nodeId === r.nodeId);
      if (!scene) lesson.scenes.push((scene = { nodeId: r.nodeId, title: r.nodeTitle, recs: [] }));
      scene.recs.push(r);
    }
    return out;
  }, [visible]);
  const readyScenes = React.useMemo(() => {
    const byScene = new Map<string, boolean>();
    for (const r of rows) byScene.set(`${r.lessonId}/${r.nodeId}`, (byScene.get(`${r.lessonId}/${r.nodeId}`) ?? true) && !!r.assetId);
    return byScene;
  }, [rows]);

  const patchItem = (id: string, patch: Partial<BatchItem<File>>) => setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const start = async (list: File[]) => {
    if (!canEdit || running || list.length === 0) return;
    setNotice(null);
    if (statusRef.current === 'conflict') {
      setNotice('O rascunho mudou em outra aba ou por outra pessoa. Recarregue a página antes de enviar.');
      return;
    }
    try {
      await saveNow(); // alterações pendentes de outra tela entram antes: o servidor grava uma nova revisão
    } catch {
      /* o indicador de salvamento mostra o erro */
    }
    const batch = prepareBatch(list, rowsRef.current, maxBytes);
    setItems(batch);
    setRunning(true);
    let sent = 0;
    for (const it of batch) {
      if (it.status !== 'waiting') continue;
      patchItem(it.id, { status: 'sending', progress: 0 });
      try {
        const res = await uploadScreenRecording(courseId, it.file, (p) => patchItem(it.id, { progress: p }));
        sent++;
        patchItem(it.id, { status: 'done', progress: 1, message: res.linked > 1 ? `Ligado em ${res.linked} gravações (o mesmo nome aparece em mais de uma cena).` : 'Ligado à gravação da cena.' });
      } catch (e) {
        patchItem(it.id, { status: 'error', message: e instanceof Error ? e.message : 'Não foi possível enviar.' });
      }
    }
    setRunning(false);
    if (sent > 0) {
      try {
        if (statusRef.current === 'saved') await reload();
        else setNotice('Há alterações suas ainda não salvas; recarregue a página para ver o estado atualizado.');
      } catch {
        setNotice('Os arquivos foram ligados, mas não foi possível atualizar a lista. Recarregue a página.');
      }
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    void start(files);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void start(Array.from(e.dataTransfer.files));
  };

  const batchDone = items.length > 0 && !running;
  const batchCounts = {
    done: items.filter((i) => i.status === 'done').length,
    failed: items.filter((i) => i.status === 'error' || i.status === 'invalid').length,
    unknown: items.filter((i) => i.status === 'unrecognized').length,
  };

  return (
    <section aria-labelledby="gravacoes-titulo" className="panel space-y-6 p-5 sm:p-6" data-testid="screen-recordings-panel">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-paid-soft text-paid" aria-hidden="true">
          <MonitorPlay className="h-5 w-5" />
        </span>
        <h2 id="gravacoes-titulo" className="font-display text-xl font-bold sm:text-2xl">Gravações de tela</h2>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted" data-testid="recordings-empty">
          Este curso não tem cenas com gravação de tela. Para usar uma, escreva a linha <span className="font-medium text-fg">Vídeo próprio: nome-do-arquivo.mp4</span> na cena do roteiro e importe de novo.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <p role="status" aria-live="polite" className="text-base font-medium text-fg" data-testid="recordings-summary">
              {summary.total > 0 || summary.simulated === 0 ? (
                <>
                  <span className="tabular-nums">{summary.uploaded}</span> de <span className="tabular-nums">{summary.total}</span> {summary.total === 1 ? 'arquivo enviado' : 'arquivos enviados'}
                </>
              ) : (
                'Nenhum arquivo para enviar'
              )}
            </p>
            {summary.simulated > 0 && (
              <p className="text-sm text-fg-muted" data-testid="recordings-simulated-summary">
                <span className="tabular-nums">{summary.simulated}</span> {summary.simulated === 1 ? 'tela simulada' : 'telas simuladas'}: <span className="tabular-nums">{summary.simulatedReady}</span> {summary.simulatedReady === 1 ? 'gerada' : 'geradas'}, <span className="tabular-nums">{summary.simulatedPending}</span> {summary.simulatedPending === 1 ? 'será gerada' : 'serão geradas'} pela plataforma. Enviar um MP4 com o mesmo nome substitui a tela simulada.
              </p>
            )}
            <p className="text-sm text-fg-muted" data-testid="recordings-scenes-summary">
              {summary.scenesReady} de {summary.scenes} {summary.scenes === 1 ? 'cena pronta' : 'cenas prontas'} para montar
              {summary.attention > 0 && ` · ${summary.attention} ${summary.attention === 1 ? 'pede' : 'pedem'} atenção depois da montagem`}
            </p>
          </div>

          {canEdit ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn('rounded-2xl border-2 border-dashed p-5 text-center transition-colors', dragging ? 'border-accent bg-accent-soft' : 'border-line-strong')}
              data-testid="recordings-dropzone"
            >
              <UploadCloud className="mx-auto h-6 w-6 text-fg-muted" aria-hidden="true" />
              <p className="mt-2 text-sm text-fg">Arraste os MP4 para cá ou escolha vários de uma vez.</p>
              <p className="mx-auto mt-1 max-w-prose text-xs text-fg-muted">
                Cada arquivo é ligado pelo nome à gravação do roteiro (maiúsculas e o “.mp4” não importam). Até {formatLimit(maxBytes)} por arquivo. Se o mesmo nome aparecer em mais de uma cena, o arquivo é ligado em todas.
              </p>
              <input ref={inputRef} type="file" multiple accept="video/mp4,.mp4" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onPick} data-testid="recordings-input" />
              <Button className="mt-3" variant="primary" size="sm" disabled={running} onClick={() => inputRef.current?.click()} data-testid="recordings-pick">
                {running ? 'Enviando…' : 'Escolher arquivos'}
              </Button>
            </div>
          ) : (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">Você pode acompanhar o estado das gravações, mas só quem edita o curso envia os arquivos.</p>
          )}

          {notice && <p role="alert" className="rounded-xl bg-paid-soft px-4 py-3 text-sm text-paid">{notice}</p>}

          {items.length > 0 && (
            <div className="space-y-3" data-testid="recordings-batch">
              <h3 className="text-base font-semibold">Último envio</h3>
              <p role="status" aria-live="polite" className="text-sm text-fg-muted" data-testid="recordings-batch-summary">
                {running
                  ? 'Enviando…'
                  : `${batchCounts.done} ${batchCounts.done === 1 ? 'enviado' : 'enviados'}${batchCounts.failed ? ` · ${batchCounts.failed} com problema` : ''}${batchCounts.unknown ? ` · ${batchCounts.unknown} não ${batchCounts.unknown === 1 ? 'reconhecido' : 'reconhecidos'}` : ''}`}
              </p>
              <ul className="space-y-2">
                {items.map((it) => (
                  <li key={it.id} className="rounded-xl border border-line p-3" data-testid="recordings-batch-item" data-status={it.status}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 break-all text-sm font-medium">{it.file.name} <span className="font-normal text-fg-muted">({formatSize(it.file.size)})</span></span>
                      <Badge tone={it.status === 'done' ? 'success' : it.status === 'error' || it.status === 'invalid' ? 'danger' : it.status === 'sending' || it.status === 'waiting' ? 'brand' : 'warning'}>{ITEM_LABEL[it.status]}</Badge>
                    </div>
                    {(it.status === 'sending' || it.status === 'done') && (
                      <progress className="mt-2 h-2 w-full" max={1} value={it.progress} aria-label={`Envio de ${it.file.name}`} aria-valuetext={`${Math.round(it.progress * 100)}%`} />
                    )}
                    {it.message && <p className={cn('mt-1 text-xs', it.status === 'error' || it.status === 'invalid' ? 'text-danger' : 'text-fg-muted')}>{it.message}</p>}
                  </li>
                ))}
              </ul>
              {batchDone && batchCounts.unknown > 0 && <p className="text-xs text-fg-muted">Arquivos não reconhecidos não foram salvos. Confira o nome em “Vídeo próprio:” no roteiro.</p>}
            </div>
          )}

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Cenas com gravação</h3>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} data-testid="recordings-only-pending" />
                Só pendentes
              </label>
            </div>
            {lessons.length === 0 ? (
              <p className="text-sm text-fg-muted" data-testid="recordings-none-pending">Nada pendente: todos os arquivos estão enviados ou gerados.</p>
            ) : (
              lessons.map((lesson) => (
                <div key={lesson.lessonId} className="space-y-2">
                  <h4 className="text-sm font-semibold text-fg-muted">{lesson.title}</h4>
                  <ul className="space-y-2">
                    {lesson.scenes.map((scene) => (
                      <li key={scene.nodeId} className="rounded-xl border border-line p-3" data-testid={`recordings-scene-${scene.nodeId}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link href={`/estudio/cursos/${courseId}/aulas/${lesson.lessonId}#scene-${scene.nodeId}`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong hover:underline">
                            {lesson.title} · {scene.title}
                          </Link>
                          {readyScenes.get(`${lesson.lessonId}/${scene.nodeId}`) && <Badge tone="success">Pronta para montar</Badge>}
                        </div>
                        <ul className="mt-1 space-y-1">
                          {scene.recs.map((r) => {
                            const st = recordingState(r);
                            return (
                              <li key={`${r.index}-${r.fileName}`} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="recording-row" data-state={st}>
                                <span className="min-w-0 break-all">{r.fileName}</span>
                                <Badge tone={STATE_TONE[st]}>{RECORDING_STATE_LABEL[st]}</Badge>
                                {r.mock && (
                                  <div className="basis-full text-xs text-fg-muted" data-testid="recording-mock">
                                    <p>{describeMock(r.mock)}</p>
                                    <ul className="mt-1 list-disc pl-5">
                                      {(() => {
                                        const pv = previewMockSteps(r.mock);
                                        return (
                                          <>
                                            {pv.lines.map((l, i) => (
                                              <li key={i}>{l}</li>
                                            ))}
                                            {pv.more > 0 && <li>… e mais {pv.more} {pv.more === 1 ? 'passo' : 'passos'}</li>}
                                          </>
                                        );
                                      })()}
                                    </ul>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
