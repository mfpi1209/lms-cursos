import { z } from 'zod';

/**
 * Materiais de apoio do curso (PDF, imagem, link): resumos, checklists, modelos para preencher, infográficos,
 * exemplos e atalhos. Ficam no documento do curso e entram na versão publicada como o resto. A aluna vê todos na
 * página do curso (agrupados por módulo) e, dentro de uma aula, os do módulo daquela aula.
 *
 * Arquivo: `assetId` de um asset do workspace (PDF = `document` com `metadata.courseMaterial`; imagem = `image`).
 * Link: `url` https externo. Exatamente um dos dois.
 */
export const MATERIAL_CATEGORIES = ['resumo', 'checklist', 'modelo', 'infografico', 'exemplos', 'atalhos', 'outro'] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const MATERIAL_CATEGORY_LABEL: Record<MaterialCategory, string> = {
  resumo: 'Resumo',
  checklist: 'Checklist',
  modelo: 'Modelo para preencher',
  infografico: 'Infográfico',
  exemplos: 'Exemplos',
  atalhos: 'Atalhos e truques',
  outro: 'Material',
};

export const CourseMaterialSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id em minúsculas e hífens').max(64),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(300).default(''),
    category: z.enum(MATERIAL_CATEGORIES).default('outro'),
    /** módulo a que pertence (ausente = do curso inteiro) */
    moduleId: z.string().max(64).optional(),
    assetId: z.string().max(64).optional(),
    url: z.string().url().max(500).regex(/^https:\/\//, 'link precisa começar com https://').optional(),
    /** formato exibido (ícone e rótulo); vem do arquivo enviado */
    format: z.enum(['pdf', 'image', 'link']),
    /** tamanho do arquivo, para mostrar antes do download */
    sizeBytes: z.number().int().nonnegative().optional(),
  })
  .refine((m) => !!m.assetId !== !!m.url, { message: 'material precisa de um arquivo OU de um link' })
  .refine((m) => (m.format === 'link') === !!m.url, { message: 'formato "link" só com url' });
export type CourseMaterial = z.infer<typeof CourseMaterialSchema>;

export const CourseMaterialsSchema = z
  .array(CourseMaterialSchema)
  .max(60)
  .default([])
  .refine((list) => new Set(list.map((m) => m.id)).size === list.length, { message: 'id de material repetido' });

/** Materiais de um módulo (para a aula) e os do curso inteiro, na ordem do documento. */
export function materialsForModule(materials: readonly CourseMaterial[], moduleId: string): CourseMaterial[] {
  return materials.filter((m) => m.moduleId === moduleId);
}

/** URL de leitura/download do material na plataforma (arquivo) ou o link externo. */
export function materialHref(m: Pick<CourseMaterial, 'assetId' | 'url'>, opts: { download?: boolean } = {}): string {
  if (m.url) return m.url;
  return `/api/assets/${m.assetId}${opts.download ? '?download=1' : ''}`;
}

export function formatBytes(n: number | undefined): string {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
