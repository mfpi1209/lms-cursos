import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { StorageAdapter, StoredObjectInfo } from '../storage';

/**
 * Storage local em disco (desenvolvimento / instância única). Chaves são
 * caminhos relativos saneados dentro de `rootDir`; nunca aceita `..`.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly provider = 'local';
  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    const full = path.resolve(this.rootDir, safe);
    if (!full.startsWith(path.resolve(this.rootDir) + path.sep)) throw new Error('chave de storage inválida');
    return full;
  }

  async putObject(key: string, body: Readable | Uint8Array, _contentType: string): Promise<{ key: string }> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(full);
      out.on('finish', () => resolve());
      out.on('error', reject);
      if (body instanceof Readable) body.pipe(out);
      else out.end(body);
    });
    return { key };
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const st = await stat(this.resolve(key));
      return { key, sizeBytes: st.size };
    } catch {
      return null;
    }
  }

  getStream(key: string, range?: { start: number; end: number }): Readable {
    return createReadStream(this.resolve(key), range ? { start: range.start, end: range.end } : undefined);
  }

  async deleteObject(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => {});
  }

  async getSignedUrl(): Promise<string> {
    throw new Error('LocalStorageAdapter não gera URLs assinadas; sirva via /api/assets/[id]');
  }
}
