'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ANSWER_STYLE_LABELS,
  AUDIENCE_PROFILE_LABELS,
  AUDIENCE_TRAIT_LABELS,
  CAMERA_ZONE_LABELS,
  KitError,
  KNOWLEDGE_AREA_LABELS,
  kitSummary,
  PRESENTER_PRONOUN_LABELS,
  presentationFromKit,
  TEMPLATE_KIND_LABELS,
  type LearnerOpinion,
  type ResolvedKit,
  type TemplateDataByKind,
  type TemplateKind,
} from '@lms/course-schema';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { NewInstructorPanel } from './new-instructor';

export interface LibraryItem {
  id: string;
  kind: TemplateKind;
  key: string;
  name: string;
  description: string;
  data: Record<string, unknown>;
  previewUrl: string | null;
  updatedAt: string;
}
export interface LibraryCourse {
  id: string;
  title: string;
}

/** Ordem das seções na tela. */
const SECTIONS: TemplateKind[] = ['kit', 'presenter', 'studio', 'voice', 'branding', 'direction', 'learner', 'knowledge'];
const SECTION_HINT: Record<TemplateKind, string> = {
  kit: 'Combinações prontas. Escolha um curso acima e use o kit inteiro de uma vez.',
  presenter: 'Instrutores com o kit de câmeras de cada estúdio. "Novo instrutor" cria um personagem fictício e as 3 câmeras num estúdio (pago, com orçamento antes).',
  studio: 'Cenários aprovados, com a descrição usada nos pedidos de câmera e as zonas.',
  voice: 'Vozes escolhidas, com amostra de uma narração já produzida.',
  branding: "Marca d'água e vinheta. Sem slogan: a marca nunca inventa frase.",
  direction: 'Layout dos cartões e regras de câmera, letreiro e pergunta a seguir.',
  learner: 'Perfis fictícios do público que fazem o curso e dizem o que acharam. Simulação por regras, sem IA e sem custo.',
  knowledge: 'O que aprendemos montando os cursos: regras para roteiro, fala, vídeo, câmera, marca e custo.',
};
/** Peças que dá para usar sozinhas num curso. */
const APPLICABLE = new Set<TemplateKind>(['kit', 'voice', 'branding', 'direction']);

const zoneShort = (z?: string) => (z === 'left' ? 'esquerda' : z === 'right' ? 'direita' : z === 'center' ? '3/4' : '');

type Piece<K extends TemplateKind> = { key: string; name: string; data: TemplateDataByKind[K] };

