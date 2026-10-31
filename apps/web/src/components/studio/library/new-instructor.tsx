'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { TemplateDataByKind } from '@lms/course-schema';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, fieldHintId, Input, Select, Textarea } from '@/components/ui/input';
import type { LibraryItem } from './library-view';

/**
 * "Novo instrutor": personagem fictício descrito em texto → 3 câmeras dentro de um estúdio com zonas
 * → voz da biblioteca → instrutor + kit na biblioteca. Gerar é PAGO (4 visuais no HeyGen): o servidor
 * calcula o orçamento antes e nada é pedido sem "Aprovar e gerar". O progresso fica gravado no próprio
 * instrutor; fechar a página e voltar continua de onde parou, sem pagar de novo.
 */

type Pronoun = 'she' | 'he' | 'they';
const ROLE_DEFAULT: Record<Pronoun, string> = { she: 'Sua orientadora', he: 'Seu orientador', they: 'Quem te orienta' };
const PRONOUN_LABEL: Record<Pronoun, string> = { she: 'Ela', he: 'Ele', they: 'Neutro' };

interface Quote {
  simulated: boolean;
  presenterKey: string;
  kitKey: string;
  studio: string;
  voice: string;
  characterPrompt: string;
  cameras: Array<{ id: string; name: string; zone: string }>;
  looks: number;
  estimate: { credits: number; usd: number; note: string };
  copiesFrom: { key: string; name: string } | null;
  resume: Status | null;
}

export interface Status {
  presenterKey: string;
  kitKey: string;
  name: string;
  status: 'generating' | 'failed' | 'ready';
  step: 'character' | 'cameras' | 'done' | 'failed';
  simulated: boolean;
  error?: string;
  notes: string[];
  base?: { status: string; previewUrl?: string };
  cameras: Array<{ id: string; name: string; zone?: string; status: string; previewUrl?: string }>;
}

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const usd = (n: number) => `US$ ${n.toFixed(2).replace('.', ',')}`;

export function NewInstructorPanel({ templates }: { templates: LibraryItem[] }) {
  const studios = templates.filter((t) => t.kind === 'studio' && (t.data as TemplateDataByKind['studio']).mode === 'zones' && (t.data as TemplateDataByKind['studio']).imageAssetId);
  const voices = templates.filter((t) => t.kind === 'voice');
  const pending = templates.filter((t) => t.kind === 'presenter' && (t.data as TemplateDataByKind['presenter']).creation && (t.data as TemplateDataByKind['presenter']).creation!.status !== 'ready');
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<string | null>(null);

  return (
    <div className="space-y-4">
      {pending.filter((p) => p.key !== active).map((p) => (
        <Progress key={p.key} presenterKey={p.key} autoStart={false} />
      ))}
      {active && <Progress presenterKey={active} autoStart />}
      {open ? (
        <NewInstructorForm
          studios={studios}
          voices={voices}
          onCancel={() => setOpen(false)}
          onStarted={(key) => {
            setActive(key);
            setOpen(false);
          }}
        />
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)} data-testid="new-instructor-open">
          Novo instrutor
        </Button>
      )}
    </div>
  );
}

