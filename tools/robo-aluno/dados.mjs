// Leitura (só leitura) do banco: cursos publicados, matrícula da aluna de teste, documento da versão da matrícula e
// arquivos dos vídeos (`assets.storage_key` em `.data/storage`). O DATABASE_URL vem do `.env` e nunca é impresso.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// numeração da casa (C01…C14 os atuais, a mesma dos relatórios de QA anteriores; C15…C26 os novos)
export const CURSOS = [
  'crs_99hpdsc8w88osiuh', 'crs_arbeohlw3xp5v3zx', 'crs_hd4jnnpx3oj0xf14', 'crs_4z17p0m6d43qxmmo', 'crs_4tj8a3q3g9gudgb7',
  'crs_b8zeh4b2gguseghq', 'crs_bmf11akamtxoti28', 'crs_8g0csi2hflfztfge', 'crs_gjn468p3y6hwua4f', 'crs_q52zsimeeahpa9bq',
  'crs_u4nfw88a4n2n0ubv', 'crs_5vccpfypr6fmxojb', 'crs_gujuaiykqcsl2n31', 'crs_hvvgkvtd1rb2um0l',
  // C15…C26: os 12 cursos novos (docs/novos-cursos/instrutores-gerados.md), na ordem da tabela de instrutores
  'crs_t303ykqfmhj3yb1g', 'crs_2rt2rsoii8bpydp2', 'crs_5k5upah2xphlfvi5', // Mauro · Respeito e diálogo
  'crs_tg9iqz8wmmf5pw77', 'crs_au1463izc386by27', 'crs_m60hsx8on6ebcyqg', // Laís · Tecnologia com critério
  'crs_4jh683s5h351z2db', 'crs_njtlqq7y7fyfeqcr', 'crs_gl0hjkmqfgnnur9y', // Vinícius · Autonomia no trabalho
  'crs_dp9s7pdro9j6e3m0', 'crs_0ua5onij460lpzs0', 'crs_d5rsi8gt36rv0qbq', // Flávia · Pensar e resolver
];
export const ATUAIS = CURSOS.slice(0, 14).map((_, i) => codigo(i));
export const NOVOS = CURSOS.slice(14).map((_, i) => codigo(i + 14));
function codigo(i) {
  return `C${String(i + 1).padStart(2, '0')}`;
}

/**
 * Seleção de cursos/aulas: "atuais" (C01…C14), "novos" (C15…C26), "todos", ou lista "C06:3,C15,C16-C18".
 * Devolve Map código -> null (todas as aulas) | número[] (só essas aulas).
 */
export function alvo(spec = 'atuais') {
  const m = new Map();
  const add = (c, aulas) => {
    if (!m.has(c) || m.get(c) === null || aulas === null) m.set(c, aulas === null ? null : [...new Set([...(m.get(c) || []), ...aulas])]);
  };
  for (const parte of spec.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (parte === 'atuais') ATUAIS.forEach((c) => add(c, null));
    else if (parte === 'novos') NOVOS.forEach((c) => add(c, null));
    else if (parte === 'todos') [...ATUAIS, ...NOVOS].forEach((c) => add(c, null));
    else {
      const [cod, aulas] = parte.split(':');
      const faixa = cod.match(/^C(\d+)-C(\d+)$/);
      const cods = faixa ? Array.from({ length: +faixa[2] - +faixa[1] + 1 }, (_, i) => codigo(+faixa[1] - 1 + i)) : [cod];
      for (const c of cods) add(c, aulas ? aulas.split('+').map(Number) : null);
    }
  }
  return m;
}

function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(resolve(RAIZ, '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  if (!m) throw new Error('DATABASE_URL ausente no .env');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

export function sql(q) {
  return execFileSync('psql', [dbUrl(), '-At', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * Cursos na ordem C01…C26, com a matrícula da aluna (ou null) e o documento da versão da matrícula. Curso sem versão
 * publicada vem com `publicado: false` e sem aulas (o robô o lista como não coberto).
 */
export function carregarCursos(email = 'aluna@demo.local', codigos = null) {
  const rows = JSON.parse(
    sql(`select coalesce(json_agg(x), '[]') from (
      select c.id, c.title, c.status, e.id as enr, e.course_version_id as ver,
        (select v.id from course_versions v where v.course_id = c.id order by v.version_number desc limit 1) as ultima
      from courses c
      left join enrollments e on e.course_id = c.id and e.user_id = (select id from "user" where email = ${lit(email)})
      where c.id in (${CURSOS.map(lit).join(',')})) x`) || '[]',
  );
  return CURSOS.map((id, i) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return null;
    if (codigos && !codigos.includes(codigo(i))) return null;
    const verId = r.ver ?? r.ultima;
    if (!verId) return { codigo: codigo(i), id, titulo: r.title, matricula: r.enr, versao: null, publicado: false, doc: { modules: [] }, aulas: [] };
    const doc = JSON.parse(sql(`select document from course_versions where id = ${lit(verId)}`));
    const aulas = doc.modules.flatMap((m) => m.lessons);
    return { codigo: codigo(i), id, titulo: r.title, matricula: r.enr, versao: verId, publicado: r.status === 'published', versaoDaMatricula: !!r.ver, ultimaVersao: r.ultima, doc, aulas };
  }).filter(Boolean);
}

/** id do asset -> caminho absoluto do arquivo (só os que existem no disco). */
export function arquivosDosAssets(ids) {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return {};
  const out = {};
  for (const linha of sql(`select id || '|' || storage_key from assets where id in (${uniq.map(lit).join(',')})`).split('\n')) {
    if (!linha) continue;
    const [id, key] = linha.split('|');
    const f = resolve(RAIZ, '.data/storage', key);
    if (existsSync(f)) out[id] = f;
  }
  return out;
}
