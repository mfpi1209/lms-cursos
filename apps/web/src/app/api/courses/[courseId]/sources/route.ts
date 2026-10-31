import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getDb, sources, media, DomainError } from '@lms/db';
import { getStorage } from '@lms/media';
import { parseBody, route } from '@/server/http';
import { requireEditor, requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

export const runtime = 'nodejs';
const MAX_BYTES = 20 * 1024 * 1024;

export async function GET(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    return { sources: (await sources.listSourcesForCourse(getDb(), courseId)).map(sources.publicSource) };
  });
}

const PasteSchema = z.object({ title: z.string().trim().min(1).max(160), text: z.string().min(20).max(500_000), declaredOrigin: z.string().max(300).optional() });

/**
 * Fontes: texto colado (processado na hora) ou upload de PDF/TXT/MD (arquivo
 * guardado como asset; extração no worker). PDF digitalizado vira `needs_ocr`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const db = getDb();
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await parseBody(req, PasteSchema);
      const text = body.text.replace(/\r\n/g, '\n').trim();
      const row = await sources.createSource(db, {
        workspaceId: viewer.workspace.id, courseId, title: body.title, kind: 'paste', status: 'ready', text, chars: text.length, excerpt: text.slice(0, 300), declaredOrigin: body.declaredOrigin ?? null, sha256: createHash('sha256').update(text).digest('hex'), createdBy: viewer.user.id, processedAt: new Date(),
      });
      await sources.replaceChunks(db, row.id, sources.chunkText(text));
      return { source: sources.publicSource(row) };
    }
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + 1024 * 1024) throw new DomainError('VALIDATION', 'Arquivo acima de 20 MB');
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw new DomainError('VALIDATION', 'Envie um arquivo no campo "file" ou um JSON {title, text}');
    if (file.size > MAX_BYTES) throw new DomainError('VALIDATION', 'Arquivo acima de 20 MB');
    const name = file.name.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const title = (typeof form?.get('title') === 'string' && String(form!.get('title')).trim()) || file.name.replace(/\.[^.]+$/, '').slice(0, 160);
    const isPdf = name.endsWith('.pdf') && String.fromCharCode(...bytes.subarray(0, 4)) === '%PDF';
    if (isPdf) {
      const storage = await getStorage();
      const key = `${viewer.workspace.id}/sources/${sha256.slice(0, 2)}/${sha256}.pdf`;
      await storage.putObject(key, bytes, 'application/pdf');
      const asset = await media.createAsset(db, { workspaceId: viewer.workspace.id, kind: 'document', source: 'upload', mimeType: 'application/pdf', sizeBytes: bytes.byteLength, storageProvider: storage.provider, storageKey: key, originalName: file.name.slice(0, 200), sha256, createdBy: viewer.user.id });
      const row = await sources.createSource(db, { workspaceId: viewer.workspace.id, courseId, title, kind: 'pdf', status: 'processing', assetId: asset.id, originalName: file.name.slice(0, 200), sha256, createdBy: viewer.user.id });
      return { source: sources.publicSource(row) };
    }
    if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown')) {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\r\n/g, '\n').trim();
      if (text.length < 20) throw new DomainError('VALIDATION', 'O arquivo não tem texto suficiente');
      const kind = name.endsWith('.txt') ? 'txt' : 'md';
      const row = await sources.createSource(db, { workspaceId: viewer.workspace.id, courseId, title, kind, status: 'ready', text, chars: text.length, excerpt: text.slice(0, 300), originalName: file.name.slice(0, 200), sha256, createdBy: viewer.user.id, processedAt: new Date() });
      await sources.replaceChunks(db, row.id, sources.chunkText(text));
      return { source: sources.publicSource(row) };
    }
    throw new DomainError('VALIDATION', 'Formato não suportado. Envie PDF, TXT ou Markdown.');
  });
}
