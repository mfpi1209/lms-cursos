/**
 * Artes da vitrine do aluno (pacote da refatoração da home): 26 capas, 4 fundos de trilha e 1 destaque, em WebP
 * (`public/capas/`). A arte NÃO traz texto: título, instrutor, duração e progresso são HTML sobre o cartão.
 *
 * A associação é pelo `courses.slug` REAL do banco (os códigos C01…C26 são só a numeração editorial do pacote; alguns
 * cursos antigos têm slug diferente do nome atual, ex.: "Como falar com a equipe" = `como-conversar-com-colegas-e-gestores`).
 * Trilhas: pela chave de URL da trilha (`trailSlug`). Curso sem arte aqui cai no retrato atual (ver `course-tile.tsx`).
 *
 * `position` é o `object-position` de cada formato de exibição, ajustado olhando o rosto na tela:
 * - `portrait`: cartão em pé 3:4 (o formato nativo das 23 capas em pé; as de formato deitado são cortadas);
 * - `landscape`: cartão 4:3 (as 23 capas em pé são cortadas na parte de cima, onde está o rosto);
 * - `wide`: quadro 16:9 (retomada e ficha do curso).
 */
export interface CoverPositions {
  portrait: string;
  landscape: string;
  wide: string;
}

export interface CoverArt {
  /** código editorial do pacote (C01…C26) */
  code: string;
  /** caminho público do WebP */
  src: string;
  width: number;
  height: number;
  /** formato nativo da arte */
  format: 'landscape' | 'portrait';
  /** instrutor mostrado na arte (para conferência; o texto do cartão vem dos dados do curso) */
  instructor: string;
  position: CoverPositions;
}

const DEFAULT_POS: CoverPositions = { portrait: '50% 35%', landscape: '50% 0%', wide: '50% 14%' };

function cover(code: string, file: string, instructor: string, size: 'p' | 'l', pos: Partial<CoverPositions> = {}): CoverArt {
  const landscape = size === 'l';
  return {
    code,
    src: `/capas/${file}.webp`,
    width: landscape ? 1448 : 1086,
    height: landscape ? 1086 : 1448,
    format: landscape ? 'landscape' : 'portrait',
    instructor,
    position: { ...DEFAULT_POS, ...(landscape ? { landscape: '50% 35%', wide: '50% 30%' } : {}), ...pos },
  };
}

