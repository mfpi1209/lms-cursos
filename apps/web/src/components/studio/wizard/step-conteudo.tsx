'use client';

import * as React from 'react';
import { ClipboardPaste, FileUp, Loader2, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { useDraft } from '@/components/studio/draft-provider';
import { AI_NOT_CONFIGURED, errorMessage, useAiCapabilities } from './agent-api';
import { useSources, type Source, type SourceKind, type SourceStatus } from './use-sources';

const KIND_LABEL: Record<SourceKind, string> = { paste: 'Texto colado', txt: 'Arquivo de texto', md: 'Arquivo Markdown', pdf: 'PDF' };
const MAX_FILE_BYTES = 20 * 1024 * 1024;

type Mode = 'paste' | 'upload' | 'generate';

/*
 * TODO(rastreabilidade): mostrar, por cena, de qual trecho/página da fonte o
 * texto veio (citação de chunks). Fora do escopo deste incremento; hoje só
 * sabemos quais fontes estavam prontas quando a geração rodou.
 */

export function StepConteudo() {
  const { courseId, document: doc, update } = useDraft();
  const ai = useAiCapabilities();
  const src = useSources(courseId);
  const sources = src.sources;
  const [mode, setMode] = React.useState<Mode | null>(doc.wizard.contentMode === 'none' ? null : doc.wizard.contentMode);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [retrying, setRetrying] = React.useState<string | null>(null);

  // os ids das fontes vivem no rascunho (a IA só usa as prontas; o worker lê o status)
  React.useEffect(() => {
    if (!sources) return;
    const ids = sources.map((s) => s.id);
    update((d) => (sameList(d.sourceIds, ids) ? d : { ...d, sourceIds: ids }));
  }, [sources, update]);

  const setContentMode = (m: Mode) => {
    setMode(m);
    update((d) => (d.wizard.contentMode === m ? d : { ...d, wizard: { ...d.wizard, contentMode: m } }));
  };

  const onAdded = (s: Source, via: 'paste' | 'upload') => {
    src.upsert(s);
    // Ter fontes é o que define o modo; "gerar da ideia" só vale sem fontes.
    update((d) => (d.wizard.contentMode === via ? d : { ...d, wizard: { ...d.wizard, contentMode: via } }));
    setMode(via);
  };

  const remove = async (s: Source) => {
    if (!window.confirm(`Remover a fonte "${s.title}"? A IA deixa de usá-la nas próximas gerações.`)) return;
    try {
      await api<{ ok: true }>(`/api/sources/${s.id}`, { method: 'DELETE' });
      src.remove(s.id);
      const left = (sources ?? []).filter((x) => x.id !== s.id);
      if (left.length === 0 && mode !== 'generate') {
        setMode(null);
        update((d) => (d.wizard.contentMode === 'none' ? d : { ...d, wizard: { ...d.wizard, contentMode: 'none' } }));
      }
    } catch (e) {
      setActionError(errorMessage(e, 'Não foi possível remover a fonte'));
    }
  };

  const retry = async (s: Source) => {
    setRetrying(s.id);
    setActionError(null);
    try {
      const r = await api<{ source: Source }>(`/api/courses/${courseId}/sources/${s.id}/retry`, { method: 'POST' });
      src.upsert(r.source);
    } catch (e) {
      setActionError(errorMessage(e, 'Não foi possível tentar de novo'));
    } finally {
      setRetrying(null);
    }
  };

  const aiBlocked = !ai.loading && !ai.configured;
  const lastGeneration = doc.wizard.completedSteps.includes('estrutura') || doc.modules.some((m) => m.lessons.length > 0);

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="De onde vem o material">
        <ChoiceCard
          icon={<ClipboardPaste className="h-5 w-5" aria-hidden="true" />}
          title="Colar texto"
          body="Você já tem o material escrito: manual da loja, roteiro, anotações."
          active={mode === 'paste'}
          onClick={() => setContentMode('paste')}
          testId="content-mode-paste"
        />
        <ChoiceCard
          icon={<FileUp className="h-5 w-5" aria-hidden="true" />}
          title="Enviar arquivo"
          body="PDF, TXT ou Markdown de até 20 MB. Lemos o texto do arquivo."
          active={mode === 'upload'}
          onClick={() => setContentMode('upload')}
          testId="content-mode-upload"
        />
        <ChoiceCard
          icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
          title="Partir só da ideia"
          body="A IA escreve tudo com o que você contou no passo anterior."
          active={mode === 'generate'}
          onClick={() => setContentMode('generate')}
          disabled={aiBlocked}
          ai
          testId="content-mode-generate"
        />
      </div>

      {mode === 'paste' && <PasteForm courseId={courseId} onAdded={(s) => onAdded(s, 'paste')} />}
      {mode === 'upload' && <UploadForm courseId={courseId} onAdded={(s) => onAdded(s, 'upload')} />}
      {mode === 'generate' && (
        <div className="rounded-xl border border-ai/30 bg-ai-soft/60 p-5 text-sm leading-relaxed text-fg-muted">
          <p className="flex items-center gap-2 font-medium text-fg">
            <Sparkles className="h-4 w-4 text-ai" aria-hidden="true" /> O que a IA faz sem material
          </p>
          <p className="mt-2">
            Escreve objetivos, aulas e cenas só com a sua ideia, público e objetivo. Sem material, ela pode inventar números, prazos ou regras. Confira cada fato antes de publicar, principalmente normas da empresa.
          </p>
          {ai.caps && <p className="mt-3 text-xs text-fg-faint">Provedor: {ai.caps.provider} ({ai.caps.model}). {ai.caps.note}</p>}
          <p className="mt-1 text-xs text-fg-faint">Se mais tarde você colar ou enviar um material, ele passa a ser usado.</p>
        </div>
      )}
      {aiBlocked && mode !== 'generate' && <p className="text-sm text-fg-muted">Partir só da ideia está indisponível: {AI_NOT_CONFIGURED}</p>}

      <section aria-labelledby="fontes-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="fontes-title" className="font-display text-xl font-bold">Material do curso</h2>
          {sources && sources.length > 0 && (
            <span className="text-sm text-fg-faint">
              {sources.length === 1 ? '1 fonte' : `${sources.length} fontes`}
              {src.processing > 0 && ` · ${src.processing} em leitura`}
            </span>
          )}
        </div>
        {(src.error || actionError) && <p role="alert" className="text-sm text-danger">{actionError ?? src.error}</p>}
        {sources === null && !src.error && <p className="text-sm text-fg-muted">Carregando fontes…</p>}
        {sources && sources.length === 0 && (
          <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-muted" data-testid="sources-empty">
            <p className="font-medium text-fg">Sem material? Tudo bem.</p>
            <p className="mt-1">A IA monta o curso a partir da sua ideia. Com material (manual, roteiro, PDF), ela usa os seus exemplos e os seus termos.</p>
          </div>
        )}
        {sources && sources.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-bg-2" data-testid="source-list">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between" data-testid={`source-${s.id}`} data-status={s.status}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-fg">{s.title}</p>
                    <StatusPill status={s.status} />
                    {s.status === 'ready' && lastGeneration && <Badge tone="brand">Usada na última geração</Badge>}
                  </div>
                  <p className="text-xs text-fg-faint">
                    {KIND_LABEL[s.kind]}
                    {s.pages ? `, ${s.pages} ${s.pages === 1 ? 'página' : 'páginas'}` : ''}
                    {s.chars ? `, ${s.chars.toLocaleString('pt-BR')} caracteres` : ''}
                  </p>
                  {s.status === 'processing' && (
                    <p className="flex items-center gap-2 text-sm text-fg-muted">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Lendo o arquivo. Costuma levar alguns segundos; a lista atualiza sozinha.
                    </p>
                  )}
                  {s.status === 'needs_ocr' && <p className="text-sm text-paid">Este PDF é digitalizado (imagem) e não tem texto para ler. Cole o texto ou envie outro arquivo.</p>}
                  {s.status === 'failed' && (
                    <p className="text-sm text-danger">
                      Não conseguimos ler este arquivo{s.error ? ` (${s.error})` : ''}. Tente de novo, envie outro formato ou cole o texto.
                    </p>
                  )}
                  {s.status === 'ready' && s.excerpt && <p className="line-clamp-2 text-sm text-fg-muted">{s.excerpt}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1 self-start">
                  {s.status === 'failed' && (
                    <Button variant="secondary" size="sm" onClick={() => void retry(s)} disabled={retrying === s.id} data-testid={`source-retry-${s.id}`}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" /> {retrying === s.id ? 'Enviando…' : 'Tentar de novo'}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => void remove(s)} aria-label={`Remover fonte ${s.title}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function StatusPill({ status }: { status: SourceStatus }) {
  const map: Record<SourceStatus, { label: string; tone: BadgeTone }> = {
    processing: { label: 'Lendo arquivo…', tone: 'brand' },
    ready: { label: 'Pronta', tone: 'success' },
    needs_ocr: { label: 'Sem texto para ler', tone: 'warning' },
    failed: { label: 'Falhou', tone: 'danger' },
  };
  const m = map[status] ?? { label: status, tone: 'neutral' as BadgeTone };
  return (
    <Badge tone={m.tone} data-testid="source-status">
      {status === 'processing' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
      {m.label}
    </Badge>
  );
}

function ChoiceCard({
  icon,
  title,
  body,
  active,
  onClick,
  disabled,
  ai = false,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** cartão de ação da IA: ícone em violeta */
  ai?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'panel flex min-h-36 flex-col items-start gap-3 p-4 text-left transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'panel-accent' : 'hover:border-line-strong',
      )}
    >
      <span className={cn('grid h-10 w-10 place-items-center rounded-xl', ai ? 'bg-ai-soft text-ai' : active ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-muted')}>{icon}</span>
      <span className="font-display text-base font-semibold text-fg">{title}</span>
      <span className="text-sm text-fg-muted">{body}</span>
    </button>
  );
}

function PasteForm({ courseId, onAdded }: { courseId: string; onAdded: (s: Source) => void }) {
  const [title, setTitle] = React.useState('');
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const can = title.trim().length > 0 && text.trim().length > 20 && !busy;
  return (
    <form
      className="space-y-5 rounded-xl border border-line bg-bg-2 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!can) return;
        setBusy(true);
        setError(null);
        try {
          const r = await api<{ source: Source }>(`/api/courses/${courseId}/sources`, { json: { title: title.trim(), text } });
          onAdded(r.source);
          setTitle('');
          setText('');
        } catch (err) {
          setError(errorMessage(err, 'Não foi possível guardar o texto. Tente de novo.'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Nome da fonte" htmlFor="source-title" hint="Para você reconhecer depois. Ex.: Manual de atendimento da loja.">
        <Input id="source-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Texto" htmlFor="source-text" hint="Cole o conteúdo como estiver. Formatação não importa.">
        <Textarea id="source-text" data-testid="source-paste" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-fg-faint">{text.trim().length.toLocaleString('pt-BR')} caracteres</span>
        <Button type="submit" disabled={!can}>{busy ? 'Guardando…' : 'Guardar texto'}</Button>
      </div>
    </form>
  );
}

function UploadForm({ courseId, onAdded }: { courseId: string; onAdded: (s: Source) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const pick = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    if (f.size > MAX_FILE_BYTES) {
      setFile(null);
      setError('O arquivo passa de 20 MB. Divida o material ou cole o texto.');
      return;
    }
    if (!/\.(pdf|txt|md|markdown)$/i.test(f.name)) {
      setFile(null);
      setError('Formato não suportado. Envie PDF, TXT ou Markdown.');
      return;
    }
    setFile(f);
  };

  return (
    <form
      className="space-y-5 rounded-xl border border-line bg-bg-2 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file || busy) return;
        setBusy(true);
        setError(null);
        try {
          const fd = new FormData();
          fd.append('file', file);
          const r = await api<{ source: Source }>(`/api/courses/${courseId}/sources`, { method: 'POST', body: fd });
          onAdded(r.source);
          setFile(null);
          if (inputRef.current) inputRef.current.value = '';
        } catch (err) {
          setError(errorMessage(err, 'Não foi possível enviar o arquivo. Tente de novo.'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Arquivo" htmlFor="source-file" hint="PDF com texto selecionável, TXT ou Markdown. PDFs digitalizados (imagem) não são lidos. Um PDF leva alguns segundos para ser lido.">
        <input
          ref={inputRef}
          id="source-file"
          data-testid="source-upload"
          type="file"
          accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
          className="block w-full text-sm text-fg-muted file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-line-strong file:bg-surface-2 file:px-4 file:text-sm file:font-medium file:text-fg hover:file:border-accent/60"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
      </Field>
      {file && <p className="text-xs text-fg-faint">{file.name}, {(file.size / 1024).toFixed(0)} KB</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={!file || busy}>{busy ? 'Enviando…' : 'Enviar arquivo'}</Button>
      </div>
    </form>
  );
}
