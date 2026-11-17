'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ExternalLink, FileText, Image as ImageIcon, Link2, Trash2, Undo2, Upload } from 'lucide-react';
import { MATERIAL_CATEGORIES, MATERIAL_CATEGORY_LABEL, formatBytes, materialHref, type CourseMaterial, type MaterialCategory } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { SaveStatus, useDraft } from '@/components/studio/draft-provider';
import { moveItem } from '@/components/studio/graph-ops';

type Uploaded = { assetId: string; format: 'pdf' | 'image'; sizeBytes: number; originalName: string };

function slugify(s: string, taken: Set<string>): string {
  const base =
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'material';
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

const FORMAT_ICON = { pdf: FileText, image: ImageIcon, link: Link2 } as const;
const FORMAT_LABEL = { pdf: 'PDF', image: 'Imagem', link: 'Link' } as const;

export function MaterialsEditor({ courseId }: { courseId: string }) {
  const { document: doc, update, undo, canUndo } = useDraft();
  const materials = doc.materials;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [linkUrl, setLinkUrl] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

  const setMaterials = (fn: (list: CourseMaterial[]) => CourseMaterial[], coalesce?: string) =>
    update((d) => ({ ...d, materials: fn(d.materials) }), coalesce ? { coalesce } : undefined);
  const patch = (id: string, p: Partial<CourseMaterial>, field: string) =>
    setMaterials((list) => list.map((m) => (m.id === id ? { ...m, ...p } : m)), `material.${id}.${field}`);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const added: CourseMaterial[] = [];
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.set('file', file);
        const res = await fetch(`/api/courses/${courseId}/materials`, { method: 'POST', body });
        const json = (await res.json().catch(() => ({}))) as Uploaded & { error?: { message?: string } };
        if (!res.ok) throw new Error(json.error?.message ?? `Não foi possível enviar ${file.name}.`);
        const title = file.name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[-_]+/g, ' ').trim() || 'Material';
        added.push({ id: '', title, description: '', category: json.format === 'image' ? 'infografico' : 'outro', assetId: json.assetId, format: json.format, sizeBytes: json.sizeBytes });
      }
      setMaterials((list) => {
        const taken = new Set(list.map((m) => m.id));
        const withIds = added.map((m) => {
          const id = slugify(m.title, taken);
          taken.add(id);
          return { ...m, id };
        });
        return [...list, ...withIds];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no envio.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function addLink() {
    const url = linkUrl.trim();
    if (!/^https:\/\/\S+\.\S+/.test(url)) {
      setError('O link precisa começar com https://');
      return;
    }
    setError(null);
    setMaterials((list) => {
      const taken = new Set(list.map((m) => m.id));
      const title = new URL(url).hostname.replace(/^www\./, '');
      return [...list, { id: slugify(title, taken), title, description: '', category: 'outro', url, format: 'link' }];
    });
    setLinkUrl('');
  }

  const moduleTitle = (id?: string) => (id ? (doc.modules.find((m) => m.id === id)?.title ?? 'Módulo removido') : 'Curso inteiro');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SaveStatus />
        <Button variant="secondary" size="sm" onClick={undo} disabled={!canUndo} aria-label="Desfazer última alteração">
          <Undo2 className="size-4" aria-hidden="true" /> Desfazer
        </Button>
      </div>

      <Card className="space-y-5">
        <div>
          <h2 className="text-2xl">Materiais de apoio</h2>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            Resumos, checklists, modelos para preencher, infográficos e exemplos para a aluna baixar. Ela vê todos na página do curso e, dentro de cada aula, os do módulo daquela aula. Mudanças valem para a aluna depois de publicar.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" multiple className="sr-only" id="material-file" onChange={(e) => onFiles(e.target.files)} />
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="size-4" aria-hidden="true" /> {busy ? 'Enviando…' : 'Enviar PDF ou imagem'}
          </Button>
          <div className="flex min-w-0 flex-1 items-end gap-2">
            <Field label="Ou adicione um link" htmlFor="material-link">
              <Input id="material-link" type="url" inputMode="url" placeholder="https://" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
            </Field>
            <Button variant="secondary" onClick={addLink} disabled={!linkUrl.trim()}>
              Adicionar link
            </Button>
          </div>
        </div>
        <p className="text-xs text-fg-faint">PDF, PNG ou JPEG, até 25 MB cada.</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </Card>

      {materials.length === 0 ? (
        <Card>
          <p className="text-fg-muted">Nenhum material ainda. Envie um PDF ou imagem acima para começar.</p>
        </Card>
      ) : (
        <ol className="space-y-4" aria-label="Materiais do curso">
          {materials.map((m, i) => {
            const Icon = FORMAT_ICON[m.format];
            return (
              <li key={m.id}>
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-fg-muted">
                      <Icon className="size-4" aria-hidden="true" />
                      <Badge>{FORMAT_LABEL[m.format]}</Badge>
                      {m.sizeBytes ? <span>{formatBytes(m.sizeBytes)}</span> : null}
                      <span aria-hidden="true">·</span>
                      <span>{moduleTitle(m.moduleId)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <a href={materialHref(m)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm text-fg-muted hover:text-fg hover:underline">
                        Abrir <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                      <Button variant="ghost" size="icon" aria-label={`Subir ${m.title}`} disabled={i === 0} onClick={() => setMaterials((list) => moveItem(list, i, i - 1))}>
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Descer ${m.title}`} disabled={i === materials.length - 1} onClick={() => setMaterials((list) => moveItem(list, i, i + 1))}>
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Remover ${m.title}`} onClick={() => setMaterials((list) => list.filter((x) => x.id !== m.id))}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <Field label="Título" htmlFor={`mat-title-${m.id}`}>
                      <Input id={`mat-title-${m.id}`} value={m.title} maxLength={120} onChange={(e) => patch(m.id, { title: e.target.value }, 'title')} />
                    </Field>
                    <Field label="Tipo" htmlFor={`mat-cat-${m.id}`}>
                      <Select id={`mat-cat-${m.id}`} value={m.category} onChange={(e) => patch(m.id, { category: e.target.value as MaterialCategory }, 'category')}>
                        {MATERIAL_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {MATERIAL_CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Módulo" htmlFor={`mat-mod-${m.id}`}>
                      <Select id={`mat-mod-${m.id}`} value={m.moduleId ?? ''} onChange={(e) => patch(m.id, { moduleId: e.target.value || undefined }, 'module')}>
                        <option value="">Curso inteiro</option>
                        {doc.modules.map((mod, mi) => (
                          <option key={mod.id} value={mod.id}>
                            {mi + 1}. {mod.title}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Descrição para a aluna" htmlFor={`mat-desc-${m.id}`} hint="Uma frase: o que é e quando usar.">
                    <Textarea id={`mat-desc-${m.id}`} rows={2} maxLength={300} value={m.description} onChange={(e) => patch(m.id, { description: e.target.value }, 'description')} />
                  </Field>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
