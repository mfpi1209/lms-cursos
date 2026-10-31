import type { Readable } from 'node:stream';

export interface StoredObjectInfo {
  key: string;
  sizeBytes: number;
}

/** Contrato de storage. Implementações: `local` (dev / instância única) e `s3` (S3 ou compatível, produção). */
export interface StorageAdapter {
  readonly provider: string;
  putObject(key: string, body: Readable | Uint8Array, contentType: string): Promise<{ key: string }>;
  head(key: string): Promise<StoredObjectInfo | null>;
  getStream(key: string, range?: { start: number; end: number }): Readable;
  deleteObject(key: string): Promise<void>;
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
}

export type StorageProviderId = 'local' | 's3';

export interface S3EnvConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
}

function envFlag(v: string | undefined): boolean | undefined {
  if (v === undefined || v === '') return undefined;
  return v === '1' || v.toLowerCase() === 'true';
}

/** Resolve qual provider usar: `STORAGE_PROVIDER` explícito; senão `s3` se `S3_BUCKET` estiver definido; senão `local`. */
export function resolveStorageProvider(env: NodeJS.ProcessEnv = process.env): StorageProviderId {
  const raw = (env.STORAGE_PROVIDER ?? '').trim().toLowerCase();
  if (raw === '') return env.S3_BUCKET ? 's3' : 'local';
  if (raw === 'local' || raw === 's3') return raw;
  throw new Error(`STORAGE_PROVIDER="${env.STORAGE_PROVIDER}" não é suportado; use "local" ou "s3"`);
}

/**
 * Lê a configuração do S3 a partir das variáveis `S3_*`. Lança um erro em
 * português listando as variáveis obrigatórias ausentes (sem ecoar valores).
 */
export function s3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3EnvConfig {
  const required = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
  const missing = required.filter((k) => !env[k] || env[k]!.trim() === '');
  if (missing.length > 0) {
    throw new Error(`Storage S3 selecionado, mas faltam variáveis de ambiente obrigatórias: ${missing.join(', ')}. Defina-as (ver .env.example) ou use STORAGE_PROVIDER=local.`);
  }
  const endpoint = env.S3_ENDPOINT?.trim();
  if (endpoint && !/^https?:\/\//i.test(endpoint)) {
    throw new Error('S3_ENDPOINT deve ser uma URL completa com esquema (ex.: https://minio.interno:9000)');
  }
  const cfg: S3EnvConfig = {
    bucket: env.S3_BUCKET!.trim(),
    region: env.S3_REGION?.trim() || 'us-east-1',
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
  };
  if (endpoint) cfg.endpoint = endpoint;
  const pathStyle = envFlag(env.S3_FORCE_PATH_STYLE);
  if (pathStyle !== undefined) cfg.forcePathStyle = pathStyle;
  const prefix = env.S3_PREFIX?.trim();
  if (prefix) cfg.prefix = prefix;
  return cfg;
}

let cached: StorageAdapter | undefined;

export async function getStorage(): Promise<StorageAdapter> {
  if (cached) return cached;
  const provider = resolveStorageProvider();
  if (provider === 'local') {
    const { LocalStorageAdapter } = await import('./storage/local');
    cached = new LocalStorageAdapter(process.env.STORAGE_DIR ?? '.data/storage');
    return cached;
  }
  const { S3StorageAdapter } = await import('./storage/s3');
  cached = new S3StorageAdapter(s3ConfigFromEnv());
  return cached;
}
