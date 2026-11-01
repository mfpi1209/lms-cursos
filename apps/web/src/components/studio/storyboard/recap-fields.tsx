'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { EndNode, RecapItem } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { shortId } from '@/components/studio/graph-ops';
import { cn } from '@/lib/utils';
import { selectClass } from './inline-editors';
import { sceneLabel, type StoryboardModel } from './scene-model';
import type { GraphChange } from './scene-fields';
import { makePatch } from './scene-fields';

const MAX_ITEMS = 12;
const OTHER = '__other';

const KIND_LABEL: Record<RecapItem['kind'], string> = {
  reflection: 'Resposta de uma reflexão',
  choice: 'Opção escolhida numa decisão',
  mission: 'Missão "Leve para a vida real" (estado e o que a pessoa percebeu)',
  checklist: 'Lista para marcar',
  text: 'Texto fixo',
};

const DEFAULT_EMPTY = 'Completar quando quiser';

function newItem(kind: RecapItem['kind'] = 'reflection'): RecapItem {
  return { id: `r_${shortId()}`, label: '', kind, emptyText: DEFAULT_EMPTY };
}

/**
 * Editor da página "Meu roteiro" do encerramento: título, itens (fonte do
 * aluno ou lembrete fixo) e frase de fechamento. Tudo salva via patch do nó.
 */
export function RecapEditor({ node, model, changeGraph }: { node: EndNode; model: StoryboardModel; changeGraph: GraphChange }) {
  const patch = makePatch<EndNode>(node.id, changeGraph);
  const items = node.recap ?? [];
  const setItems = (next: RecapItem[], coalesce?: string) => patch({ recap: next.length ? next : undefined }, coalesce);
  const update = (id: string, p: Partial<RecapItem>, coalesce?: string) =>
    changeGraph((g) => {
      const cur = g.nodes.find((n) => n.id === node.id);
      if (!cur || cur.type !== 'end') return g;
      const recap = (cur.recap ?? []).map((it) => (it.id === id ? { ...it, ...p } : it));
      return { ...g, nodes: g.nodes.map((n) => (n.id === node.id ? { ...cur, recap } : n)) };
    }, coalesce);
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setItems(next);
  };

  return (
    <section className="space-y-3 rounded-xl border border-line bg-bg p-3 sm:p-4" aria-labelledby={`recap-h-${node.id}`} data-testid="recap-editor">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 id={`recap-h-${node.id}`} className="text-sm font-semibold text-fg">Meu roteiro</h4>
          <p className="text-xs text-fg-muted">Página final com o que a pessoa escreveu e escolheu, nas palavras dela, mais lembretes fixos. Fontes vazias mostram o texto de “vazio” — nunca um exemplo.</p>
        </div>
        {items.length > 0 && <span className="text-xs text-fg-faint">{items.length}/{MAX_ITEMS}</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
          Título da página
          <Input className="min-h-11 text-sm" maxLength={80} placeholder="Meu roteiro" value={node.recapTitle ?? ''} data-testid="recap-title" onChange={(e) => patch({ recapTitle: e.target.value || undefined }, `node.recapTitle.${node.id}`)} />
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-fg-muted">
          Frase de fechamento
          <Input className="min-h-11 text-sm" maxLength={200} placeholder="Ex.: Você não precisa decorar sua história. Precisa saber o que ela diz." value={node.closingLine ?? ''} data-testid="recap-closing" onChange={(e) => patch({ closingLine: e.target.value || undefined }, `node.closingLine.${node.id}`)} />
        </label>
      </div>

      {items.length > 0 && (
        <ol className="space-y-2" aria-label="Itens do roteiro">
          {items.map((it, idx) => (
            <RecapItemRow
              key={it.id}
              item={it}
              index={idx}
              total={items.length}
              model={model}
              onChange={(p, c) => update(it.id, p, c)}
              onMove={(dir) => move(idx, dir)}
              onRemove={() => setItems(items.filter((x) => x.id !== it.id))}
            />
          ))}
        </ol>
      )}

      <Button variant="secondary" size="sm" disabled={items.length >= MAX_ITEMS} data-testid="recap-add" onClick={() => setItems([...items, newItem()])}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar item ao roteiro
      </Button>
    </section>
  );
}

