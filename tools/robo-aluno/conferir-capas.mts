// Confere (só leitura) que os 26 cursos publicados e as 4 trilhas em série resolvem para uma arte da vitrine
// (apps/web/src/app/(lms)/aprender/_lib/course-art.ts), que o instrutor da arte é o do curso no banco e que o arquivo existe.
//
// set -a; . ./.env; set +a; packages/db/node_modules/.bin/tsx tools/robo-aluno/conferir-capas.mts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TRAIL_SERIES, trailSlug } from '../../packages/course-schema/src/trails';
import { COURSE_ART, TRAIL_ART, HERO_ART } from '../../apps/web/src/app/(lms)/aprender/_lib/course-art';
import { sql } from './dados.mjs';

const PUBLIC = resolve(import.meta.dirname, '../../apps/web/public');
const rows = sql(`select c.slug || '|' || c.title || '|' || coalesce(c.trail,'') || '|' || coalesce(v.document->'branding'->>'presenterName', v.document->'presentation'->>'avatarName', '') from courses c join lateral (select * from course_versions where course_id = c.id order by version_number desc limit 1) v on true where c.status = 'published' order by c.trail, c.title`)
  .split('\n')
  .map((l: string) => l.split('|') as [string, string, string, string]);
let falhas = 0;
const ok = (c: boolean, msg: string) => {
  if (!c) falhas++;
  console.log(`${c ? 'ok   ' : 'FALHA'} ${msg}`);
};
ok(rows.length === 26, `${rows.length} cursos publicados`);
for (const [slug, title, trail, presenter] of rows) {
  const a = COURSE_ART[slug];
  ok(!!a && existsSync(resolve(PUBLIC, `.${a.src}`)) && a.instructor === presenter, `${a?.code ?? '???'} ${slug} (${title} · ${trail}) → ${a?.src ?? 'SEM ARTE'} · ${presenter}`);
}
const mapa = new Set(rows.map((r) => r[0]));
for (const slug of Object.keys(COURSE_ART)) ok(mapa.has(slug), `slug do mapa existe no banco: ${slug}`);
for (const s of TRAIL_SERIES) {
  const key = trailSlug(s.trail);
  const t = TRAIL_ART[key];
  ok(!!t && existsSync(resolve(PUBLIC, `.${t.src}`)) && s.courses.every((slug) => COURSE_ART[slug]?.instructor === t.instructor && mapa.has(slug)), `trilha ${s.trail} → ${t?.code} ${t?.src} · ${t?.instructor} · partes ${s.courses.join(', ')}`);
}
for (const [slug, h] of Object.entries(HERO_ART)) ok(mapa.has(slug) && existsSync(resolve(PUBLIC, `.${h.src}`)), `destaque ${h.code} → ${slug}`);
console.log(falhas ? `${falhas} FALHA(S)` : 'tudo certo');
process.exit(falhas ? 1 : 0);
