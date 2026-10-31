import { PDFParse } from 'pdf-parse';
import { getDb, media, sources } from '@lms/db';
import { getStorage } from '@lms/media';

/** Extrai texto de PDF textual. PDF digitalizado (quase sem texto) => needs_ocr, sem simular extração. */
export async function ingestSource(sourceId: string) {
  const db = getDb();
  const src = await sources.getSource(db, sourceId);
  if (!src || src.status !== 'processing') return;
  try {
    if (src.kind !== 'pdf' || !src.assetId) throw new Error('fonte sem arquivo para processar');
    const asset = await media.getAsset(db, src.assetId);
    if (!asset) throw new Error('asset não encontrado');
    const storage = await getStorage();
    const chunks: Buffer[] = [];
    for await (const c of storage.getStream(asset.storageKey)) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
    try {
      const result = await parser.getText();
      const pages = result.pages.map((p, i) => ({ page: i + 1, text: (p.text ?? '').replace(/\r\n/g, '\n').trim() }));
      const text = pages.map((p) => p.text).join('\n\n').trim();
      const total = result.total || pages.length;
      if (text.length < 50 * Math.max(1, total)) {
        await sources.updateSource(db, sourceId, { status: 'needs_ocr', pages: total, chars: text.length, processedAt: new Date(), error: 'PDF com pouco ou nenhum texto extraível (provavelmente digitalizado). Requer OCR.' });
        return;
      }
      const chunkRows: Array<{ index: number; text: string; page?: number }> = [];
      for (const p of pages) for (const c of sources.chunkText(p.text)) chunkRows.push({ index: chunkRows.length, text: c.text, page: p.page });
      await sources.updateSource(db, sourceId, { status: 'ready', text, chars: text.length, pages: total, excerpt: text.slice(0, 300), processedAt: new Date(), error: null });
      await sources.replaceChunks(db, sourceId, chunkRows);
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch (e) {
    await sources.updateSource(db, sourceId, { status: 'failed', processedAt: new Date(), error: String(e instanceof Error ? e.message : e).slice(0, 500) });
  }
}
