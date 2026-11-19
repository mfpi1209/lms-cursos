/**
 * Gera os arquivos prontos (PDF A4 / PNG 1080 px) dos materiais de apoio a partir das fontes HTML de
 * `docs/materiais/<slug>/` (ver `docs/materiais/_kit/README.md`). Só local: Chromium do Playwright, nada pago.
 *
 * Uso (a partir de apps/web):
 *   tsx src/scripts/materiais-gerar.ts c4-dinheiro-no-controle          # um curso
 *   tsx src/scripts/materiais-gerar.ts --todos                          # todas as pastas com materiais.json
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { z } from 'zod';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '../../../../docs/materiais');

export const MaterialManifestSchema = z.object({
  curso: z.string().min(1),
  titulo: z.string().min(1),
  materiais: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        titulo: z.string().min(1).max(120),
        descricao: z.string().min(1).max(300),
        categoria: z.enum(['resumo', 'checklist', 'modelo', 'infografico', 'exemplos', 'atalhos']),
        modulo: z.number().int().positive().optional(),
        fonte: z.string().endsWith('.html'),
        formato: z.enum(['pdf', 'png']),
      }),
    )
    .min(1),
});
export type MaterialManifest = z.infer<typeof MaterialManifestSchema>;

export function readManifest(slug: string): MaterialManifest {
  const raw = JSON.parse(readFileSync(join(ROOT, slug, 'materiais.json'), 'utf8'));
  const m = MaterialManifestSchema.parse(raw);
  const ids = new Set<string>();
  for (const it of m.materiais) {
    if (ids.has(it.id)) throw new Error(`${slug}: id repetido "${it.id}"`);
    ids.add(it.id);
    if (!existsSync(join(ROOT, slug, it.fonte))) throw new Error(`${slug}: fonte ausente ${it.fonte}`);
  }
  return m;
}

export function outputPath(slug: string, it: MaterialManifest['materiais'][number]) {
  return join(ROOT, slug, '_saida', `${it.id}.${it.formato}`);
}

async function main() {
  const args = process.argv.slice(2);
  const slugs = args.includes('--todos')
    ? readdirSync(ROOT).filter((d) => !d.startsWith('_') && existsSync(join(ROOT, d, 'materiais.json')))
    : args;
  if (!slugs.length) throw new Error('informe o slug do curso ou --todos');
  const browser = await chromium.launch();
  try {
    for (const slug of slugs) {
      const m = readManifest(slug);
      mkdirSync(join(ROOT, slug, '_saida'), { recursive: true });
      for (const it of m.materiais) {
        const page = await browser.newPage(it.formato === 'png' ? { viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 } : {});
        await page.goto(pathToFileURL(join(ROOT, slug, it.fonte)).href, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const out = outputPath(slug, it);
        if (it.formato === 'pdf') {
          await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
          const pages = (readFileSync(out).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
          console.log(`[materiais] ${slug}/${it.id}.pdf · ${pages} pág.${pages > 4 ? '  ⚠ mais de 4 páginas' : ''}`);
        } else {
          await page.screenshot({ path: out, fullPage: true });
          const h = await page.evaluate(() => document.documentElement.scrollHeight);
          console.log(`[materiais] ${slug}/${it.id}.png · 1080×${h}${h > 2400 ? '  ⚠ muito alto para celular' : ''}`);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('materiais-gerar.ts')) {
  main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
