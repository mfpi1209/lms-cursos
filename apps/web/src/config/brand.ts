/**
 * Marca da plataforma (white-label por workspace).
 *
 * A identidade do CROMO da plataforma (login, cabeçalho e rodapé do aluno, cabeçalho
 * do estúdio, título da aba, cores dos temas claro/escuro) vem de um preset. Os
 * valores de cor entram no CSS pela classe `className` posta em <html>
 * (app/layout.tsx) — os tokens de cada preset ficam em app/globals.css
 * ("PRESETS DE MARCA"), sempre com os mesmos nomes semânticos (bg/surface/fg/accent…).
 *
 * Cada CURSO continua com a própria marca dentro do player (`document.branding`):
 * quando o curso não define `accent`, o player herda o acento do preset do workspace
 * (ver components/player/immersive/theme.ts, `resolveBrand`).
 *
 * TODO(workspace): trocar a busca por preset estático por uma coluna
 * `workspaces.branding.preset` (ou a própria paleta no JSON `branding`) quando a
 * migração existir. `getBrand(workspaceId)` já recebe o id para isso; hoje o id é
 * ignorado e o preset vem do env `PLATFORM_BRAND` (padrão: DNA Work).
 */

export type BrandPresetId = 'dnawork' | 'lms';

export interface BrandPreset {
  id: BrandPresetId;
  /** nome da marca (título da aba, "Oferecido por …", aria-labels) */
  name: string;
  /** marca em texto, usada quando não há logo (ex.: "cursos" + ponto no acento) */
  wordmark: string;
  /** logo para fundos claros (caminho público) — sem logo, o cromo mostra o `wordmark` */
  logoLight?: string;
  /** logo para fundos escuros (versão branca) */
  logoDark?: string;
  /** proporção largura/altura do logo (para reservar espaço sem saltos) */
  logoRatio?: number;
  /** frase curta no tom da marca (login, rodapé) */
  tagline: string;
  /** acento como PREENCHIMENTO (botão principal, progresso) nos dois temas */
  accent: string;
  /** acento como TEXTO/linha fina sobre fundos escuros (AA ≥ 4,5:1 nas superfícies escuras) */
  accentOnDark?: string;
  /** acento como TEXTO/linha fina sobre fundos claros (AA ≥ 4,5:1 no branco e no `surfaceLight`) */
  accentOnLight: string;
  /** texto sobre o acento preenchido (AA ≥ 4,5:1 sobre `accent`) */
  onAccent: string;
  /** tinta principal (texto no claro; superfície dos cartões no escuro) */
  ink: string;
  /** fundo do tema claro */
  surfaceLight: string;
  /** fundo do tema escuro */
  surfaceDark: string;
  /** classe posta em <html> que liga os tokens do preset em globals.css */
  className: string;
  /**
   * Vinheta da marca (construtor no estúdio): valores iniciais do formulário.
   * A vinheta padrão do workspace em si é o asset com `metadata.bumper.default`
   * (ver `findDefaultBumper`); aqui só o que pré-preenche o construtor.
   */
  bumperDefaults: BumperDefaults;
}

export interface BumperDefaults {
  style: 'reveal' | 'sweep' | 'pulse';
  variant: 'light' | 'navy';
  durationSec: number;
  tagline: string;
  audio: 'warm' | 'bright' | 'minimal';
}

/** Preset DNA Work: navy + laranja, fundo claro #F4F7FA (docs/brand/dnawork.md). */
export const DNAWORK_BRAND: BrandPreset = {
  id: 'dnawork',
  name: 'DNA Work',
  wordmark: 'dna work',
  logoLight: '/brand/dnawork/logo.png',
  logoDark: '/brand/dnawork/logo-branco.png',
  logoRatio: 1017 / 256,
  /** slogan oficial da marca; vazio = não exibir (não inventar slogan) */
  tagline: '',
  accent: '#FF7A08',
  accentOnDark: '#FF7A08',
  accentOnLight: '#A84C00',
  onAccent: '#1D1E4C',
  ink: '#1D1E4C',
  surfaceLight: '#F4F7FA',
  surfaceDark: '#12132F',
  className: 'brand-dnawork',
  bumperDefaults: { style: 'reveal', variant: 'light', durationSec: 4, tagline: '', audio: 'warm' },
};

/** Preset reserva: a identidade original da plataforma (marinho + lima). */
export const LMS_BRAND: BrandPreset = {
  id: 'lms',
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Cursos',
  wordmark: (process.env.NEXT_PUBLIC_BRAND_NAME ?? 'cursos').toLowerCase(),
  tagline: 'Cursos práticos para o trabalho e o dia a dia.',
  accent: '#C8F03C',
  accentOnDark: '#C8F03C',
  accentOnLight: '#3F5A00',
  onAccent: '#0B1424',
  ink: '#0B1424',
  surfaceLight: '#F4F6F9',
  surfaceDark: '#0B1424',
  className: 'brand-lms',
  bumperDefaults: { style: 'reveal', variant: 'navy', durationSec: 4, tagline: 'Cursos práticos para o trabalho e o dia a dia.', audio: 'minimal' },
};

/** O que o logo precisa (serializável: vai do servidor para o player, que é componente de cliente). */
export type BrandMark = Pick<BrandPreset, 'name' | 'wordmark' | 'logoLight' | 'logoDark' | 'logoRatio'>;

export function brandMarkOf(brand: BrandPreset): BrandMark {
  return { name: brand.name, wordmark: brand.wordmark, logoLight: brand.logoLight, logoDark: brand.logoDark, logoRatio: brand.logoRatio };
}

export const BRAND_PRESETS: Record<BrandPresetId, BrandPreset> = { dnawork: DNAWORK_BRAND, lms: LMS_BRAND };

export function parseBrandPresetId(value: string | null | undefined): BrandPresetId | undefined {
  return value === 'dnawork' || value === 'lms' ? value : undefined;
}

/**
 * Preset de marca do workspace. Hoje: env `PLATFORM_BRAND` (dnawork | lms), padrão DNA Work.
 * `workspaceId` é aceito desde já para a versão por banco (ver TODO no topo).
 */
export function getBrand(workspaceId?: string): BrandPreset {
  void workspaceId; // TODO(workspace): consultar o preset/paleta gravado no workspace
  const fromEnv = parseBrandPresetId(process.env.PLATFORM_BRAND);
  return BRAND_PRESETS[fromEnv ?? 'dnawork'];
}
