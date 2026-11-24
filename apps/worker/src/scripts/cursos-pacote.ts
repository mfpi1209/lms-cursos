/** Formato do pacote de cursos (`cursos-exportar.ts` → `cursos-importar.ts`). */
export const COURSE_PACKAGE_VERSION = 1;

export interface CoursePackageCourse {
  id: string;
  slug: string;
  title: string;
  trail: string | null;
  posterAssetId: string | null;
  /** número da versão no ambiente de origem (só informativo) */
  versionNumber: number;
  /** documento da versão publicada mais recente na origem */
  document: unknown;
}

export interface CoursePackageAsset {
  id: string;
  kind: string;
  source: string;
  mimeType: string;
  sizeBytes: number;
  /** caminho do arquivo dentro de `files/` e chave no storage de destino */
  storageKey: string;
  originalName: string | null;
  sha256: string;
  durationSeconds: number | null;
  transcript: string | null;
  metadata: unknown;
}

export interface CoursePackageManifest {
  version: number;
  createdAt: string;
  courses: CoursePackageCourse[];
  assets: CoursePackageAsset[];
}

const ID_RE = /^(crs|ast)_[a-z0-9]+$/;
/** chave de storage segura: relativa, sem `..`, só caracteres comuns (o pacote vem de fora do ambiente) */
const KEY_RE = /^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]+$/;

/** Valida o manifesto lido de um arquivo (formato, ids e chaves) antes de qualquer gravação. */
export function parseManifest(raw: unknown): CoursePackageManifest {
  const m = raw as CoursePackageManifest;
  if (!m || typeof m !== 'object' || m.version !== COURSE_PACKAGE_VERSION) throw new Error(`pacote em formato desconhecido (esperado versão ${COURSE_PACKAGE_VERSION})`);
  if (!Array.isArray(m.courses) || !Array.isArray(m.assets)) throw new Error('pacote sem cursos ou mídias');
  for (const c of m.courses) {
    if (!ID_RE.test(c.id) || !c.id.startsWith('crs_')) throw new Error(`id de curso inválido: ${String(c.id)}`);
    if (typeof c.slug !== 'string' || !/^[a-z0-9-]{1,120}$/.test(c.slug)) throw new Error(`${c.id}: slug inválido`);
    if (!c.document || typeof c.document !== 'object') throw new Error(`${c.id}: sem documento`);
  }
  for (const a of m.assets) {
    if (!ID_RE.test(a.id) || !a.id.startsWith('ast_')) throw new Error(`id de mídia inválido: ${String(a.id)}`);
    if (typeof a.storageKey !== 'string' || !KEY_RE.test(a.storageKey)) throw new Error(`${a.id}: caminho de arquivo inválido`);
    if (typeof a.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(a.sha256)) throw new Error(`${a.id}: sha256 inválido`);
  }
  return m;
}
