/**
 * Cenário "Recepção DNA Work" nos cursos "Pode entrar" (crs_7vbrb49jkq23ibiw) e
 * "Pode entrar Light" (crs_vcbnqk4vgfcyp95v):
 *  1. envia as duas fotos aprovadas como imagens do workspace marcadas como
 *     CENÁRIO (`assets.metadata.scenery`, com enquadramento e posição sugeridos):
 *     - "Cenário · Recepção DNA Work" (com balcão): imagem inteira, apresentadora
 *       em x = 0,375, 82% da altura, base na linha do tampo (0,85) e faixa do
 *       balcão a partir de 0,85 por cima dela; sem desfoque extra;
 *     - "Cenário · Recepção DNA Work (sem balcão)" (v2): plano médio sem piso
 *       (janela 1529×860 em 250,0 → {x: 250/1920, y: 0, w: 1529/1920, h: 860/1080}),
 *       x = 0,34, escala 1,0, folga de 6% acima da cabeça, cor "quente"; sem desfoque.
 *     Idempotente por sha256 (reenvio só atualiza os metadados).
 *  2. aplica ao RASCUNHO dos dois cursos o cenário COM balcão: `presentation.background`
 *     = o asset, `presenterX = 0,375`, `presenterScale = 0,82`, `presenterBottom = 0,85`,
 *     `background.foregroundFrom = 0,85`, `background.blur = false`. Preserva câmeras
 *     (`cam_principal`, `cam_sentada` em tela cheia) e tudo o mais. Compila (0 erros) e
 *     grava com `authoring.saveDraft` (nova revisão). NÃO publica.
 *
 * Nenhum provedor é chamado. Nada é gerado de vídeo aqui: depois, no estúdio,
 * "Trocar fundo (sem custo)" remonta as falas já pagas sobre o cenário.
 *
 * Uso (na raiz do monorepo, com DATABASE_URL no ambiente):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/pode-entrar-cenario-recepcao.ts [--dry-run] [--only=pode-entrar|light] [--skip-upload]
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { compileCourse, type CourseDocument } from '@lms/course-schema';
import { createDb, type Database } from '../client';
import * as s from '../schema';
import type { SceneryMetadata } from '../schema/media';
import { getDraft, saveDraft } from '../repositories/authoring';
import { createAsset } from '../repositories/media';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_UPLOAD = process.argv.includes('--skip-upload');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? 'wsp_eogwtp01f358wyof';
const TARGETS = [
  { key: 'pode-entrar', courseId: process.env.COURSE_ID ?? 'crs_7vbrb49jkq23ibiw' },
  { key: 'light', courseId: process.env.LIGHT_COURSE_ID ?? 'crs_vcbnqk4vgfcyp95v' },
] as const;

/** Cenários aprovados (arquivo, nome e preset). */
export const SCENERIES: Array<{ key: 'desk' | 'nodesk'; file: string; name: string; scenery: SceneryMetadata }> = [
  {
    key: 'desk',
    file: 'docs/brand/cenario/recepcao-dnawork-1920.png',
    name: 'Cenário · Recepção DNA Work',
    scenery: { name: 'Recepção DNA Work', presenterX: 0.375, presenterScale: 0.82, presenterBottom: 0.85, foregroundFrom: 0.85, blur: false, framePreset: 'wide' },
  },
  {
    key: 'nodesk',
    file: 'docs/brand/cenario/recepcao-dnawork-sem-balcao-v2-1920.png',
    name: 'Cenário · Recepção DNA Work (sem balcão)',
    scenery: {
      name: 'Recepção DNA Work (sem balcão)',
      frame: { x: 250 / 1920, y: 0, w: 1529 / 1920, h: 860 / 1080 },
      presenterX: 0.34, presenterScale: 1, headroom: 0.06, presenterGrade: 'warm', blur: false, framePreset: 'medium',
    },
  },
];

/** Apresentação com o cenário com balcão aplicado (função pura; preserva câmeras e o resto). */
export function applyDeskScenery(doc: CourseDocument, assetId: string): { doc: CourseDocument; changes: string[] } {
  const desk = SCENERIES[0]!.scenery;
  const next = structuredClone(doc);
  const p = next.presentation;
  const changes: string[] = [];
  const set = <K extends keyof CourseDocument['presentation']>(k: K, v: CourseDocument['presentation'][K]) => {
    if (JSON.stringify(p[k]) !== JSON.stringify(v)) {
      changes.push(`presentation.${k}: ${JSON.stringify(p[k] ?? null)} → ${JSON.stringify(v)}`);
      p[k] = v;
    }
  };
  set('background', { type: 'image', assetId, name: SCENERIES[0]!.name.slice(0, 60), foregroundFrom: desk.foregroundFrom, blur: false });
  if ((p.presenterPlacement ?? 'center') === 'center') set('presenterPlacement', 'right');
  set('presenterX', desk.presenterX);
  set('presenterScale', desk.presenterScale!);
  set('presenterBottom', desk.presenterBottom);
  if (p.presenterHeadroom !== undefined) {
    changes.push(`presentation.presenterHeadroom: ${p.presenterHeadroom} → (removido)`);
    delete p.presenterHeadroom;
  }
  return { doc: next, changes };
}

