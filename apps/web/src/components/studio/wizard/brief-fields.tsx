'use client';

import * as React from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  AUDIENCE_LEVELS,
  AUDIENCE_LEVEL_LABELS,
  AUDIENCE_PROFILES,
  AUDIENCE_PROFILE_LABELS,
  AUDIENCE_TRAITS,
  AUDIENCE_TRAIT_LABELS,
  NARRATIVE_VOICE_LABELS,
  briefProfileText,
  type AudienceTrait,
  type CourseDocument,
} from '@lms/course-schema';
import { Field, Input, Textarea, fieldHintId } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DURATION_CHIPS, RECOMMENDED_DURATION } from './wizard-state';
import { briefSuggestions, type BriefSuggestion } from './brief-suggestions';

export type Brief = CourseDocument['brief'];

export const EMPTY_BRIEF: Brief = {
  topic: '',
  audience: '',
  context: '',
  prerequisites: '',
  finalSkill: '',
  tone: '',
  narrativeVoice: 'second_person',
  targetMinutes: RECOMMENDED_DURATION,
  sourcesNote: '',
  // público mais comum na plataforma: jovens no primeiro emprego ou estágio
  audienceProfile: 'first_job',
  level: 'beginner',
  traits: [],
  interaction: { guidedChoices: true, voiceTraining: true, noWriting: true },
};

type NarrativeVoice = Brief['narrativeVoice'];

/** Pontos de vista da narrativa, com um exemplo de uma linha para cada. */
const NARRATIVE_VOICES: { value: NarrativeVoice; example: string; recommended?: string }[] = [
  { value: 'second_person', example: 'Você chega 10 minutos antes e a recrutadora chama seu nome.', recommended: 'mais pessoal; o aluno vive a situação' },
  { value: 'presenter', example: 'Eu vou te mostrar como o Rafael se preparou — e o que você faria diferente.' },
  { value: 'third_person', example: 'Rafael chega 10 minutos antes e a recrutadora chama seu nome.' },
];

/** Tons oferecidos como chips; o texto é o que vai para a IA (campo `tone`). */
export const TONE_CHIPS: { value: string; label: string; changes: string }[] = [
  { value: 'acolhedor e próximo', label: 'Acolhedor', changes: 'falas que encorajam; erro vira aprendizado, não bronca.' },
  { value: 'direto e curto', label: 'Direto', changes: 'frases curtas, instruções claras, sem rodeio.' },
  { value: 'formal e respeitoso', label: 'Formal', changes: 'tratamento mais cuidadoso, sem gírias.' },
];

/** O que cada traço muda nas aulas (uma linha, mostrada ao lado do chip). */
const TRAIT_CHANGES: Record<AudienceTrait, string> = {
  shy: 'decisões por escolha, voz opcional, nada de escrita obrigatória.',
  low_time: 'cenas curtas, uma decisão por aula, dicas práticas.',
  low_reading: 'frases curtas, pouco texto na tela, fala clara.',
  accessibility: 'linguagem simples, sem depender só de cor ou de áudio.',
};

/** Campos que precisam estar preenchidos para criar o curso / sair do passo 1. */
export function missingBriefFields(title: string, brief: Brief): string[] {
  const out: string[] = [];
  if (!title.trim()) out.push('o título do curso');
  if (!brief.topic.trim()) out.push('a ideia em uma frase');
  return out;
}

export type BriefPatch = <K extends keyof Brief>(key: K, value: Brief[K]) => void;

export interface BriefFieldsProps {
  title: string;
  brief: Brief;
  onTitle: (v: string) => void;
  onBrief: BriefPatch;
  /** mostra também contexto, pré-requisitos e nota de fontes (passo "Ideia e público" do assistente) */
  extended?: boolean;
  idPrefix?: string;
}

const chip = (active: boolean) =>
  cn(
    'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors',
    active ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg',
  );