/** Kit montado no navegador a partir da lista (mesma função pura do servidor). */
function resolveLocal(kit: LibraryItem, byKey: Map<string, LibraryItem>): { resolved?: ResolvedKit; error?: string } {
  const d = kit.data as TemplateDataByKind['kit'];
  const get = <K extends TemplateKind>(key: string | undefined, kind: K): Piece<K> | undefined => {
    if (!key) return undefined;
    const t = byKey.get(key);
    if (!t || t.kind !== kind) throw new KitError(`falta "${key}" na biblioteca`);
    return { key: t.key, name: t.name, data: t.data as TemplateDataByKind[K] };
  };
  try {
    const resolved: ResolvedKit = {
      kit: { key: kit.key, name: kit.name, data: d },
      studio: get(d.studioKey, 'studio')!,
      presenter: get(d.presenterKey, 'presenter')!,
      voice: get(d.voiceKey, 'voice'),
      branding: get(d.brandingKey, 'branding'),
      direction: get(d.directionKey, 'direction'),
      knowledge: (d.knowledgeKeys ?? []).map((k) => get(k, 'knowledge')!),
      learners: (d.learnerKeys ?? []).map((k) => get(k, 'learner')!),
    };
    presentationFromKit(resolved);
    return { resolved };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function LibraryView({ templates, courses, canEdit }: { templates: LibraryItem[]; courses: LibraryCourse[]; canEdit: boolean }) {
  const [courseId, setCourseId] = React.useState('');
  const byKey = React.useMemo(() => new Map(templates.map((t) => [t.key, t])), [templates]);
  const groups = React.useMemo(() => SECTIONS.map((kind) => ({ kind, items: templates.filter((t) => t.kind === kind) })).filter((g) => g.items.length > 0), [templates]);
  const course = courses.find((c) => c.id === courseId);

  if (!templates.length) {
    return (
      <div className="panel p-8 text-fg-muted">
        <p className="font-medium text-fg">A biblioteca ainda está vazia.</p>
        <p className="mt-2 text-sm">
          Para montar com o que já foi aprovado (estúdios, Marina, Rafael, vozes, marca, alunos de teste e regras), rode na raiz do projeto: <code className="rounded bg-fg/5 px-1.5 py-0.5">packages/db/src/scripts/biblioteca-modelos.ts</code>. Não gera nada pago.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <section className="panel z-20 flex flex-col gap-3 p-4 sm:p-5 xl:sticky xl:top-[84px] xl:flex-row xl:items-center xl:gap-4" aria-label="Curso de destino">
        <label htmlFor="lib-course" className="shrink-0 text-sm font-medium">Usar no curso</label>
        <Select id="lib-course" value={courseId} onChange={(e) => setCourseId(e.target.value)} className="xl:max-w-md" data-testid="library-course">
          <option value="">Escolha um curso…</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </Select>
        <nav aria-label="Seções da biblioteca" className="-mx-1 flex flex-wrap gap-x-1 xl:ml-auto">
          {groups.map((g) => (
            <a key={g.kind} href={`#modelos-${g.kind}`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-fg-muted hover:bg-fg/5 hover:text-fg">
              {TEMPLATE_KIND_LABELS[g.kind]} <span className="ml-1 text-fg-faint">{g.items.length}</span>
            </a>
          ))}
        </nav>
      </section>

      {groups.map((g) => (
        <section key={g.kind} id={`modelos-${g.kind}`} aria-labelledby={`modelos-${g.kind}-h`} className="scroll-mt-28 space-y-4 xl:scroll-mt-48">
          <div className="space-y-1">
            <h2 id={`modelos-${g.kind}-h`} className="text-2xl">{TEMPLATE_KIND_LABELS[g.kind]}</h2>
            <p className="max-w-prose text-sm text-fg-muted">{SECTION_HINT[g.kind]}</p>
          </div>
          {g.kind === 'learner' && <LearnerPanel course={course} />}
          {g.kind === 'presenter' && canEdit && <NewInstructorPanel templates={templates} />}
          <ul className={cn('grid gap-4', g.kind === 'knowledge' || g.kind === 'kit' ? 'lg:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3')}>
            {g.items.map((t) => (
              <li key={t.id} className="panel flex flex-col gap-4 p-5" data-testid={`template-${t.key}`}>
                <header className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-semibold leading-tight">{t.name}</h3>
                  </div>
                  <p className="font-mono text-xs text-fg-faint">{t.key}</p>
                  {t.description && <p className="text-sm text-fg-muted">{t.description}</p>}
                </header>
                <div className="flex-1 text-sm">
                  <TemplateBody item={t} byKey={byKey} />
                </div>
                {APPLICABLE.has(t.kind) && canEdit && <ApplyButton item={t} course={course} byKey={byKey} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TemplateBody({ item, byKey }: { item: LibraryItem; byKey: Map<string, LibraryItem> }) {
  switch (item.kind) {
    case 'kit': {
      const { resolved, error } = resolveLocal(item, byKey);
      if (error) return <p className="rounded-lg border border-paid/30 bg-paid-soft px-3 py-2 text-fg">Incompleto: {error}</p>;
      return (
        <ul className="space-y-1 text-fg-muted">
          {kitSummary(resolved!).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      );
    }
    case 'presenter': {
      const d = item.data as TemplateDataByKind['presenter'];
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-fill text-base font-bold text-accent-fill-fg" aria-hidden="true">{d.name[0]}</span>
            <p>
              <span className="font-medium">{d.name}</span> · {d.role}
              <br />
              <span className="text-fg-muted">Pronome: {PRESENTER_PRONOUN_LABELS[d.pronoun]} · Voz: {d.voice.voiceName ?? d.voice.voiceId}</span>
            </p>
          </div>
          {d.cameraKits.map((k) => (
            <div key={k.studioKey}>
              <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">{byKey.get(k.studioKey)?.name ?? k.studioKey}</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {k.cameras.map((c) => (
                  <li key={c.id} className="rounded-full border border-line px-2.5 py-1 text-xs" title={c.zone ? CAMERA_ZONE_LABELS[c.zone] : c.name}>
                    {c.zone ? zoneShort(c.zone) : c.name} <span className="font-mono text-fg-faint">{c.id}</span>
                    {(c.status ?? 'ready') !== 'ready' && <span className="ml-1 text-paid">({c.status})</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!d.cameraKits.length && <p className="text-fg-muted">Ainda sem câmeras em estúdio (gerar é pago e pede aprovação).</p>}
        </div>
      );
    }
    case 'studio': {
      const d = item.data as TemplateDataByKind['studio'];
      return (
        <div className="space-y-3">
          {item.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.previewUrl} alt={`Cenário: ${item.name}`} className="aspect-video w-full rounded-xl border border-line object-cover" loading="lazy" />
          ) : (
            <div className="grid aspect-video w-full place-items-center rounded-xl border border-dashed border-line text-xs text-fg-faint">Sem imagem no workspace</div>
          )}
          <p className="text-fg-muted">
            {d.mode === 'zones' ? `Estúdio com zonas: ${d.zones.map(zoneShort).join(', ')}` : 'Fundo atrás da instrutora recortada'}
          </p>
          <p className="rounded-lg bg-fg/5 px-3 py-2 font-mono text-xs text-fg-muted">{d.sceneryPrompt}</p>
          {d.framingNotes && <p className="text-xs text-fg-faint">{d.framingNotes}</p>}
        </div>
      );
    }
    case 'voice': {
      const d = item.data as TemplateDataByKind['voice'];
      return (
        <div className="space-y-2">
          <p className="text-fg-muted">
            {d.provider === 'elevenlabs' ? 'ElevenLabs' : 'HeyGen'} · <span className="font-mono text-xs">{d.voiceId}</span> · {d.language}
          </p>
          {item.previewUrl || d.sampleUrl ? (
            <audio controls preload="none" src={item.previewUrl ?? d.sampleUrl} className="w-full" aria-label={`Amostra da voz ${d.voiceName}`} />
          ) : (
            <p className="text-xs text-fg-faint">Sem amostra ainda (aparece quando houver uma narração produzida com esta voz).</p>
          )}
          {d.sampleText && <p className="line-clamp-3 text-xs italic text-fg-faint">“{d.sampleText}”</p>}
          {d.notes && <p className="text-xs text-fg-muted">{d.notes}</p>}
        </div>
      );
    }
    case 'branding': {
      const d = item.data as TemplateDataByKind['branding'];
      const w = d.watermark;
      return (
        <ul className="space-y-1 text-fg-muted">
          <li>Marca d’água: {w.enabled === false ? 'desligada' : `logo no rodapé ${w.position === 'bottom-left' ? 'esquerdo' : 'direito'}, opacidade ${String(w.opacity ?? 0.7).replace('.', ',')}`}</li>
          <li>Vinheta: {d.bumper ? `${d.bumper.assetId ? 'assinatura' : 'padrão do workspace'}, ${d.bumper.playOn.includes('lesson_end') ? 'no fim de cada aula' : 'no fim do curso'}${d.bumper.skippable ? ', pode pular' : ''}` : 'sem vinheta'}</li>
          <li>Slogan: nenhum (nunca inventar)</li>
        </ul>
      );
    }
    case 'direction': {
      const d = item.data as TemplateDataByKind['direction'];
      const layout = d.cardLayout === 'presenter_chips' ? 'Pílulas no painel marinho (estúdio com zonas)' : d.cardLayout === 'presenter_panel' ? 'Painel marinho ao lado da instrutora' : 'Cartão em tela cheia';
      return (
        <div className="space-y-2">
          <p className="text-fg-muted">{layout}{d.lowerThird ? ' · letreiro' : ''}{d.nextQuestion ? ' · pergunta a seguir' : ''}</p>
          <ul className="list-disc space-y-1 pl-5 text-fg-muted">
            {d.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      );
    }
    case 'knowledge': {
      const d = item.data as TemplateDataByKind['knowledge'];
      return (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-fg">
            <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span>
            {d.rules.length} regras · {KNOWLEDGE_AREA_LABELS[d.area]}
          </summary>
          <dl className="mt-2 space-y-3">
            {d.rules.map((r) => (
              <div key={r.id}>
                <dt className="font-medium">{r.title}</dt>
                <dd className="text-fg-muted">{r.text}</dd>
                {r.source && <dd className="font-mono text-xs text-fg-faint">{r.source}</dd>}
              </div>
            ))}
          </dl>
        </details>
      );
    }
    case 'learner': {
      const d = item.data as TemplateDataByKind['learner'];
      return (
        <div className="space-y-2 text-fg-muted">
          <p>
            <span className="font-medium text-fg">{d.name}</span>, {d.age} anos{d.city ? `, ${d.city}` : ''}
          </p>
          <p>{d.situation}</p>
          <ul className="flex flex-wrap gap-1.5 text-xs">
            <li className="rounded-full border border-line px-2.5 py-1">{AUDIENCE_PROFILE_LABELS[d.audienceProfile]}</li>
            {d.traits.map((tr) => (
              <li key={tr} className="rounded-full border border-line px-2.5 py-1">{AUDIENCE_TRAIT_LABELS[tr]}</li>
            ))}
            <li className="rounded-full border border-line px-2.5 py-1">{d.minutesAvailable} min · {d.device}</li>
          </ul>
          <p className="text-xs text-fg-faint">{ANSWER_STYLE_LABELS[d.answerStyle]}</p>
        </div>
      );
    }
  }
}

function ApplyButton({ item, course, byKey }: { item: LibraryItem; course?: LibraryCourse; byKey: Map<string, LibraryItem> }) {
  const [step, setStep] = React.useState<'idle' | 'confirm' | 'busy'>('idle');
  const [result, setResult] = React.useState<{ ok: boolean; text: string; changes?: string[] } | null>(null);
  const blocked = item.kind === 'kit' ? resolveLocal(item, byKey).error : undefined;
  React.useEffect(() => {
    setStep('idle');
    setResult(null);
  }, [course?.id]);

  if (!course) return <p className="text-xs text-fg-faint">Escolha um curso acima para usar este modelo.</p>;
  if (blocked) return null;
  const what = item.kind === 'kit' ? 'instrutor, câmeras, voz, letreiro, marca e estilo de direção' : item.kind === 'voice' ? 'a voz' : item.kind === 'branding' ? "a marca d'água e a vinheta" : 'o estilo de direção';
  return (
    <div className="space-y-2 border-t border-line pt-4">
      {step === 'confirm' ? (
        <div className="space-y-3" role="group" aria-label="Confirmar uso do modelo">
          <p className="text-sm">
            Trocar {what} no rascunho de <strong>{course.title}</strong>? Nenhum vídeo é gerado; os já feitos podem ficar desatualizados.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={async () => {
                setStep('busy');
                setResult(null);
                try {
                  const r = await api<{ changed: boolean; revision: number; changes: string[] }>(`/api/courses/${course.id}/library`, { json: { template: item.key } });
                  setResult(r.changed ? { ok: true, text: `Aplicado (revisão ${r.revision}).`, changes: r.changes } : { ok: true, text: 'O curso já estava assim; nada mudou.' });
                } catch (e) {
                  setResult({ ok: false, text: e instanceof ApiError ? e.message : 'Não foi possível aplicar. Tente de novo.' });
                }
                setStep('idle');
              }}
              data-testid={`apply-${item.key}`}
            >
              Sim, usar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStep('idle')}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" disabled={step === 'busy'} onClick={() => setStep('confirm')}>
          {step === 'busy' ? 'Aplicando…' : 'Usar neste curso'}
        </Button>
      )}
      <div aria-live="polite">
        {result && (
          <div className={cn('rounded-lg px-3 py-2 text-sm', result.ok ? 'bg-success-soft' : 'bg-danger-soft text-danger')}>
            <p>{result.text}</p>
            {!!result.changes?.length && (
              <ul className="mt-1 list-disc pl-5 text-xs text-fg-muted">
                {result.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
            {result.ok && (
              <Link href={`/estudio/cursos/${course.id}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline">
                Abrir o curso
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface SimResult {
  title: string;
  revision: number;
  opinions: LearnerOpinion[];
  summary: { average: number | null; recommend: number; total: number; topIssues: Array<{ code: string; text: string; who: string[] }> };
}

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} de 5`} className="whitespace-nowrap text-accent">
      {'★'.repeat(value)}
      <span className="text-fg-faint">{'★'.repeat(5 - value)}</span>
    </span>
  );
}

function LearnerPanel({ course }: { course?: LibraryCourse }) {
  const [sim, setSim] = React.useState<SimResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setSim(null);
    setError(null);
  }, [course?.id]);
  return (
    <div className="panel space-y-4 p-5" data-testid="learner-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg-muted">
          {course ? <>Os alunos de teste fazem o rascunho de <strong className="text-fg">{course.title}</strong> e contam o que acharam.</> : 'Escolha um curso acima para os alunos de teste fazerem e opinarem.'}
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={!course || busy}
          onClick={async () => {
            if (!course) return;
            setBusy(true);
            setError(null);
            try {
              setSim(await api<SimResult>(`/api/courses/${course.id}/learners`));
            } catch (e) {
              setError(e instanceof ApiError ? e.message : 'Não foi possível simular. Tente de novo.');
            }
            setBusy(false);
          }}
          data-testid="simulate-learners"
        >
          {busy ? 'Simulando…' : 'Simular opiniões'}
        </Button>
      </div>
      <div aria-live="polite">
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {sim && (
          <div className="space-y-5">
            <p className="text-sm">
              Média <strong>{sim.summary.average?.toFixed(1).replace('.', ',') ?? '—'}</strong> de 5 · {sim.summary.recommend} de {sim.summary.total} indicariam · rascunho revisão {sim.revision}.{' '}
              <span className="text-fg-faint">Simulação por regras (tempo, texto na tela, fala, decisões, escrita, jargão), sem IA.</span>
            </p>
            {!!sim.summary.topIssues.length && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">O que mais atrapalhou</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {sim.summary.topIssues.map((i) => (
                    <li key={i.code}>
                      {i.text} <span className="text-fg-faint">({i.who.join(', ')})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="grid gap-3 md:grid-cols-2">
              {sim.opinions.map((o) => (
                <li key={o.profileKey} className="rounded-xl border border-line p-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{o.name}</span>
                    <Stars value={o.rating} />
                  </div>
                  <blockquote className="mt-2 text-fg-muted">“{o.quote}”</blockquote>
                  <p className="mt-2 text-xs text-fg-faint">
                    ~{String(o.minutes).replace('.', ',')} min · {o.lessonsDone} de {o.lessonsTotal} aulas{o.stoppedAt ? ` · parou em "${o.stoppedAt}"` : ''} · {o.choices.length} decisões
                  </p>
                  {(o.liked.length > 0 || o.issues.length > 0) && (
                    <details className="mt-2">
                      <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium">Detalhes</summary>
                      <ul className="space-y-1 text-xs">
                        {o.liked.map((f, i) => (
                          <li key={`l${i}`}><Badge tone="success">gostou</Badge> {f.text}</li>
                        ))}
                        {o.issues.map((f, i) => (
                          <li key={`i${i}`}><Badge tone="warning">atrapalhou</Badge> {f.text}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