async function uploadScenery(db: Database, item: (typeof SCENERIES)[number], createdBy: string): Promise<string> {
  const bytes = new Uint8Array(await readFile(path.join(ROOT, item.file)));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const [existing] = await db.select().from(s.assets).where(and(eq(s.assets.workspaceId, WORKSPACE_ID), eq(s.assets.sha256, sha256))).limit(1);
  if (existing) {
    const same = JSON.stringify(existing.metadata?.scenery ?? null) === JSON.stringify(item.scenery) && existing.originalName === item.name;
    console.log(`[cenário] ${item.name}: já existe (${existing.id})${same ? '' : DRY_RUN ? ' — metadados seriam atualizados' : ' — metadados atualizados'}`);
    if (!same && !DRY_RUN) await db.update(s.assets).set({ metadata: { ...(existing.metadata ?? {}), scenery: item.scenery }, originalName: item.name }).where(eq(s.assets.id, existing.id));
    return existing.id;
  }
  if (DRY_RUN) {
    console.log(`[cenário] ${item.name}: seria enviado (${bytes.byteLength} bytes, ${item.file})`);
    return `(novo: ${item.key})`;
  }
  // storage local (dev): a mesma chave/caminho do LocalStorageAdapter (`STORAGE_DIR`/chave); em S3, use o upload pelo estúdio
  const provider = (process.env.STORAGE_PROVIDER ?? (process.env.S3_BUCKET ? 's3' : 'local')).trim().toLowerCase();
  if (provider !== 'local') throw new Error(`este script só grava no storage local (STORAGE_PROVIDER=${provider}); envie as imagens pelo estúdio e rode com --skip-upload`);
  const key = `${WORKSPACE_ID}/image/${sha256.slice(0, 2)}/${sha256}.png`;
  const full = path.resolve(process.env.STORAGE_DIR ?? '.data/storage', key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  const asset = await createAsset(db, { workspaceId: WORKSPACE_ID, kind: 'image', source: 'upload', mimeType: 'image/png', sizeBytes: bytes.byteLength, storageProvider: 'local', storageKey: key, originalName: item.name, sha256, createdBy });
  await db.update(s.assets).set({ metadata: { scenery: item.scenery } }).where(eq(s.assets.id, asset.id));
  console.log(`[cenário] ${item.name}: enviado → ${asset.id}`);
  return asset.id;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const { db, close } = createDb(url, { max: 2 });
  try {
    const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
    if (!author) throw new Error('autor@demo.local não encontrado');
    const ids: Record<string, string> = {};
    if (!SKIP_UPLOAD) for (const item of SCENERIES) ids[item.key] = await uploadScenery(db, item, author.id);
    else {
      for (const item of SCENERIES) {
        const [row] = await db.select({ id: s.assets.id }).from(s.assets).where(and(eq(s.assets.workspaceId, WORKSPACE_ID), eq(s.assets.originalName, item.name))).limit(1);
        if (!row) throw new Error(`asset "${item.name}" não encontrado (rode sem --skip-upload)`);
        ids[item.key] = row.id;
      }
    }
    const deskId = ids.desk!;
    for (const t of TARGETS) {
      if (ONLY && ONLY !== t.key) continue;
      const draft = await getDraft(db, t.courseId);
      if (!draft) throw new Error(`rascunho de ${t.courseId} não encontrado`);
      const { doc, changes } = applyDeskScenery(draft.document, deskId);
      if (!changes.length) {
        console.log(`[${t.key}] sem mudanças (revisão ${draft.revision})`);
        continue;
      }
      const compiled = compileCourse(doc);
      console.log(`[${t.key}] ${changes.length} mudança(s) na revisão ${draft.revision}:\n  - ${changes.join('\n  - ')}`);
      console.log(`[${t.key}] compilação: ${compiled.errors.length} erro(s), ${compiled.warnings.length} aviso(s)${compiled.warnings.filter((w) => w.code.includes('DESK') || w.code.includes('FOREGROUND') || w.code.includes('FRAME')).map((w) => `\n  ! ${w.code}: ${w.message}`).join('')}`);
      if (compiled.errors.length) throw new Error(`[${t.key}] compilação com erros: ${compiled.errors.map((e) => e.code).join(', ')}`);
      if (DRY_RUN) {
        console.log(`[${t.key}] --dry-run: nada gravado`);
        continue;
      }
      const saved = await saveDraft(db, { courseId: t.courseId, document: doc, expectedRevision: draft.revision, userId: author.id, origin: 'script' });
      console.log(`[${t.key}] rascunho gravado: revisão ${saved.revision} (não publicado)`);
    }
  } finally {
    await close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
