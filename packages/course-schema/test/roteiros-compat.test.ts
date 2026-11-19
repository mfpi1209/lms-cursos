import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { importMarkdownCourse, type MarkdownCourseOptions } from '../src/import/markdown-course';
import type { Presentation } from '../src/course';

/*
 * Rede de compatibilidade: cada roteiro de docs/roteiros/*.md (topo, sem lote/) passa pelo
 * mesmo caminho do CLI packages/db/src/scripts/import-markdown-course.ts (importMarkdownCourse),
 * sem banco e com a apresentação fixa abaixo. A saída (documento + códigos de erro e de aviso)
 * é comparada com o snapshot em __fixtures__/roteiros/<nome>.json.
 *
 * Para regenerar os snapshots (só quando a mudança de saída for intencional):
 *   UPDATE_ROTEIROS_SNAPSHOTS=1 npx vitest run test/roteiros-compat.test.ts
 *
 * Normalização: a saída foi gerada duas vezes e é idêntica; não há id nem timestamp aleatório
 * no caminho do importador (os ids são derivados do roteiro: aula_01, obj_aula_01, mod_01…).
 * Por isso NÃO há normalização. Se um id ou horário passar a ser aleatório, normalize-o aqui
 * antes de comparar.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const ROTEIROS_DIR = path.join(ROOT, 'docs/roteiros');
const SNAPSHOT_DIR = path.join(HERE, '__fixtures__/roteiros');
const UPDATE = process.env.UPDATE_ROTEIROS_SNAPSHOTS === '1';

/* Apresentação fixa (no CLI ela vem do curso de origem no banco). Uma câmera principal, pronta, com look. */
const FIXED_PRESENTATION: Partial<Presentation> = {
  avatarId: 'look_fixture_principal',
  avatarName: 'Apresentadora de teste',
  voiceProvider: 'elevenlabs',
  voiceId: 'voice_fixture',
  voiceName: 'Voz de teste',
  background: { type: 'color', value: '#F7F8FA' },
  cameras: [{ id: 'cam_principal', name: 'Principal', lookId: 'look_fixture_principal', nativeFraming: 'medium', angle: 'front', status: 'ready' }],
};

/* Opções que o CLI monta sem flags (optionsFrom + presentationFrom sem --cameras): sem marca d'água,
 * sem --presenter, sem --closing-line, direção ligada, perfil "first_job", nível iniciante, traço "shy". */
const CLI_DEFAULT_OPTIONS: MarkdownCourseOptions = {
  presentation: { ...FIXED_PRESENTATION, directionStyle: { cameraMode: 'single' } } as Partial<Presentation>,
  branding: {},
  audienceProfile: 'first_job',
  level: 'beginner',
  traits: ['shy'],
  direction: true,
};

/*
 * Roteiros de referência (com snapshot). A lista é fixa: roteiros de cliente (ex.: os da Cruzeiro,
 * c1-…c5-…) mudam a cada versão do conversor e não viram snapshot; eles passam pelo teste
 * "importam com 0 erros" no fim deste arquivo.
 */
const BASELINE = ['curso-comece-bem.md', 'curso-primeira-vaga.md'];

function roteiros(): string[] {
  return BASELINE.filter((f) => existsSync(path.join(ROTEIROS_DIR, f))).sort();
}

/** Os demais roteiros do topo de docs/roteiros (fora da lista de referência). */
function roteirosDeCliente(): string[] {
  return readdirSync(ROTEIROS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md') && !BASELINE.includes(e.name))
    .map((e) => e.name)
    .sort();
}

function snapshotOf(file: string) {
  const md = readFileSync(path.join(ROTEIROS_DIR, file), 'utf8');
  const r = importMarkdownCourse(md, CLI_DEFAULT_OPTIONS);
  return {
    document: r.document,
    errors: r.compile.errors.map((e) => e.code),
    warnings: r.allWarnings.map((w) => w.code),
  };
}

const name = (file: string) => file.replace(/\.md$/, '');
const snapshotPath = (file: string) => path.join(SNAPSHOT_DIR, `${name(file)}.json`);

describe('roteiros de docs/roteiros: compatibilidade do importador', () => {
  const files = roteiros();

  it('há roteiros para cobrir', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} gera o mesmo documento e os mesmos códigos de erro e aviso`, () => {
      const actual = snapshotOf(file);
      if (UPDATE) {
        mkdirSync(SNAPSHOT_DIR, { recursive: true });
        writeFileSync(snapshotPath(file), `${JSON.stringify(actual, null, 2)}\n`);
        return;
      }
      expect(existsSync(snapshotPath(file)), `snapshot ausente: ${snapshotPath(file)} (gere com UPDATE_ROTEIROS_SNAPSHOTS=1)`).toBe(true);
      const expected = JSON.parse(readFileSync(snapshotPath(file), 'utf8'));
      expect(actual).toEqual(expected);
    });
  }
});

describe('roteiros de cliente em docs/roteiros: importam com 0 erros', () => {
  for (const file of roteirosDeCliente()) {
    it(`${file} compila sem erros`, () => {
      const md = readFileSync(path.join(ROTEIROS_DIR, file), 'utf8');
      const r = importMarkdownCourse(md, CLI_DEFAULT_OPTIONS);
      expect(r.compile.errors.map((e) => `${e.code}${e.lessonId ? ` (${e.lessonId})` : ''}: ${e.message}`)).toEqual([]);
    });
  }
});
