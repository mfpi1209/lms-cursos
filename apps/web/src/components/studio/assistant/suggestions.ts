import type { AssistantContext, PromptSuggestion } from '@lms/ai/client';

/**
 * Atalhos de prompt locais. Servem de reserva quando a rota de sugestões do
 * assistente não responde e de base para os chips em linha (cena, wizard,
 * direção). Texto em pt-BR, frases completas: é o que vai para a IA.
 */

/** Chips sob a fala do apresentador (contexto: cena). */
export const NARRATION_CHIPS: PromptSuggestion[] = [
  { id: 'narration-personal', label: 'Mais pessoal', prompt: 'Reescreva a fala do apresentador desta cena de um jeito mais pessoal, falando direto com o aluno (você).' },
  { id: 'narration-shorter', label: 'Mais curta', prompt: 'Deixe a fala do apresentador desta cena mais curta, mantendo a ideia principal.' },
  { id: 'narration-warmer', label: 'Mais acolhedora', prompt: 'Deixe a fala do apresentador desta cena mais acolhedora e encorajadora, sem perder a clareza.' },
];

/** Chips para a direção de uma cena (para montar em `components/studio/direction/*`). */
export const DIRECTION_CHIPS: PromptSuggestion[] = [
  { id: 'direction-scene', label: 'Dirigir esta cena', prompt: 'Proponha a direção desta cena: planos, enquadramentos e slides.' },
  { id: 'direction-slides', label: 'Mais slides', prompt: 'Use mais slides nesta cena para destacar as ideias-chave.' },
  { id: 'direction-calm', label: 'Ritmo mais calmo', prompt: 'Deixe o ritmo da direção mais calmo, com planos mais longos.' },
];

/** Chips por passo do wizard de montagem. */
export const WIZARD_STEP_CHIPS: Record<string, PromptSuggestion[]> = {
  tema: [
    { id: 'tema-audience', label: 'Definir o público', prompt: 'Me ajude a descrever melhor o público deste curso: quem é, o que já sabe e o que precisa resolver.' },
    { id: 'tema-skill', label: 'Habilidade final', prompt: 'Sugira uma habilidade final clara e observável para este curso.' },
    { id: 'tema-title', label: 'Ideias de título', prompt: 'Sugira três títulos curtos e diretos para este curso.' },
  ],
  conteudo: [
    { id: 'conteudo-sources', label: 'Que material usar', prompt: 'Que tipo de material de apoio ajudaria a IA a escrever este curso com mais precisão?' },
    { id: 'conteudo-gaps', label: 'O que está faltando', prompt: 'Olhando o briefing, que informações ainda faltam para montar um bom curso?' },
  ],
  estrutura: [
    { id: 'estrutura-review', label: 'Revisar a estrutura', prompt: 'Revise a estrutura do curso: os módulos e aulas cobrem os objetivos?' },
    { id: 'estrutura-objectives', label: 'Objetivos mais claros', prompt: 'Sugira objetivos de aprendizagem mais claros e mensuráveis para este curso.' },
    { id: 'estrutura-size', label: 'Tamanho certo', prompt: 'O número de aulas está adequado para o tempo previsto do curso?' },
  ],
  apresentacao: [
    { id: 'apresentacao-style', label: 'Estilo de direção', prompt: 'Que estilo de direção (ritmo, slides, cenas em movimento) combina com este curso?' },
    { id: 'apresentacao-angle', label: 'Novo ângulo de câmera', prompt: 'Sugira um novo ângulo de câmera para variar os planos do apresentador.' },
  ],
  aulas: [
    { id: 'aulas-next', label: 'Por onde começar', prompt: 'Qual aula devo revisar primeiro e por quê?' },
    { id: 'aulas-decisions', label: 'Decisões mais realistas', prompt: 'Como deixar as decisões das aulas mais realistas e desafiadoras?' },
    { id: 'aulas-direction', label: 'Dirigir as aulas', prompt: 'Quais aulas já estão prontas para receber direção com IA?' },
  ],
  revisao: [
    { id: 'revisao-ready', label: 'Está pronto para publicar?', prompt: 'O curso está pronto para publicar? O que ainda falta resolver?' },
    { id: 'revisao-videos', label: 'Vídeos que faltam', prompt: 'Quais cenas ainda estão sem vídeo e quanto falta gerar?' },
  ],
};

const DEFAULTS: Record<AssistantContext['screen'], PromptSuggestion[]> = {
  course: [
    { id: 'course-next', label: 'O que fazer agora', prompt: 'O que devo fazer agora para avançar com este curso?' },
    { id: 'course-weak', label: 'Aula mais fraca', prompt: 'Qual aula está mais fraca e como melhorar?' },
    { id: 'course-videos', label: 'Situação dos vídeos', prompt: 'Como está a produção dos vídeos do curso?' },
    { id: 'course-evaluate', label: 'Avalie o curso', prompt: 'Avalie a qualidade do curso: dê uma nota geral, aponte as aulas mais fracas e o que corrigir primeiro.' },
  ],
  wizard: [{ id: 'wizard-help', label: 'Me ajude neste passo', prompt: 'Me ajude a concluir este passo da montagem.' }],
  storyboard: [
    { id: 'storyboard-review', label: 'Revisar esta aula', prompt: 'Revise esta aula e diga o que melhorar primeiro.' },
    { id: 'storyboard-direct', label: 'Dirigir a aula', prompt: 'Proponha a direção das cenas com vídeo desta aula.' },
    { id: 'storyboard-videos', label: 'Gerar vídeos que faltam', prompt: 'Quais cenas desta aula ainda precisam de vídeo?' },
    { id: 'storyboard-evaluate', label: 'Avalie esta aula', prompt: 'Avalie a qualidade desta aula: dê notas por dimensão e aponte o que corrigir primeiro, cena por cena.' },
  ],
  production: [
    { id: 'production-status', label: 'Como está a fila', prompt: 'Resuma a situação da fila de vídeos e o que está travado.' },
    { id: 'production-failed', label: 'Vídeos com falha', prompt: 'Quais vídeos falharam e o que fazer com eles?' },
  ],
  review: [
    { id: 'review-ready', label: 'Pronto para publicar?', prompt: 'O curso está pronto para publicar? O que ainda falta resolver?' },
    { id: 'review-warnings', label: 'Explicar os avisos', prompt: 'Explique os avisos da validação em linguagem simples.' },
  ],
};

const SCENE_DEFAULTS: PromptSuggestion[] = [
  { id: 'scene-improve', label: 'Melhorar esta cena', prompt: 'Como melhorar esta cena?' },
  { id: 'scene-direct', label: 'Dirigir esta cena', prompt: 'Proponha a direção desta cena: planos, enquadramentos e slides.' },
  ...NARRATION_CHIPS.slice(0, 2),
];

/** Sugestões locais para um contexto (reserva sem rede). */
export function localSuggestions(ctx: AssistantContext): PromptSuggestion[] {
  if (ctx.screen === 'wizard' && ctx.step && WIZARD_STEP_CHIPS[ctx.step]) return WIZARD_STEP_CHIPS[ctx.step]!;
  if (ctx.screen === 'storyboard' && ctx.nodeId) return SCENE_DEFAULTS;
  return DEFAULTS[ctx.screen];
}