/** `courses.slug` real → arte. */
export const COURSE_ART: Readonly<Record<string, CoverArt>> = {
  // Primeiro emprego
  'primeiro-dia-como-chegar-preparado': cover('C01', 'c01-meu-primeiro-dia', 'Marina', 'l'),
  'comece-bem-seus-primeiros-passos-no-trabalho': cover('C13', 'c13-comecei-a-trabalhar', 'Rafael', 'l'),
  'primeira-vaga': cover('C14', 'c14-minha-primeira-vaga', 'Marina', 'l'),
  // Rotina e combinados
  'celular-no-trabalho-quando-pega-mal': cover('C03', 'c03-celular-no-trabalho', 'Rafael', 'p'),
  'whatsapp-profissional-sem-passar-vergonha': cover('C04', 'c04-whatsapp-sem-complicacao', 'Thiago', 'p'),
  'horario-e-combinado': cover('C05', 'c05-horario-e-combinado', 'Júlia', 'p'),
  'acabou-minha-tarefa-e-agora': cover('C10', 'c10-terminei-e-agora', 'Beatriz', 'p'),
  'nao-entendi-a-regra-como-pergunto': cover('C11', 'c11-nao-entendi-posso-perguntar', 'Renato', 'p'),
  // Imagem e postura
  'que-roupa-eu-uso-para-trabalhar': cover('C02', 'c02-que-roupa-eu-uso', 'Camila', 'p'),
  'redes-sociais-e-bastidores-do-trabalho': cover('C09', 'c09-posso-postar-isso', 'Enzo', 'p'),
  'como-receber-uma-correcao-de-postura': cover('C12', 'c12-recebi-uma-correcao-e-agora', 'Helena', 'p'),
  // Convivência
  'liberdade-e-intimidade-sao-coisas-diferentes': cover('C06', 'c06-brincadeiras-tem-limite', 'Patrícia', 'p'),
  'como-conversar-com-colegas-e-gestores': cover('C07', 'c07-como-falar-com-a-equipe', 'Gustavo', 'p'),
  'espacos-compartilhados-voce-nao-esta-sozinho': cover('C08', 'c08-o-espaco-tambem-e-do-outro', 'Aline', 'p'),
  // Respeito e diálogo (série · Mauro)
  'o-outro-so-e-diferente': cover('C15', 'c15-o-outro-so-e-diferente', 'Mauro', 'p'),
  'discordar-sem-brigar': cover('C16', 'c16-discordar-sem-brigar', 'Mauro', 'p'),
  'minha-ideia-tambem-conta': cover('C17', 'c17-minha-ideia-tambem-conta', 'Mauro', 'p'),
  // Tecnologia com critério (série · Laís)
  'seus-dados-tambem-trabalham': cover('C18', 'c18-seus-dados-tambem-trabalham', 'Laís', 'p'),
  'parece-verdade-sera': cover('C19', 'c19-parece-verdade-sera', 'Laís', 'p'),
  'ia-como-aliada': cover('C20', 'c20-ia-como-aliada', 'Laís', 'p'),
  // Autonomia no trabalho (série · Vinícius)
  'tudo-e-urgente': cover('C21', 'c21-tudo-e-urgente', 'Vinícius', 'p'),
  'errei-e-agora': cover('C22', 'c22-errei-e-agora', 'Vinícius', 'p'),
  'aprender-faz-parte': cover('C23', 'c23-aprender-faz-parte-do-trabalho', 'Vinícius', 'p'),
  // Pensar e resolver (série · Flávia)
  'por-onde-eu-comeco': cover('C24', 'c24-por-onde-eu-comeco', 'Flávia', 'p'),
  'faz-sentido': cover('C25', 'c25-faz-sentido', 'Flávia', 'p'),
  'onde-esta-o-problema': cover('C26', 'c26-onde-esta-o-problema', 'Flávia', 'p'),
};

export interface WideArt {
  code: string;
  src: string;
  width: number;
  height: number;
  instructor: string;
  /** `object-position` do quadro 16:9 */
  position: string;
}

const trailArt = (code: string, file: string, instructor: string, height = 941): WideArt => ({ code, src: `/capas/${file}.webp`, width: 1672, height, instructor, position: '50% 50%' });

/** Chave de URL da trilha (`trailSlug`) → fundo da trilha (pessoa à direita, espaço roxo à esquerda). */
export const TRAIL_ART: Readonly<Record<string, WideArt & { benefit: string }>> = {
  'respeito-e-dialogo': { ...trailArt('T01', 't01-respeito-e-dialogo', 'Mauro'), benefit: 'Converse, respeite diferenças e participe.' },
  'tecnologia-com-criterio': { ...trailArt('T02', 't02-tecnologia-com-criterio', 'Laís'), benefit: 'Use dados, informação e IA com cuidado.' },
  'autonomia-no-trabalho': { ...trailArt('T03', 't03-autonomia-no-trabalho', 'Vinícius', 940), benefit: 'Organize prioridades e aprenda com a prática.' },
  'pensar-e-resolver': { ...trailArt('T04', 't04-pensar-e-resolver', 'Flávia'), benefit: 'Organize ideias e investigue problemas.' },
};

/** Destaque H01 (Helena): `courses.slug` do curso a que pertence. */
export const HERO_ART: Readonly<Record<string, WideArt>> = {
  'como-receber-uma-correcao-de-postura': trailArt('H01', 'h01-destaque-helena', 'Helena'),
};

export const courseArtFor = (slug: string | null | undefined): CoverArt | undefined => (slug ? COURSE_ART[slug] : undefined);
export const trailArtFor = (trailKey: string) => TRAIL_ART[trailKey];
export const heroArtFor = (slug: string | null | undefined): WideArt | undefined => (slug ? HERO_ART[slug] : undefined);

/** Todos os arquivos do pacote usados pelo app (a conferência em teste e no script de checagem). */
export function allArtFiles(): Array<{ code: string; src: string; width: number; height: number }> {
  return [...Object.values(COURSE_ART), ...Object.values(TRAIL_ART), ...Object.values(HERO_ART)].map(({ code, src, width, height }) => ({ code, src, width, height }));
}
