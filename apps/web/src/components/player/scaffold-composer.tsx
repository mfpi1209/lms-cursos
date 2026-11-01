'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { CircleCheck, CircleDashed, MessageCircle } from 'lucide-react';
import {
  assembleScaffold,
  cleanScaffoldValue,
  restoreScaffoldPicks,
  scaffoldGroupLabel,
  scaffoldGroups,
  scaffoldMissingCount,
  scaffoldSegments,
  type ReflectionScaffold,
  type ScaffoldSlot,
} from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { composeProgressText } from './compose-state';
import { NOTE_PRIVACY_HINT } from './privacy-hint';

export interface ComposedSentence {
  /** resposta montada (só vale para envio quando `complete`) */
  text: string;
  /** todos os grupos escolhidos */
  complete: boolean;
  /** grupos ainda sem escolha */
  missing: number;
  /** total de grupos */
  total: number;
}

type Pick = { kind: 'option'; value: string } | { kind: 'custom' };
const CUSTOM = '__escrever__';

/**
 * Montagem de resposta "tudo visível": todos os grupos de opções à mostra (um `fieldset` com rádios
 * nativos por lacuna do molde, na ordem do molde), e UMA prévia ao lado com a resposta montada pelo
 * molde (texto fixo, ordem, pontuação e lacunas repetidas). "Prefiro escrever" aparece só quando a
 * lacuna aceita escrita. Quem salva é o painel que usa este componente (`actions` entra no fim da
 * coluna da prévia). Sem escolha automática; o foco não se move a cada escolha.
 *
 * As cores vêm dos tokens do tema; dentro de `.compose-surface` (globals.css) viram a paleta roxa
 * da atividade, sem mudar o tema da plataforma.
 */