/** Briefing guiado em linguagem de autor. Usado em /estudio/novo e no passo "Ideia e público". */
export function BriefFields({ title, brief, onTitle, onBrief, extended = false, idPrefix = 'brief' }: BriefFieldsProps) {
  const id = (k: string) => `${idPrefix}-${k}`;
  const traits = brief.traits ?? [];
  const interaction = brief.interaction ?? EMPTY_BRIEF.interaction;
  const suggestions = React.useMemo(() => briefSuggestions(title, brief, { extended }), [title, brief, extended]);
  const apply = (s: BriefSuggestion) => {
    if (s.field === 'title') onTitle(s.value);
    else onBrief(s.field, s.value);
  };

  const toggleTrait = (t: AudienceTrait) => {
    const next = traits.includes(t) ? traits.filter((x) => x !== t) : [...traits, t];
    onBrief('traits', next);
    // tímido: o formato de interação volta aos padrões seguros
    if (t === 'shy' && next.includes('shy')) onBrief('interaction', { guidedChoices: true, voiceTraining: true, noWriting: true });
  };
  const setLevel = (v: Brief['level']) => {
    onBrief('level', v);
    if (v === 'beginner') onBrief('interaction', { guidedChoices: true, voiceTraining: true, noWriting: true });
  };
  const toneChip = TONE_CHIPS.find((t) => t.value === brief.tone);
  const [customTone, setCustomTone] = React.useState(!!brief.tone && !toneChip);

  return (
    <div className="space-y-8">
      <Field label="Título do curso" htmlFor={id('title')} hint="É o nome que o aluno vê. Dá para mudar depois." required>
        <Input
          id={id('title')}
          data-testid="brief-title"
          value={title}
          maxLength={160}
          required
          aria-required="true"
          aria-describedby={fieldHintId(id('title'))}
          placeholder="Ex.: Sua primeira entrevista de estágio"
          className="font-display text-lg"
          onChange={(e) => onTitle(e.target.value)}
        />
      </Field>

      <Field label="Ideia em uma frase" htmlFor={id('topic')} hint="Isso muda: é o fio de toda a estrutura. Como você explicaria para um colega no corredor." required>
        <Textarea
          id={id('topic')}
          data-testid="brief-topic"
          rows={2}
          maxLength={500}
          required
          aria-required="true"
          aria-describedby={fieldHintId(id('topic'))}
          value={brief.topic}
          placeholder="Ex.: Como atender o primeiro cliente no balcão sem travar"
          onChange={(e) => onBrief('topic', e.target.value)}
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-fg">Público</legend>
        <p id={id('audienceProfile-hint')} className="mb-3 text-sm text-fg-muted">Isso muda: o tipo de situação, os exemplos e o quanto a IA explica.</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Momento de carreira do público" aria-describedby={id('audienceProfile-hint')}>
          {AUDIENCE_PROFILES.map((p) => {
            const active = brief.audienceProfile === p;
            return (
              <button key={p} type="button" role="radio" aria-checked={active} onClick={() => onBrief('audienceProfile', p)} className={chip(active)} data-testid={`audience-${p}`}>
                {active && <Check className="h-4 w-4" aria-hidden="true" />}
                {AUDIENCE_PROFILE_LABELS[p]}
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          <Field label="Para quem é, com suas palavras" htmlFor={id('audience')} hint="Cargo, momento de carreira ou situação de quem vai fazer o curso.">
            <Textarea
              id={id('audience')}
              aria-describedby={fieldHintId(id('audience'))}
              rows={2}
              maxLength={500}
              value={brief.audience}
              placeholder="Ex.: Jovens de 16 a 24 anos indo para a primeira vaga de balconista ou repositor"
              onChange={(e) => onBrief('audience', e.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-fg">Nível</legend>
        <p id={id('level-hint')} className="mb-3 text-sm text-fg-muted">Isso muda: iniciante ganha pistas no texto e decisões mais explícitas; intermediário, situações com mais pressão.</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Nível de partida" aria-describedby={id('level-hint')}>
          {AUDIENCE_LEVELS.map((l) => {
            const active = brief.level === l;
            return (
              <button key={l} type="button" role="radio" aria-checked={active} onClick={() => setLevel(l)} className={chip(active)} data-testid={`level-${l}`}>
                {active && <Check className="h-4 w-4" aria-hidden="true" />}
                {AUDIENCE_LEVEL_LABELS[l]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-fg">Traços do público</legend>
        <p id={id('traits-hint')} className="mb-3 text-sm text-fg-muted">Marque o que vale. Cada traço muda a forma das aulas, não o conteúdo.</p>
        <ul className="grid gap-2 sm:grid-cols-2" aria-describedby={id('traits-hint')}>
          {AUDIENCE_TRAITS.map((t) => {
            const active = traits.includes(t);
            return (
              <li key={t}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => toggleTrait(t)}
                  className={cn('flex w-full items-start gap-3 rounded-2xl border-2 bg-surface p-3 text-left transition-colors', active ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-line-strong')}
                  data-testid={`trait-${t}`}
                >
                  <span aria-hidden="true" className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2', active ? 'border-accent bg-accent-fill text-accent-fill-fg' : 'border-line-strong')}>
                    {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">{AUDIENCE_TRAIT_LABELS[t]}</span>
                    <span className="block text-xs text-fg-muted">Isso muda: {TRAIT_CHANGES[t]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-fg">Duração alvo</legend>
        <p id={id('targetMinutes-hint')} className="mb-3 text-sm text-fg-muted">Isso muda: quantas aulas a IA propõe (cerca de 3 minutos por aula, uma decisão real em cada).</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Duração alvo em minutos" aria-describedby={id('targetMinutes-hint')}>
          {DURATION_CHIPS.map((m) => {
            const active = brief.targetMinutes === m;
            const recommended = m === RECOMMENDED_DURATION;
            return (
              <button key={m} type="button" role="radio" aria-checked={active} onClick={() => onBrief('targetMinutes', m)} data-testid={`target-minutes-${m}`} className={chip(active)}>
                {m} min{recommended ? ' (recomendado)' : ''}
              </button>
            );
          })}
          {!DURATION_CHIPS.includes(brief.targetMinutes as (typeof DURATION_CHIPS)[number]) && (
            <span role="radio" aria-checked="true" className={chip(true)}>{brief.targetMinutes} min</span>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-fg">Tom</legend>
        <p id={id('tone-hint')} className="mb-3 text-sm text-fg-muted">Isso muda: como as falas soam. {toneChip ? `${toneChip.label}: ${toneChip.changes}` : 'Escolha um ou escreva o seu.'}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tom de voz" aria-describedby={id('tone-hint')}>
          {TONE_CHIPS.map((t) => {
            const active = !customTone && brief.tone === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setCustomTone(false);
                  onBrief('tone', t.value);
                }}
                className={chip(active)}
                data-testid={`tone-${t.label.toLowerCase()}`}
              >
                {active && <Check className="h-4 w-4" aria-hidden="true" />}
                {t.label}
              </button>
            );
          })}
          <button type="button" role="radio" aria-checked={customTone} onClick={() => setCustomTone(true)} className={chip(customTone)} data-testid="tone-outro">
            Outro
          </button>
        </div>
        {customTone && (
          <div className="mt-3">
            <Input id={id('tone')} aria-label="Tom, com suas palavras" value={brief.tone} maxLength={200} placeholder="Ex.: direto e próximo, sem gírias" onChange={(e) => onBrief('tone', e.target.value)} />
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-fg">Formato de interação</legend>
        <p id={id('interaction-hint')} className="mb-3 text-sm text-fg-muted">Isso muda: como o aluno responde nas cenas. Para iniciantes e tímidos, deixe os três ligados.</p>
        <ul className="grid gap-2 sm:grid-cols-3" aria-describedby={id('interaction-hint')}>
          {(
            [
              ['guidedChoices', 'Escolhas guiadas', 'o aluno decide entre opções; nunca precisa inventar a resposta.'],
              ['voiceTraining', 'Treino de voz opcional', 'pode ensaiar falando; só ele ouve, e dá para pular.'],
              ['noWriting', 'Sem escrita obrigatória', 'nenhuma cena exige digitar texto para avançar.'],
            ] as const
          ).map(([key, label, changes]) => {
            const active = interaction[key];
            return (
              <li key={key}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  onClick={() => onBrief('interaction', { ...interaction, [key]: !active })}
                  className={cn('flex h-full w-full flex-col items-start gap-1 rounded-2xl border-2 bg-surface p-3 text-left transition-colors', active ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-line-strong')}
                  data-testid={`interaction-${key}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <span aria-hidden="true" className={cn('relative inline-block h-5 w-9 rounded-full transition-colors', active ? 'bg-accent-fill' : 'bg-line-strong')}>
                      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-[left]', active ? 'left-[18px]' : 'left-0.5')} />
                    </span>
                    {label}
                  </span>
                  <span className="text-xs text-fg-muted">{active ? 'Ligado' : 'Desligado'}: {changes}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <Field label="Objetivo em uma frase: ao final, a pessoa consegue…" htmlFor={id('finalSkill')} hint="Isso muda: vira o critério de cada decisão. Complete com algo que dê para observar alguém fazendo.">
        <Textarea
          id={id('finalSkill')}
          aria-describedby={fieldHintId(id('finalSkill'))}
          rows={2}
          maxLength={500}
          value={brief.finalSkill}
          placeholder="Ex.: …cumprimentar o cliente, entender o que ele procura e chamar ajuda na hora certa"
          onChange={(e) => onBrief('finalSkill', e.target.value)}
        />
      </Field>

      {suggestions.length > 0 && (
        <section aria-labelledby={id('suggestions-title')} className="space-y-3 rounded-2xl border border-ai/30 bg-ai-soft/40 p-4" data-testid="brief-suggestions">
          <h3 id={id('suggestions-title')} className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Sparkles className="h-4 w-4 text-ai" aria-hidden="true" /> Sugestões para preencher
            <span className="text-xs font-normal text-fg-muted">(sem IA, a partir do que você já escreveu)</span>
          </h3>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:items-start sm:justify-between" data-testid={`brief-suggestion-${s.id}`}>
                <div className="min-w-0 space-y-0.5 text-sm">
                  <p className="font-medium text-fg">{s.label}</p>
                  <p className="text-fg-muted">“{s.value}”</p>
                  <p className="text-xs text-fg-faint">{s.why}</p>
                </div>
                <button type="button" onClick={() => apply(s)} className={cn(chip(false), 'shrink-0 border-ai/40 text-ai hover:border-ai')} data-testid={`brief-suggestion-apply-${s.id}`}>
                  Usar esta sugestão
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <fieldset aria-describedby={id('narrativeVoice-hint')}>
        <legend className="mb-1.5 block text-sm font-medium text-fg">Ponto de vista da narrativa</legend>
        <p id={id('narrativeVoice-hint')} className="mb-3 text-sm text-fg-muted">Isso muda: quem vive a história nas cenas. Vale para o curso todo.</p>
        <div className="grid gap-3">
          {NARRATIVE_VOICES.map((v) => {
            const active = brief.narrativeVoice === v.value;
            const exampleId = id(`narrativeVoice-${v.value}-example`);
            return (
              <label
                key={v.value}
                data-testid={`narrative-voice-${v.value}`}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-2xl border-2 bg-surface p-4 transition-colors has-focus-visible:outline has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
                  active ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name={id('narrativeVoice')}
                  value={v.value}
                  checked={active}
                  onChange={() => onBrief('narrativeVoice', v.value)}
                  aria-describedby={exampleId}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-accent focus-visible:outline-none"
                />
                <span className="min-w-0 space-y-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-fg">
                    {NARRATIVE_VOICE_LABELS[v.value]}
                    {v.recommended && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">Recomendado: {v.recommended}</span>}
                  </span>
                  <span id={exampleId} className="block text-sm italic text-fg-muted">
                    <span className="sr-only">Exemplo: </span>“{v.example}”
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {extended && (
        <>
          <Field label="Onde isso é usado no dia a dia" htmlFor={id('context')} hint="Isso muda: vira o cenário das cenas. A situação real em que a pessoa vai precisar do que aprendeu.">
            <Textarea id={id('context')} aria-describedby={fieldHintId(id('context'))} rows={3} maxLength={1000} value={brief.context} placeholder="Ex.: No balcão, com fila, quando um cliente pergunta por um produto que acabou" onChange={(e) => onBrief('context', e.target.value)} />
          </Field>
          <Field label="O que a pessoa já precisa saber" htmlFor={id('prerequisites')} hint="Deixe em branco se o curso começa do zero.">
            <Textarea id={id('prerequisites')} aria-describedby={fieldHintId(id('prerequisites'))} rows={2} maxLength={500} value={brief.prerequisites} placeholder="Ex.: Já conhece os produtos da loja" onChange={(e) => onBrief('prerequisites', e.target.value)} />
          </Field>
          <Field label="Observações sobre fontes" htmlFor={id('sourcesNote')} hint="De onde vem o conteúdo e o que merece conferência (normas, números, prazos).">
            <Textarea id={id('sourcesNote')} aria-describedby={fieldHintId(id('sourcesNote'))} rows={2} maxLength={2000} value={brief.sourcesNote} placeholder="Ex.: Política de trocas atualizada em março; conferir prazos" onChange={(e) => onBrief('sourcesNote', e.target.value)} />
          </Field>
        </>
      )}

      <details className="rounded-xl border border-line bg-bg-2 px-4 py-1" data-testid="brief-ai-view">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-fg">Como a IA vai ler este briefing</summary>
        <dl className="mb-3 mt-1 space-y-1.5 text-sm">
          {(
            [
              ['Tema', brief.topic],
              ['Público', brief.audience],
              ['Perfil do público', briefProfileText(brief)],
              ['Contexto', brief.context],
              ['Habilidade final', brief.finalSkill],
              ['Tom', brief.tone],
              ['Duração alvo', `${brief.targetMinutes} min`],
            ] as const
          )
            .filter(([, v]) => !!v)
            .map(([k, v]) => (
              <div key={k} className="grid gap-x-3 sm:grid-cols-[140px_1fr]">
                <dt className="text-fg-faint">{k}</dt>
                <dd className="text-fg-muted">{v}</dd>
              </div>
            ))}
        </dl>
      </details>
    </div>
  );
}