function NewInstructorForm({ studios, voices, onCancel, onStarted }: { studios: LibraryItem[]; voices: LibraryItem[]; onCancel: () => void; onStarted: (key: string) => void }) {
  const [name, setName] = React.useState('');
  const [pronoun, setPronoun] = React.useState<Pronoun>('she');
  const [role, setRole] = React.useState(ROLE_DEFAULT.she);
  const [roleTouched, setRoleTouched] = React.useState(false);
  const [description, setDescription] = React.useState('');
  const [studioKey, setStudioKey] = React.useState(studios[studios.length - 1]?.key ?? '');
  const [voiceKey, setVoiceKey] = React.useState('');
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [busy, setBusy] = React.useState<'quote' | 'approve' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const voiceList = React.useMemo(() => {
    const fits = (v: LibraryItem) => !(v.data as TemplateDataByKind['voice']).pronoun || (v.data as TemplateDataByKind['voice']).pronoun === pronoun || pronoun === 'they';
    return [...voices].sort((a, b) => Number(fits(b)) - Number(fits(a)) || a.name.localeCompare(b.name));
  }, [voices, pronoun]);
  const voice = voices.find((v) => v.key === voiceKey);
  const voiceData = voice?.data as TemplateDataByKind['voice'] | undefined;
  const studio = studios.find((s) => s.key === studioKey);
  const input = { name: name.trim(), role: role.trim(), pronoun, description: description.trim(), studioKey, voiceKey };
  const ready = input.name.length >= 2 && input.role && input.description.length >= 20 && studioKey && voiceKey;
  // mudou algo depois do orçamento: precisa calcular de novo
  const quoted = React.useRef<string>('');
  const stale = quote !== null && quoted.current !== JSON.stringify(input);

  async function calculate() {
    setBusy('quote');
    setError(null);
    try {
      const r = await api<{ quote: Quote }>('/api/library/instructors', { json: input });
      quoted.current = JSON.stringify(input);
      setQuote(r.quote);
    } catch (e) {
      setQuote(null);
      setError(errText(e, 'Não foi possível calcular o orçamento.'));
    }
    setBusy(null);
  }

  async function approve() {
    setBusy('approve');
    setError(null);
    try {
      const r = await api<{ status: Status }>('/api/library/instructors', { json: { ...input, confirmPaid: true } });
      onStarted(r.status.presenterKey);
    } catch (e) {
      setError(errText(e, 'Não foi possível começar a geração.'));
      setBusy(null);
    }
  }

  const id = (s: string) => `ni-${s}`;
  return (
    <section className="panel space-y-6 p-5 sm:p-6" aria-labelledby="ni-title" data-testid="new-instructor-form">
      <div className="space-y-1">
        <h3 id="ni-title" className="font-display text-xl font-semibold">Novo instrutor</h3>
        <p className="max-w-prose text-sm text-fg-muted">
          Descreva um personagem fictício. O HeyGen cria o rosto só a partir do texto e depois gera as 3 câmeras dentro do estúdio (esquerda, direita e 3/4). No fim, o instrutor e um kit pronto entram na biblioteca.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome no letreiro" htmlFor={id('name')} required>
          <Input id={id('name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" placeholder="Ex.: Júlia" />
        </Field>
        <Field label="Pronome" htmlFor={id('pronoun')}>
          <Select
            id={id('pronoun')}
            value={pronoun}
            onChange={(e) => {
              const p = e.target.value as Pronoun;
              setPronoun(p);
              if (!roleTouched) setRole(ROLE_DEFAULT[p]);
            }}
          >
            {(Object.keys(PRONOUN_LABEL) as Pronoun[]).map((p) => (
              <option key={p} value={p}>{PRONOUN_LABEL[p]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Papel no letreiro" htmlFor={id('role')} required>
          <Input id={id('role')} value={role} onChange={(e) => { setRole(e.target.value); setRoleTouched(true); }} maxLength={60} />
        </Field>
        <Field label="Estúdio" htmlFor={id('studio')} hint="Só estúdios com zonas e imagem no workspace." required>
          <Select id={id('studio')} value={studioKey} onChange={(e) => setStudioKey(e.target.value)} aria-describedby={fieldHintId(id('studio'))}>
            {studios.map((s) => (
              <option key={s.key} value={s.key}>{s.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Como é o personagem" htmlFor={id('desc')} hint="Aparência, idade aproximada, cabelo e roupa. Sempre uma pessoa fictícia: não descreva alguém real nem famoso. Pode escrever em português." required>
        <Textarea
          id={id('desc')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={600}
          aria-describedby={fieldHintId(id('desc'))}
          placeholder="Ex.: mulher brasileira de uns 30 anos, pele morena clara, cabelo cacheado na altura dos ombros, sorriso calmo; blusa de malha azul-marinho lisa, sem logos."
        />
        <p className="mt-1 text-right text-xs text-fg-faint">{description.length}/600</p>
      </Field>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
        <Field label="Voz" htmlFor={id('voice')} hint="Vozes da biblioteca; as do mesmo pronome aparecem primeiro." required>
          <Select id={id('voice')} value={voiceKey} onChange={(e) => setVoiceKey(e.target.value)} aria-describedby={fieldHintId(id('voice'))}>
            <option value="">Escolha uma voz…</option>
            {voiceList.map((v) => (
              <option key={v.key} value={v.key}>{v.name}</option>
            ))}
          </Select>
        </Field>
        <div className="space-y-2 pt-0 sm:pt-7">
          {voice && (voice.previewUrl || voiceData?.sampleUrl) ? (
            <audio controls preload="none" src={voice.previewUrl ?? voiceData?.sampleUrl} className="w-full" aria-label={`Amostra da voz ${voice.name}`} />
          ) : voice ? (
            <p className="text-sm text-fg-faint">Esta voz ainda não tem amostra.</p>
          ) : null}
          {voiceData?.notes && <p className="text-xs text-fg-muted">{voiceData.notes}</p>}
        </div>
      </div>

      {studio?.previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={studio.previewUrl} alt={`Cenário: ${studio.name}`} className="aspect-video w-full max-w-md rounded-xl border border-line object-cover" loading="lazy" />
      )}

      {(!quote || stale) && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="paid" onClick={() => void calculate()} disabled={!ready || busy !== null} data-testid="new-instructor-quote">
            {busy === 'quote' ? 'Calculando…' : stale ? 'Calcular de novo' : 'Calcular orçamento'}
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          {!ready && <p className="text-sm text-fg-muted">Preencha nome, descrição (ao menos 20 letras), estúdio e voz.</p>}
        </div>
      )}

      {quote && !stale && (
        <div className="space-y-4 rounded-xl border border-paid/50 bg-paid-soft p-4 text-sm text-fg" role="region" aria-labelledby="ni-quote-title" data-testid="new-instructor-quote-box">
          <p id="ni-quote-title" className="font-display text-base font-semibold text-paid">
            {quote.simulated ? 'Orçamento (modo de demonstração: nada será cobrado)' : 'Orçamento: esta ação é paga'}
          </p>
          {quote.resume ? (
            <p>
              {quote.resume.name} já está sendo gerado ({quote.presenterKey}). Aprovar só continua de onde parou, sem pagar de novo o que já foi pedido.
            </p>
          ) : (
            <ul className="space-y-1">
              <li>
                <strong>{quote.looks} visuais no HeyGen</strong>: o personagem e as câmeras {quote.cameras.map((c) => ZONE_LABEL[c.zone]?.toLowerCase() ?? c.name).join(', ').replace(/, ([^,]*)$/, ' e $1')} no {quote.studio}.
              </li>
              <li>
                Custo estimado: {quote.simulated ? usd(0) : `≈ ${quote.estimate.credits} créditos de API (${usd(quote.estimate.usd)})`}. {quote.estimate.note}
              </li>
              <li>Voz: {quote.voice}. Entra na biblioteca como <span className="font-mono text-xs">{quote.presenterKey}</span> e o kit <span className="font-mono text-xs">{quote.kitKey}</span>{quote.copiesFrom ? `, com marca, direção, regras e alunos de teste de "${quote.copiesFrom.name}"` : ''}.</li>
            </ul>
          )}
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center font-medium">Pedido enviado ao HeyGen</summary>
            <p className="rounded-lg bg-bg-2 px-3 py-2 font-mono text-xs text-fg-muted">{quote.characterPrompt}</p>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button variant="paid" className="bg-paid font-semibold text-accent-fg hover:bg-paid hover:brightness-110" onClick={() => void approve()} disabled={busy !== null} data-testid="new-instructor-approve">
              {busy === 'approve' ? 'Enviando…' : 'Aprovar e gerar'}
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={busy === 'approve'}>Cancelar</Button>
          </div>
        </div>
      )}
      <div aria-live="polite">{error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}</div>
    </section>
  );
}

const STATUS_PT: Record<string, string> = { waiting: 'na fila', generating: 'gerando…', ready: 'pronta', failed: 'falhou' };
const ZONE_LABEL: Record<string, string> = { left: 'Esquerda', right: 'Direita', center: '3/4' };

/** Progresso de um instrutor em geração (consulta a cada 5 s enquanto a página está aberta). */
function Progress({ presenterKey, autoStart }: { presenterKey: string; autoStart: boolean }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<Status | null>(null);
  const [running, setRunning] = React.useState(autoStart);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const step = React.useCallback(async (retryFailed = false) => {
    setBusy(true);
    try {
      const r = await api<{ status: Status }>(`/api/library/instructors/${presenterKey}`, { json: { retryFailed } });
      setStatus(r.status);
      setError(null);
      if (r.status.status !== 'generating') {
        setRunning(false);
        if (r.status.status === 'ready') router.refresh();
      }
    } catch (e) {
      setError(errText(e, 'Não foi possível consultar a geração.'));
      setRunning(false);
    }
    setBusy(false);
  }, [presenterKey, router]);

  // situação gravada ao abrir (não chama o provedor)
  React.useEffect(() => {
    void api<{ status: Status }>(`/api/library/instructors/${presenterKey}`).then((r) => setStatus(r.status)).catch(() => undefined);
  }, [presenterKey]);

  React.useEffect(() => {
    if (!running) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await step();
      if (alive) t = setTimeout(tick, 5000);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [running, step]);

  const s = status;
  const rows = s
    ? [
        { id: 'base', label: 'Personagem', status: s.base?.status ?? (s.step === 'character' ? 'generating' : 'waiting'), previewUrl: s.base?.previewUrl },
        ...s.cameras.map((c) => ({ id: c.id, label: `Câmera ${ZONE_LABEL[c.zone ?? ''] ?? c.name}`, status: c.status, previewUrl: c.previewUrl })),
      ]
    : [];
  return (
    <section className="panel space-y-4 p-5" aria-label={`Geração de ${s?.name ?? presenterKey}`} data-testid={`instructor-progress-${presenterKey}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">{s ? (s.status === 'ready' ? `${s.name} está pronto` : `Gerando ${s.name}`) : 'Instrutor novo'}</h3>
        {s?.simulated && <span className="text-xs text-fg-faint">modo de demonstração</span>}
      </div>
      <ol className="grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2">
            {r.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.previewUrl} alt={r.label} className="aspect-video w-full rounded-lg border border-line object-cover" loading="lazy" />
            ) : (
              <div className={cn('grid aspect-video w-full place-items-center rounded-lg border border-dashed text-xs', r.status === 'failed' ? 'border-danger/50 text-danger' : 'border-line text-fg-faint')}>{r.id === 'base' && r.status === 'ready' ? 'pronto' : STATUS_PT[r.status] ?? r.status}</div>
            )}
            <p className="text-sm">
              {r.label} <span className={cn('text-xs', r.status === 'ready' ? 'text-success' : r.status === 'failed' ? 'text-danger' : 'text-fg-muted')}>({r.id === 'base' && r.status === 'ready' ? 'pronto' : STATUS_PT[r.status] ?? r.status})</span>
            </p>
          </li>
        ))}
      </ol>
      <div aria-live="polite" className="space-y-2 text-sm">
        {s?.status === 'ready' && <p className="rounded-lg bg-success-soft px-3 py-2">Pronto: o kit <span className="font-mono text-xs">{s.kitKey}</span> está na biblioteca. Escolha um curso acima e use o kit.</p>}
        {s?.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger">{s.error}</p>}
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger">{error}</p>}
        {!!s?.notes.length && (
          <ul className="list-disc pl-5 text-xs text-fg-muted">
            {s.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
      {s && s.status !== 'ready' && !running && (
        <div className="flex flex-wrap gap-2">
          {s.status === 'failed' ? (
            <Button variant="paid" size="sm" disabled={busy} onClick={() => { setRunning(false); void step(true).then(() => setRunning(true)); }}>
              Pedir de novo o que falhou
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setRunning(true)} data-testid={`instructor-resume-${presenterKey}`}>
              Continuar a geração
            </Button>
          )}
          <p className="self-center text-xs text-fg-faint">{s.status === 'failed' ? 'Pede de novo só o que falhou; essa nova tentativa pode ser cobrada.' : 'Já aprovado; continuar não paga de novo.'}</p>
        </div>
      )}
    </section>
  );
}
