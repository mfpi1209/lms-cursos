'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Plus, Trash2, Undo2 } from 'lucide-react';
import {
  EXPERIENCE_FAMILIES,
  EXPERIENCE_FAMILY_LABELS,
  compileCourse,
  type CourseDocument,
  type Lesson,
  type Module,
  type Objective,
} from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { Card, Badge } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea, fieldHintId } from '@/components/ui/input';
import { SaveStatus, useDraft } from '@/components/studio/draft-provider';
import { TrailField } from '@/components/studio/trail-field';
import { createLesson, createModule, createObjective, moveItem } from '@/components/studio/graph-ops';
import { cn, formatDate } from '@/lib/utils';

type Brief = CourseDocument['brief'];

type BriefTextKey = 'topic' | 'audience' | 'context' | 'prerequisites' | 'finalSkill' | 'tone' | 'sourcesNote';
const BRIEF_FIELDS: { key: BriefTextKey; label: string; hint: string; rows: number }[] = [
  { key: 'audience', label: 'Público', hint: 'Quem faz o curso e em que momento da vida profissional.', rows: 2 },
  { key: 'context', label: 'Contexto', hint: 'Situação real em que a habilidade será usada.', rows: 3 },
  { key: 'prerequisites', label: 'Pré-requisitos', hint: 'O que o aluno já precisa saber ou ter.', rows: 2 },
  { key: 'finalSkill', label: 'Habilidade final observável', hint: 'O que o aluno consegue fazer ao terminar, de forma verificável.', rows: 2 },
  { key: 'sourcesNote', label: 'Fontes e referências', hint: 'De onde vem o conteúdo; o que precisa de revisão.', rows: 3 },
];

