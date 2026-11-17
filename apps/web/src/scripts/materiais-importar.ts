/**
 * Liga os materiais de apoio prontos (`docs/materiais/<slug>/_saida/`, gerados por `materiais-gerar.ts`) ao rascunho
 * do curso: envia cada arquivo como asset (PDF marcado com o curso; imagem comum) e grava `materials` no documento.
 * Materiais do manifesto substituem os de mesmo id; os adicionados à mão no estúdio (outros ids) ficam, depois.
 * `modulo: N` vira o N-ésimo módulo do rascunho. Sem custo. Para a aluna ver, publique depois (publicar-e-matricular).
 *
 * Uso (a partir de apps/web, com o .env da raiz carregado):
 *   tsx src/scripts/materiais-importar.ts c4-dinheiro-no-controle            # a seco: mostra o que faria
 *   tsx src/scripts/materiais-importar.ts --todos --gravar                   # grava em todos os cursos com manifesto
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { getDb, authoring } from '@lms/db';
import type { CourseMaterial } from '@lms/course-schema';
import { storeMaterialFile } from '@/server/materials';
import { outputPath, readManifest } from './materiais-gerar';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '../../../../docs/materiais');

async function main() {
  const args = process.argv.slice(2);
  const gravar = args.includes('--gravar');
  const slugs = args.includes('--todos') ? readdirSync(ROOT).filter((d) => !d.startsWith('_') && existsSync(join(ROOT, d, 'materiais.json'))) : args.filter((a) => !a.startsWith('--'));
  if (!slugs.length) throw new Error('informe o slug do curso ou --todos');
  const db = getDb();
  for (const slug of slugs) {
    const man = readManifest(slug);
    const course = await authoring.getCourse(db, man.curso);
    const draft = await authoring.getDraft(db, man.curso);
    if (!course || !draft) throw new Error(`${slug}: curso ${man.curso} não encontrado`);
    const doc = draft.document;
    const items: CourseMaterial[] = [];
    for (const it of man.materiais) {
      const file = outputPath(slug, it);
      if (!existsSync(file)) throw new Error(`${slug}: falta ${basename(file)}; rode materiais-gerar.ts antes`);
      const mod = it.modulo ? doc.modules[it.modulo - 1] : undefined;
      if (it.modulo && !mod) throw new Error(`${slug}/${it.id}: o rascunho não tem módulo ${it.modulo}`);
      const base = { id: it.id, title: it.titulo, description: it.descricao, category: it.categoria, ...(mod ? { moduleId: mod.id } : {}) };
      if (!gravar) {
        console.log(`  [seco] ${it.id} · ${it.categoria} · ${mod ? `módulo ${it.modulo} (${mod.title})` : 'curso inteiro'} · ${basename(file)}`);
        continue;
      }
      const stored = await storeMaterialFile(db, { workspaceId: course.workspaceId, courseId: course.id, userId: course.createdBy, bytes: new Uint8Array(readFileSync(file)), fileName: `${it.id}.${it.formato}` });
      items.push({ ...base, assetId: stored.assetId, format: stored.format, sizeBytes: stored.sizeBytes });
    }
    if (!gravar) {
      console.log(`[materiais] ${slug}: ${man.materiais.length} materiais (a seco; use --gravar)`);
      continue;
    }
    const ids = new Set(items.map((m) => m.id));
    const kept = (doc.materials ?? []).filter((m) => !ids.has(m.id));
    const r = await authoring.saveDraft(db, { courseId: course.id, document: { ...doc, materials: [...items, ...kept] }, expectedRevision: draft.revision, userId: course.createdBy, origin: 'script', note: `materiais de apoio: ${items.length} do manifesto` });
    console.log(`[materiais] ${slug}: ${items.length} materiais gravados${kept.length ? ` (+${kept.length} do estúdio mantidos)` : ''}; rascunho rev ${r.revision}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