function RecapItemRow({
  item,
  index,
  total,
  model,
  onChange,
  onMove,
  onRemove,
}: {
  item: RecapItem;
  index: number;
  total: number;
  model: StoryboardModel;
  onChange: (p: Partial<RecapItem>, coalesce?: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const needsSource = item.kind === 'reflection' || item.kind === 'choice' || item.kind === 'mission';
  const candidates = model.all.filter((s) => s.node.type === item.kind);
  const isLocal = !!item.nodeId && model.byId.has(item.nodeId);
  const [other, setOther] = React.useState(() => !!item.nodeId && !model.byId.has(item.nodeId));
  const uid = `recap-${item.id}`;
  const n = index + 1;

  return (
    <li className="rounded-xl border border-line bg-surface p-2.5 sm:p-3" data-testid={`recap-item-${item.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent" aria-hidden="true">{n}</span>
        <Input
          aria-label={`Rótulo do item ${n}`}
          className="min-h-11 min-w-[10rem] flex-1 text-sm"
          maxLength={80}
          placeholder="Ex.: Minha frase de abertura"
          value={item.label}
          data-testid={`${uid}-label`}
          onChange={(e) => onChange({ label: e.target.value }, `recap.label.${item.id}`)}
        />
        <select
          aria-label={`Tipo do item ${n}`}
          className={cn(selectClass, 'w-auto')}
          value={item.kind}
          data-testid={`${uid}-kind`}
          onChange={(e) => {
            const kind = e.target.value as RecapItem['kind'];
            // ao trocar o tipo, limpa o que não faz sentido para o novo tipo
            onChange({ kind, nodeId: undefined, nodeIds: undefined, items: kind === 'checklist' ? item.items : undefined, text: kind === 'text' ? item.text : undefined });
            setOther(false);
          }}
        >
          {(Object.keys(KIND_LABEL) as RecapItem['kind'][]).map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="sm" aria-label={`Mover item ${n} para cima`} disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" aria-label={`Mover item ${n} para baixo`} disabled={index === total - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" aria-label={`Remover item ${n}`} data-testid={`${uid}-remove`} onClick={onRemove}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_minmax(0,14rem)] sm:pl-10">
        {needsSource && (
          <div className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            <label htmlFor={`${uid}-source`}>{item.kind === 'reflection' ? 'Reflexão de origem' : item.kind === 'mission' ? 'Missão de origem' : 'Decisão de origem'}</label>
            <select
              id={`${uid}-source`}
              className={selectClass}
              data-testid={`${uid}-source`}
              value={other ? OTHER : isLocal ? item.nodeId : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === OTHER) {
                  setOther(true);
                  return;
                }
                setOther(false);
                onChange({ nodeId: v || undefined });
              }}
            >
              <option value="">— escolher cena desta aula —</option>
              {candidates.map((s) => (
                <option key={s.node.id} value={s.node.id}>{sceneLabel(model, s.node.id)}</option>
              ))}
              <option value={OTHER}>Cena de outra aula (digitar id)…</option>
            </select>
            {candidates.length === 0 && !other && <p className="font-normal text-fg-faint">Esta aula ainda não tem cena de {item.kind === 'reflection' ? 'reflexão' : item.kind === 'mission' ? 'missão' : 'decisão'}.</p>}
            {!!item.nodeIds?.length && (
              <p className="font-normal text-fg-faint" data-testid={`${uid}-variants`}>
                Também vale para as variantes: <span className="font-mono">{item.nodeIds.join(', ')}</span> (a resposta mais recente aparece).
              </p>
            )}
            {other && (
              <>
                <Input
                  aria-label="Id da cena em outra aula"
                  className="min-h-11 font-mono text-sm"
                  maxLength={80}
                  placeholder="ex.: reflexao_abertura"
                  value={item.nodeId ?? ''}
                  data-testid={`${uid}-source-other`}
                  onChange={(e) => onChange({ nodeId: e.target.value.trim() || undefined }, `recap.nodeId.${item.id}`)}
                />
                <p className="font-normal text-fg-faint">
                  Id da cena como aparece no modo avançado da outra aula. A verificação completa acontece ao publicar o curso. Atenção: respostas são guardadas por aula — na prévia e em tentativas separadas, esta fonte pode aparecer vazia.
                </p>
              </>
            )}
          </div>
        )}
        {item.kind === 'checklist' && (
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            Itens da lista (um por linha, até 12)
            <Textarea
              rows={3}
              className="min-h-20 text-sm"
              placeholder={'Respirar antes de falar\nDizer o nome e o motivo\nPerguntar o próximo passo'}
              value={(item.items ?? []).join('\n')}
              data-testid={`${uid}-items`}
              onChange={(e) => onChange({ items: e.target.value.split('\n').slice(0, 12).map((s) => s.slice(0, 160)) }, `recap.items.${item.id}`)}
              onBlur={(e) => onChange({ items: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12).map((s) => s.slice(0, 160)) })}
            />
          </label>
        )}
        {item.kind === 'text' && (
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            Texto fixo
            <Textarea rows={2} className="min-h-16 text-sm" maxLength={600} placeholder="Um lembrete curto que vale para todo mundo…" value={item.text ?? ''} data-testid={`${uid}-text`} onChange={(e) => onChange({ text: e.target.value }, `recap.text.${item.id}`)} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          Quando estiver vazio, mostrar
          <Input className="min-h-11 text-sm" maxLength={120} value={item.emptyText} data-testid={`${uid}-empty`} onChange={(e) => onChange({ emptyText: e.target.value }, `recap.empty.${item.id}`)} onBlur={(e) => !e.target.value.trim() && onChange({ emptyText: DEFAULT_EMPTY })} />
        </label>
      </div>
    </li>
  );
}
