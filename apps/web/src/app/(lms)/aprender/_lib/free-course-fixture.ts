import { CourseDocumentSchema, richTextFromPlain, type CourseDocument } from '@lms/course-schema';
import type { FreeCourseCardData } from './free-course';

/*
 * Dados fixos de um curso livre para os testes e para a prévia das telas (mesma forma do 1º curso livre publicado,
 * "IA na prática para estudar e trabalhar": 7 módulos, 21 aulas de 23 min, meta de 480 min e SEM `brief.format`
 * gravado). Nada daqui vai para o aluno.
 */

const p = richTextFromPlain;

export const FREE_FIXTURE_MODULES: Array<{ title: string; description: string; lessons: string[] }> = [
  { title: 'IA sem mistério: o que faz bem e onde erra', description: 'A IA prevê a próxima palavra; provável não é verdadeiro.', lessons: ['Boas-vindas', 'Como a IA funciona', 'Caça-alucinação'] },
  { title: 'Os 4 P: como pedir bem', description: 'Um pedido completo tem Papel, Pano de fundo, Pedido e Padrão.', lessons: ['A diferença está no pedido', 'Três truques para pedir melhor', 'Prática: o conserta-pedido'] },
  { title: 'Estudar com IA sem colar', description: 'A IA explica e testa; quem pensa e escreve é você.', lessons: ['Tutor paciente ou cola que reprova', 'Cinco jeitos de estudar com IA', 'Prática: o seu tutor de bolso'] },
  { title: 'IA no trabalho', description: 'A IA faz o rascunho; quem revisa e assina é você.', lessons: ['Cinco tarefas feitas em minutos', 'Resumo de reunião sem dado pessoal', 'Prática: a sua semana com IA'] },
  { title: 'Imagem, voz e vídeo: criar e desconfiar', description: 'Imagem com os 4 P e legenda dizendo que é IA.', lessons: ['Uma revelação sobre esta apresentadora', 'Sinais de imagem e vídeo falsos', 'Prática: imagem com legenda honesta'] },
  { title: 'Ética, plágio e privacidade', description: 'Senha, documento e dado de terceiros nunca entram na IA.', lessons: ['As regras do jogo que protegem você', 'Plágio e uso permitido na faculdade', 'Prática: a sua regra pessoal'] },
  { title: 'Projeto final: o seu assistente de estudos', description: 'Você junta tudo num assistente que é seu.', lessons: ['Hoje você junta tudo', 'A Bia trabalha no sábado', 'Dúvidas sobre o projeto'] },
];

const lessonId = (n: number) => `aula_${String(n).padStart(2, '0')}`;

/** Aula mínima válida: conteúdo, `assessments` perguntas (na 3ª aula de cada módulo), uma missão opcional e o fim. */
function lesson(n: number, title: string, o: { assessments: number; mission: boolean }) {
  const id = lessonId(n);
  const nodes: unknown[] = [{ id: `${id}_c`, type: 'content', title: 'Abertura', body: p('Conteúdo.') }];
  for (let k = 1; k <= o.assessments; k++) {
    nodes.push({ id: `${id}_q${k}`, type: 'assessment', title: `Pergunta ${k}`, prompt: p('Qual?'), options: [{ id: 'a', label: 'Certa', correct: true }, { id: 'b', label: 'Errada', correct: false }] });
  }
  if (o.mission) nodes.push({ id: `${id}_m`, type: 'mission', title: 'Leve para a vida real', action: 'Use um pedido com os 4 P hoje.', alternative: 'Escreva o pedido num caderno.' });
  nodes.push({ id: `${id}_fim`, type: 'end', summary: p('Fim.') });
  const ids = nodes.map((x) => (x as { id: string }).id);
  const edges = ids.slice(0, -1).map((from, i) => ({ id: `${id}_e${i}`, from, to: ids[i + 1]!, isDefault: true, priority: 0 }));
  return { id, title, objectiveIds: [], estimatedMinutes: 23, graph: { schemaVersion: 1, startNodeId: ids[0]!, nodes, edges } };
}

/** Documento do curso livre de exemplo. `overrides` troca campos de topo (ex.: `brief`, `certificate`). */
export function freeCourseDocument(overrides: Record<string, unknown> = {}, o: { mission?: boolean } = {}): CourseDocument {
  let n = 0;
  return CourseDocumentSchema.parse({
    schemaVersion: 1,
    title: 'IA na prática para estudar e trabalhar',
    learnerSummary: 'Aprenda a usar a inteligência artificial para estudar melhor e trabalhar mais rápido, sem cair nas respostas erradas e sem colar. Em 8 horas, você monta o seu próprio assistente de estudos.',
    brief: { targetMinutes: 480 },
    branding: { presenterName: 'Thiago' },
    presentation: { avatarName: 'Thiago', avatarPreviewUrl: '/api/assets/ast_thiago' },
    modules: FREE_FIXTURE_MODULES.map((m, mi) => ({
      id: `mod_${mi + 1}`,
      title: m.title,
      description: m.description,
      lessons: m.lessons.map((title, li) => {
        n += 1;
        return lesson(n, title, { assessments: li === 2 ? 4 : 0, mission: !!o.mission && n === 5 });
      }),
    })),
    ...overrides,
  });
}

/** Pílula de exemplo (uma aula curta, meta de 10 min). */
export function pillDocument(title = 'Horário é combinado'): CourseDocument {
  return CourseDocumentSchema.parse({ schemaVersion: 1, title, brief: { targetMinutes: 10 }, modules: [{ id: 'm1', title: 'Único', lessons: [lesson(1, 'Aula', { assessments: 0, mission: false })] }] });
}

/** Cartão do curso livre de exemplo, no estado pedido. */
export function freeCardFixture(o: Partial<FreeCourseCardData> = {}): FreeCourseCardData {
  return {
    id: 'enr_ia',
    href: '/aprender/enr_ia',
    startHref: '/aprender/enr_ia/aulas/aula_04',
    title: 'IA na prática para estudar e trabalhar',
    summary: 'Aprenda a usar a inteligência artificial para estudar melhor e trabalhar mais rápido, sem cair nas respostas erradas e sem colar.',
    presenter: 'Thiago',
    photo: '/api/assets/ast_thiago',
    workloadMinutes: 480,
    modules: 7,
    lessons: 21,
    required: 21,
    completed: 3,
    percent: 14,
    status: 'in_progress',
    cta: 'Continuar módulo 2',
    certificate: false,
    ...o,
  };
}