export function CourseOverview({ courseId }: { courseId: string }) {
  const { document: doc, update, undo, canUndo, lastSavedAt } = useDraft();
  const compiled = React.useMemo(() => compileCourse(doc), [doc]);

  const setField = <K extends keyof CourseDocument>(key: K, value: CourseDocument[K]) =>
    update((d) => ({ ...d, [key]: value }), { coalesce: `course.${String(key)}` });
  const setBrief = (key: BriefTextKey, value: string) => update((d) => ({ ...d, brief: { ...d.brief, [key]: value } }), { coalesce: `brief.${key}` });

  const allLessons = doc.modules.flatMap((m) => m.lessons);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SaveStatus />
        <div className="flex items-center gap-3 text-sm text-fg-muted">
          {lastSavedAt && <span>Última gravação {formatDate(lastSavedAt)}</span>}
          <Button variant="secondary" size="sm" onClick={undo} disabled={!canUndo} aria-label="Desfazer última alteração">
            <Undo2 className="h-4 w-4" aria-hidden="true" /> Desfazer
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <Card className="rise space-y-6">
            <h2 className="text-2xl">Identificação</h2>
            <Field label="Título" htmlFor="course-title-input" required>
              <Input id="course-title-input" value={doc.title} maxLength={160} required aria-required="true" className="font-display text-lg font-bold" onChange={(e) => setField('title', e.target.value)} />
            </Field>
            <Field label="Descrição" htmlFor="course-description" hint="Aparece para o aluno na lista de cursos.">
              <Textarea id="course-description" aria-describedby={fieldHintId('course-description')} rows={3} maxLength={2000} value={doc.description} onChange={(e) => setField('description', e.target.value)} />
            </Field>
            <TrailField courseId={courseId} />
          </Card>

          <Card className="space-y-6">
            <div>
              <h2 className="text-2xl">Briefing</h2>
              <p className="mt-1 text-sm text-fg-muted">O que todo curso precisa declarar antes de existir conteúdo.</p>
            </div>
            {BRIEF_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`brief-${f.key}`} hint={f.hint}>
                <Textarea id={`brief-${f.key}`} aria-describedby={f.hint ? fieldHintId(`brief-${f.key}`) : undefined} rows={f.rows} value={doc.brief[f.key]} onChange={(e) => setBrief(f.key, e.target.value)} />
              </Field>
            ))}
          </Card>

          <ObjectivesEditor objectives={doc.objectives} />

          <ModulesEditor courseId={courseId} modules={doc.modules} objectives={doc.objectives} />
        </div>

        <div className="space-y-8">
          <Card className="space-y-4">
            <div>
              <h2 className="text-2xl">Conclusão do curso</h2>
              <p className="mt-1 text-sm text-fg-muted">Aulas obrigatórias para concluir o curso.</p>
            </div>
            {allLessons.length === 0 ? (
              <p className="text-sm text-fg-muted">Crie aulas para definir as obrigatórias.</p>
            ) : (
              <ul className="space-y-1">
                {allLessons.map((l) => {
                  const checked = doc.completion.requiredLessonIds.includes(l.id);
                  return (
                    <li key={l.id}>
                      <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
                        <Checkbox
                          checked={checked}
                          onChange={(e) =>
                            update((d) => ({
                              ...d,
                              completion: {
                                requiredLessonIds: e.target.checked
                                  ? [...d.completion.requiredLessonIds, l.id]
                                  : d.completion.requiredLessonIds.filter((id) => id !== l.id),
                              },
                            }))
                          }
                        />
                        <span>{l.title}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-2xl">Pendências</h2>
              <div className="flex gap-1">
                <Badge tone={compiled.errors.length ? 'danger' : 'success'}>{compiled.errors.length} {compiled.errors.length === 1 ? 'erro' : 'erros'}</Badge>
                <Badge tone={compiled.warnings.length ? 'warning' : 'neutral'}>{compiled.warnings.length} {compiled.warnings.length === 1 ? 'aviso' : 'avisos'}</Badge>
              </div>
            </div>
            <p className="text-sm text-fg-muted">Erros bloqueiam a publicação; avisos são editoriais.</p>
            <ul className="max-h-80 space-y-1.5 overflow-auto text-sm">
              {compiled.errors.map((i, idx) => (
                <li key={`e${idx}`} className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                  {i.lessonId ? <LessonIssueLink courseId={courseId} lessonId={i.lessonId} nodeId={i.nodeId} message={i.message} /> : i.message}
                </li>
              ))}
              {compiled.warnings.map((i, idx) => (
                <li key={`w${idx}`} className="rounded-lg bg-paid-soft px-3 py-2 text-paid">
                  {i.lessonId ? <LessonIssueLink courseId={courseId} lessonId={i.lessonId} nodeId={i.nodeId} message={i.message} /> : i.message}
                </li>
              ))}
              {compiled.errors.length === 0 && compiled.warnings.length === 0 && <li className="text-fg-muted">Nenhuma pendência.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LessonIssueLink({ courseId, lessonId, nodeId, message }: { courseId: string; lessonId: string; nodeId?: string; message: string }) {
  const href = `/estudio/cursos/${courseId}/aulas/${lessonId}${nodeId ? `?node=${encodeURIComponent(nodeId)}` : ''}`;
  return (
    <Link href={href} className="hover:underline">
      {message}
    </Link>
  );
}

/* ------------------------------------------------------------------ */

function ObjectivesEditor({ objectives }: { objectives: Objective[] }) {
  const { update } = useDraft();
  const [newTitle, setNewTitle] = React.useState('');

  const setObjective = (id: string, patch: Partial<Objective>, coalesce?: string) =>
    update((d) => ({ ...d, objectives: d.objectives.map((o) => (o.id === id ? { ...o, ...patch } : o)) }), coalesce ? { coalesce } : undefined);

  const add = () => {
    const title = newTitle.trim();
    if (!title) return;
    update((d) => ({ ...d, objectives: [...d.objectives, createObjective(title, new Set(d.objectives.map((o) => o.id)))] }));
    setNewTitle('');
  };

  const remove = (id: string) => {
    if (!window.confirm('Remover este objetivo? As aulas e blocos ligados a ele perderão a referência.')) return;
    update((d) => ({
      ...d,
      objectives: d.objectives.filter((o) => o.id !== id),
      modules: d.modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => ({
          ...l,
          objectiveIds: l.objectiveIds.filter((x) => x !== id),
          graph: { ...l.graph, nodes: l.graph.nodes.map((n) => ({ ...n, objectiveIds: n.objectiveIds.filter((x) => x !== id) })) },
        })),
      })),
    }));
  };

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-2xl">Objetivos de aprendizagem</h2>
        <p className="mt-1 text-sm text-fg-muted">Cada objetivo precisa de um critério observável. Blocos e aulas se ligam a eles.</p>
      </div>
      {objectives.length === 0 && <p className="text-sm text-fg-muted">Nenhum objetivo ainda.</p>}
      <ul className="space-y-3" data-testid="objective-list">
        {objectives.map((o, idx) => (
          <li key={o.id} className="rounded-2xl bg-bg-2 p-4" data-testid={`objective-${o.id}`}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-4">
                <Field label={`Objetivo ${idx + 1}`} htmlFor={`obj-title-${o.id}`}>
                  <Input id={`obj-title-${o.id}`} value={o.title} maxLength={200} onChange={(e) => setObjective(o.id, { title: e.target.value }, `obj.title.${o.id}`)} />
                </Field>
                <Field label="Critério observável" htmlFor={`obj-crit-${o.id}`} hint="Como reconhecer que o aluno aprendeu.">
                  <Textarea id={`obj-crit-${o.id}`} rows={2} maxLength={500} value={o.criterion} onChange={(e) => setObjective(o.id, { criterion: e.target.value }, `obj.crit.${o.id}`)} />
                </Field>
                <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
                  <Checkbox checked={o.required} onChange={(e) => setObjective(o.id, { required: e.target.checked })} />
                  Obrigatório para o curso
                </label>
                <p className="text-xs text-fg-faint">ID: {o.id}</p>
              </div>
              <div className="flex gap-1 sm:flex-col">
                <Button variant="ghost" size="icon" aria-label={`Mover objetivo ${idx + 1} para cima`} disabled={idx === 0} onClick={() => update((d) => ({ ...d, objectives: moveItem(d.objectives, idx, -1) }))}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Mover objetivo ${idx + 1} para baixo`} disabled={idx === objectives.length - 1} onClick={() => update((d) => ({ ...d, objectives: moveItem(d.objectives, idx, 1) }))}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Remover objetivo ${idx + 1}`} className="text-danger hover:text-danger" onClick={() => remove(o.id)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="new-objective" className="sr-only">Título do novo objetivo</label>
        <Input id="new-objective" placeholder="Novo objetivo (ex.: Negociar um prazo com o gestor)" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!newTitle.trim()} data-testid="add-objective">
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar objetivo
        </Button>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function ModulesEditor({ courseId, modules, objectives }: { courseId: string; modules: Module[]; objectives: Objective[] }) {
  const { update } = useDraft();
  const [newModule, setNewModule] = React.useState('');

  const setModule = (id: string, fn: (m: Module) => Module) => update((d) => ({ ...d, modules: d.modules.map((m) => (m.id === id ? fn(m) : m)) }));

  const removeModule = (m: Module) => {
    const msg = m.lessons.length ? `Remover o módulo "${m.title}" e suas ${m.lessons.length} aula(s)?` : `Remover o módulo "${m.title}"?`;
    if (!window.confirm(msg)) return;
    const lessonIds = new Set(m.lessons.map((l) => l.id));
    update((d) => ({
      ...d,
      modules: d.modules.filter((x) => x.id !== m.id),
      completion: { requiredLessonIds: d.completion.requiredLessonIds.filter((id) => !lessonIds.has(id)) },
    }));
  };

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-2xl">Módulos e aulas</h2>
        <p className="mt-1 text-sm text-fg-muted">Ordem de apresentação ao aluno. Cada aula tem seu próprio editor de blocos.</p>
      </div>
      {modules.length === 0 && <p className="text-sm text-fg-muted">Nenhum módulo ainda.</p>}
      <ol className="space-y-4" data-testid="module-list">
        {modules.map((m, mi) => (
          <li key={m.id} className="rounded-2xl bg-bg-2 p-4" data-testid={`module-${m.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-4">
                <Field label={`Módulo ${mi + 1}`} htmlFor={`mod-title-${m.id}`}>
                  <Input id={`mod-title-${m.id}`} value={m.title} maxLength={160} className="font-display font-bold" onChange={(e) => setModule(m.id, (x) => ({ ...x, title: e.target.value }))} />
                </Field>
                <Field label="Descrição do módulo" htmlFor={`mod-desc-${m.id}`}>
                  <Textarea id={`mod-desc-${m.id}`} rows={2} maxLength={1000} value={m.description} onChange={(e) => setModule(m.id, (x) => ({ ...x, description: e.target.value }))} />
                </Field>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" aria-label={`Mover módulo ${mi + 1} para cima`} disabled={mi === 0} onClick={() => update((d) => ({ ...d, modules: moveItem(d.modules, mi, -1) }))}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Mover módulo ${mi + 1} para baixo`} disabled={mi === modules.length - 1} onClick={() => update((d) => ({ ...d, modules: moveItem(d.modules, mi, 1) }))}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Remover módulo ${mi + 1}`} className="text-danger hover:text-danger" onClick={() => removeModule(m)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <ol className="mt-4 space-y-2 border-l-2 border-line pl-4">
              {m.lessons.map((l, li) => (
                <LessonRow
                  key={l.id}
                  courseId={courseId}
                  lesson={l}
                  index={li}
                  count={m.lessons.length}
                  objectives={objectives}
                  onChange={(fn) => setModule(m.id, (x) => ({ ...x, lessons: x.lessons.map((y) => (y.id === l.id ? fn(y) : y)) }))}
                  onMove={(delta) => setModule(m.id, (x) => ({ ...x, lessons: moveItem(x.lessons, li, delta) }))}
                  onRemove={() => {
                    if (!window.confirm(`Remover a aula "${l.title}" e todos os seus blocos?`)) return;
                    update((d) => ({
                      ...d,
                      modules: d.modules.map((x) => (x.id === m.id ? { ...x, lessons: x.lessons.filter((y) => y.id !== l.id) } : x)),
                      completion: { requiredLessonIds: d.completion.requiredLessonIds.filter((id) => id !== l.id) },
                    }));
                  }}
                />
              ))}
            </ol>
            <AddLessonForm moduleId={m.id} onAdd={(title) => setModule(m.id, (x) => ({ ...x, lessons: [...x.lessons, createLesson(title)] }))} />
          </li>
        ))}
      </ol>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const title = newModule.trim();
          if (!title) return;
          update((d) => ({ ...d, modules: [...d.modules, createModule(title)] }));
          setNewModule('');
        }}
      >
        <label htmlFor="new-module" className="sr-only">Título do novo módulo</label>
        <Input id="new-module" placeholder="Novo módulo" value={newModule} onChange={(e) => setNewModule(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!newModule.trim()} data-testid="add-module">
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar módulo
        </Button>
      </form>
    </Card>
  );
}

function AddLessonForm({ moduleId, onAdd }: { moduleId: string; onAdd: (title: string) => void }) {
  const [title, setTitle] = React.useState('');
  return (
    <form
      className="mt-4 flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        onAdd(t);
        setTitle('');
      }}
    >
      <label htmlFor={`new-lesson-${moduleId}`} className="sr-only">Título da nova aula</label>
      <Input id={`new-lesson-${moduleId}`} placeholder="Nova aula" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Button type="submit" variant="secondary" size="sm" disabled={!title.trim()} data-testid={`add-lesson-${moduleId}`}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar aula
      </Button>
    </form>
  );
}

function LessonRow({
  courseId,
  lesson,
  index,
  count,
  objectives,
  onChange,
  onMove,
  onRemove,
}: {
  courseId: string;
  lesson: Lesson;
  index: number;
  count: number;
  objectives: Objective[];
  onChange: (fn: (l: Lesson) => Lesson) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = `lesson-panel-${lesson.id}`;
  return (
    <li className="rounded-xl border border-line bg-surface-2 p-3" data-testid={`lesson-${lesson.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link href={`/estudio/cursos/${courseId}/aulas/${lesson.id}`} className="font-medium text-fg hover:text-accent-strong hover:underline" data-testid={`lesson-link-${lesson.id}`}>
            {index + 1}. {lesson.title}
          </Link>
          <p className="text-xs text-fg-faint">
            {EXPERIENCE_FAMILY_LABELS[lesson.family]} · {lesson.estimatedMinutes} min · {lesson.graph.nodes.length} bloco(s)
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
            {open ? 'Fechar' : 'Detalhes'}
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Mover aula ${index + 1} para cima`} disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Mover aula ${index + 1} para baixo`} disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Remover aula ${index + 1}`} className="text-danger hover:text-danger" onClick={onRemove}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div id={panelId} className={cn('mt-4 space-y-4', !open && 'hidden')}>
        <Field label="Título da aula" htmlFor={`lesson-title-${lesson.id}`}>
          <Input id={`lesson-title-${lesson.id}`} value={lesson.title} maxLength={160} onChange={(e) => onChange((l) => ({ ...l, title: e.target.value }))} />
        </Field>
        <Field label="Descrição" htmlFor={`lesson-desc-${lesson.id}`}>
          <Textarea id={`lesson-desc-${lesson.id}`} rows={2} maxLength={1000} value={lesson.description} onChange={(e) => onChange((l) => ({ ...l, description: e.target.value }))} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Duração estimada (min)" htmlFor={`lesson-min-${lesson.id}`} hint="Orientação editorial, não regra.">
            <Input
              id={`lesson-min-${lesson.id}`}
              type="number"
              min={1}
              max={600}
              value={lesson.estimatedMinutes}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v >= 1 && v <= 600) onChange((l) => ({ ...l, estimatedMinutes: v }));
              }}
            />
          </Field>
          <Field label="Família de experiência" htmlFor={`lesson-family-${lesson.id}`}>
            <Select id={`lesson-family-${lesson.id}`} value={lesson.family} onChange={(e) => onChange((l) => ({ ...l, family: e.target.value as Lesson['family'] }))}>
              {EXPERIENCE_FAMILIES.map((f) => (
                <option key={f} value={f}>{EXPERIENCE_FAMILY_LABELS[f]}</option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-fg">Objetivos trabalhados</legend>
          {objectives.length === 0 ? (
            <p className="text-sm text-fg-muted">Cadastre objetivos acima para ligá-los à aula.</p>
          ) : (
            <ul className="space-y-1">
              {objectives.map((o) => (
                <li key={o.id}>
                  <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
                    <Checkbox
                      checked={lesson.objectiveIds.includes(o.id)}
                      onChange={(e) => onChange((l) => ({ ...l, objectiveIds: e.target.checked ? [...l.objectiveIds, o.id] : l.objectiveIds.filter((x) => x !== o.id) }))}
                    />
                    {o.title}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <Link href={`/estudio/cursos/${courseId}/aulas/${lesson.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong hover:underline">
          Abrir editor de blocos
        </Link>
      </div>
    </li>
  );
}