export function ScaffoldComposer({
  scaffold,
  disabled = false,
  readOnly = false,
  initialText,
  onChange,
  actions,
  stickyActions = false,
  className,
}: {
  scaffold: ReflectionScaffold;
  disabled?: boolean;
  /** resposta já salva: escolhas visíveis, sem edição */
  readOnly?: boolean;
  /** resposta salva antes (revisita): as escolhas voltam marcadas quando casam com o molde */
  initialText?: string | null;
  onChange?: (sentence: ComposedSentence) => void;
  /** botões e avisos do painel: abaixo da prévia (computador) ou no fim (celular) */
  actions?: React.ReactNode;
  /** celular: as ações ficam presas no rodapé do painel (quando a resposta está completa) */
  stickyActions?: boolean;
  className?: string;
}) {
  const groups = useMemo(() => scaffoldGroups(scaffold), [scaffold]);
  const [picks, setPicks] = useState<Record<string, Pick>>(() => fromSaved(scaffold, initialText).picks);
  const [customText, setCustomText] = useState<Record<string, string>>(() => fromSaved(scaffold, initialText).custom);
  const baseId = useId();
  // a resposta salva pode chegar depois (respostas do curso carregam à parte): restaura enquanto o aluno não mexeu
  const [touched, setTouched] = useState(false);
  const [restoredFrom, setRestoredFrom] = useState(initialText ?? null);
  if (!touched && (initialText ?? null) !== restoredFrom) {
    const r = fromSaved(scaffold, initialText);
    setRestoredFrom(initialText ?? null);
    setPicks(r.picks);
    setCustomText(r.custom);
  }

  const values = useMemo(() => {
    const v: Record<string, string> = {};
    for (const g of groups) {
      const p = picks[g.id];
      if (!p) continue;
      const raw = p.kind === 'option' ? p.value : (customText[g.id] ?? '');
      const c = cleanScaffoldValue(raw);
      if (c) v[g.id] = c;
    }
    return v;
  }, [groups, picks, customText]);

  const total = groups.length;
  const missing = scaffoldMissingCount(scaffold, values);
  const complete = missing === 0 && total > 0;
  const text = complete ? assembleScaffold(scaffold, values) : '';
  useEffect(() => onChange?.({ text, complete, missing, total }), [text, complete, missing, total, onChange]);

  const segments = scaffoldSegments(scaffold, values);
  const nothingYet = missing === total;
  const locked = disabled || readOnly;

  return (
    <div className={cn('grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start lg:gap-x-6', className)} data-testid="scaffold-composer">
      {/* escolhas: todos os grupos, compactos (opções em pílulas lado a lado) */}
      <div className="min-w-0 space-y-3">
        {groups.map((slot, i) => (
          <Group
            key={slot.id}
            slot={slot}
            position={i + 1}
            name={`${baseId}-${slot.id}`}
            pick={picks[slot.id]}
            customText={customText[slot.id] ?? ''}
            disabled={locked}
            onPick={(p) => {
              setTouched(true);
              setPicks((cur) => ({ ...cur, [slot.id]: p }));
            }}
            onCustomText={(t) => {
              setTouched(true);
              setCustomText((cur) => ({ ...cur, [slot.id]: t }));
            }}
          />
        ))}
      </div>

      {/* coluna da direita: prévia + ações (no celular, `contents`: viram itens da grade, e a barra presa no rodapé vale para o painel todo) */}
      <div className="min-w-0 max-lg:contents lg:space-y-3">
      {/* prévia única + estado */}
      <section aria-labelledby={`${baseId}-preview`} className="min-w-0 rounded-[16px] border border-line bg-surface-2 p-4 md:p-5" data-testid="scaffold-preview">
        <h3 id={`${baseId}-preview`} className="flex items-center gap-2 text-[16px] font-semibold text-fg md:text-[17px]">
          <MessageCircle className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
          Sua resposta
        </h3>
        {nothingYet ? (
          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted" data-testid="scaffold-preview-empty">
            Suas escolhas aparecerão aqui.
          </p>
        ) : (
          // não é região viva: a resposta inteira não é relida a cada clique (o estado curto abaixo é)
          <p className="mt-2 text-[17px] font-medium leading-[1.6] text-fg md:text-[18px]" data-testid="scaffold-sentence">
            {segments.map((s, k) => {
              if (s.kind === 'text') return <span key={k}>{s.text}</span>;
              if (s.kind === 'value')
                return (
                  <mark key={k} data-slot={s.slotId} className="rounded-[6px] bg-[var(--cp-chip,var(--t-accent-soft))] px-1 py-0.5 text-fg [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
                    {s.text}
                  </mark>
                );
              const pos = groups.findIndex((g) => g.id === s.slotId) + 1;
              return (
                <span key={k} data-missing={s.slotId} className="mx-0.5 inline-block rounded-[6px] border border-dashed border-line-strong px-1.5 text-[0.82em] font-normal leading-normal text-fg-muted">
                  <span className="sr-only">falta escolher </span>parte {pos}
                </span>
              );
            })}
          </p>
        )}
        <p role="status" className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[14px] text-fg-muted" data-testid="scaffold-progress">
          {complete ? <CircleCheck className="size-5 shrink-0 text-fg" aria-hidden="true" /> : <CircleDashed className="size-5 shrink-0" aria-hidden="true" />}
          {composeProgressText(missing, total)}
          {!readOnly && !complete && !nothingYet && <span className="sr-only">Você pode mudar suas escolhas antes de salvar.</span>}
        </p>
      </section>

      {/* ações: abaixo da prévia no computador; no celular, no fim, presas no rodapé quando a resposta está pronta */}
      {actions && (
        <div
          className={cn(
            'min-w-0',
            stickyActions && 'max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-5 max-lg:border-t max-lg:border-line max-lg:bg-[var(--t-bg)] max-lg:px-5 max-lg:pb-3 max-lg:pt-1',
          )}
          data-testid="scaffold-actions"
        >
          {actions}
        </div>
      )}
      </div>
    </div>
  );
}

function fromSaved(scaffold: ReflectionScaffold, saved: string | null | undefined): { picks: Record<string, Pick>; custom: Record<string, string> } {
  const restored = restoreScaffoldPicks(scaffold, saved);
  const picks: Record<string, Pick> = {};
  const custom: Record<string, string> = {};
  for (const [id, p] of Object.entries(restored ?? {})) {
    if (p.kind === 'option') picks[id] = { kind: 'option', value: p.value.trim() };
    else {
      picks[id] = { kind: 'custom' };
      custom[id] = p.text;
    }
  }
  return { picks, custom };
}

const OPTION =
  'inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2.5 rounded-full border border-line bg-[var(--cp-option,transparent)] py-2 pl-3 pr-4 text-left text-[15px] leading-snug text-fg/90 transition-colors duration-150 hover:border-line-strong motion-reduce:transition-none md:text-[16px] ' +
  // selecionada: indicador + borda laranja + fundo levemente destacado
  'has-[:checked]:border-[var(--t-accent-fill)] has-[:checked]:bg-[var(--cp-selected,var(--t-accent-soft))] has-[:checked]:text-fg ' +
  // foco (teclado): contorno próprio, diferente da seleção
  'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--cp-focus,var(--im-accent-ink,currentColor))] ' +
  'has-[:disabled]:cursor-default has-[:disabled]:hover:border-line';

function Radio() {
  return (
    <span aria-hidden="true" className="grid size-[18px] shrink-0 place-items-center rounded-full border-2 border-line-strong bg-transparent group-has-[:checked]/opt:border-[var(--t-accent-fill)] group-has-[:checked]/opt:bg-[var(--t-accent-fill)]">
      <span className="size-1.5 rounded-full bg-[var(--t-accent-fill-fg)] opacity-0 group-has-[:checked]/opt:opacity-100" />
    </span>
  );
}

function Group({
  slot,
  position,
  name,
  pick,
  customText,
  disabled,
  onPick,
  onCustomText,
}: {
  slot: ScaffoldSlot;
  position: number;
  name: string;
  pick: Pick | undefined;
  customText: string;
  disabled: boolean;
  onPick: (p: Pick) => void;
  onCustomText: (t: string) => void;
}) {
  const label = scaffoldGroupLabel(slot, position);
  const options = slot.options.map((o) => o.trim()).filter(Boolean);
  const customOn = pick?.kind === 'custom';
  const inputId = `${name}-escrever`;
  const customEmpty = customOn && !cleanScaffoldValue(customText);
  return (
    <fieldset className="min-w-0" data-testid={`scaffold-group-${slot.id}`}>
      <legend className="mb-1.5 flex items-center gap-2 text-[16px] font-semibold leading-snug text-fg md:text-[17px]">
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--t-accent-fill)] text-[13px] font-bold text-[var(--t-accent-fill-fg)]">
          {position}
        </span>
        <span className="min-w-0">{label}</span>
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        {options.map((o) => (
          <label key={o} className={cn('group/opt', OPTION)}>
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={o}
              checked={pick?.kind === 'option' && pick.value === o}
              disabled={disabled}
              onChange={() => onPick({ kind: 'option', value: o })}
            />
            <Radio />
            <span className="min-w-0">{o}</span>
          </label>
        ))}
        {/* escrever: link discreto no fim do grupo (não é uma pílula a mais); abre o campo só quando escolhido */}
        {slot.allowCustom && !customOn && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick({ kind: 'custom' })}
            data-testid={`scaffold-custom-${slot.id}`}
            className="inline-flex min-h-11 items-center rounded-[10px] px-2 text-[14px] text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-fg disabled:opacity-60"
          >
            Prefiro escrever
          </button>
        )}
      </div>
      {slot.allowCustom && customOn && (
        <div className="pt-2">
          {/* rádio da escolha "escrever" (mantém o grupo como seleção única para leitores de tela) */}
          <input type="radio" className="sr-only" name={name} value={CUSTOM} checked readOnly tabIndex={-1} aria-hidden="true" />
          <label htmlFor={inputId} className="mb-1 block text-[14px] font-medium text-fg-muted">
            Escreva sua versão
          </label>
          <input
            id={inputId}
            type="text"
            value={customText}
            maxLength={slot.customMaxLength}
            disabled={disabled}
            autoFocus
            onChange={(e) => onCustomText(e.target.value)}
            aria-describedby={`${inputId}-hint`}
            data-testid={`scaffold-custom-input-${slot.id}`}
            className="min-h-11 w-full rounded-[12px] border border-line-strong bg-[var(--cp-field,transparent)] px-4 text-[16px] text-fg outline-none placeholder:text-fg-faint focus-visible:border-[var(--t-accent-fill)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--cp-focus,var(--im-accent-ink,currentColor))] disabled:opacity-70"
            placeholder={options[0] ?? ''}
          />
          <p id={`${inputId}-hint`} className="mt-1 flex justify-between gap-3 text-[13px] text-fg-muted">
            <span>{customEmpty ? 'Escreva algo para completar esta parte.' : 'Ou volte e escolha uma das opções acima.'} {NOTE_PRIVACY_HINT}</span>
            <span className="tabular-nums" aria-hidden="true">
              {customText.length}/{slot.customMaxLength}
            </span>
          </p>
        </div>
      )}
    </fieldset>
  );
}
