/**
 * Dados editoriais do importador do pacote-15 (docs/novos-cursos/pacote-15): o que o pacote não traz e o motor pede.
 * Nada aqui é conteúdo novo de curso: são (1) o mapeamento instrutor sugerido → kit já cadastrado, (2) o apoio visual
 * das explicações (palavras que a própria fala diz, para as pílulas) e (3) poucas frases de ponte em verbos que não
 * encaixam na regra geral. Tudo que o importador acrescenta à fala está listado em `docs/novos-cursos/importacao.md`.
 */

/** Instrutor sugerido no pacote → kit da biblioteca (já cadastrado) e paleta do vídeo (a mesma do curso atual do instrutor). */
export const INSTRUTORES: Record<string, { kit: string; paleta: 'classica' | 'invertida' }> = {
  Patrícia: { kit: 'estudio8-patricia', paleta: 'classica' },
  Enzo: { kit: 'estudio8-enzo', paleta: 'invertida' },
  Thiago: { kit: 'estudio8-thiago', paleta: 'classica' },
  Júlia: { kit: 'estudio6-julia', paleta: 'invertida' },
  Renato: { kit: 'estudio6-renato', paleta: 'invertida' },
  Beatriz: { kit: 'estudio7-beatriz', paleta: 'classica' },
  Gustavo: { kit: 'estudio7-gustavo', paleta: 'invertida' },
  Helena: { kit: 'estudio8-helena', paleta: 'classica' },
};

export const PALETAS = {
  classica: { base: '#1D1E4C', accent: '#FF7A08' },
  invertida: { base: '#FF7A08', accent: '#1D1E4C' },
} as const;

/** Verbo no imperativo (como o pacote escreve o objetivo da aula) → 2ª pessoa do presente ("Você escreve…"). */
export const VERBO_VOCE: Record<string, string> = {
  Escreva: 'escreve', Monte: 'monta', Crie: 'cria', Liste: 'lista', Registre: 'registra', Prepare: 'prepara', Descreva: 'descreve',
  Defina: 'define', Escolha: 'escolhe', Organize: 'organiza', Complete: 'completa', Separe: 'separa',
};

/**
 * Objetivo da aula ("Você …") quando a regra geral não serve: o enunciado do pacote começa com "Complete:" e lista quatro
 * partes. Chave: `<slug>/<aula>`.
 */
export const OBJETIVO_VOCE: Record<string, string> = {
  'por-onde-eu-comeco/a01': 'Você completa quatro partes: o que precisa conseguir, o que já sabe, o que falta descobrir e o primeiro passo.',
  'por-onde-eu-comeco/a02': 'Você organiza um plano de quatro etapas e marca o que precisa ser confirmado antes de começar.',
  'errei-e-agora/a02': 'Você escolhe uma mudança no processo e diz como verificar se ela reduziu o erro.',
};

/** Como a missão é dita no aviso da abertura quando o enunciado não vira frase falada com a regra geral. */
export const MISSAO_FALADA: Record<string, string> = {
  'por-onde-eu-comeco/a01': 'complete quatro partes: o que você precisa conseguir, o que já sabe, o que falta descobrir e qual é o seu primeiro passo',
  'seus-dados-tambem-trabalham/a02': 'monte um checklist de envio, com destinatário, conteúdo e acesso',
};

/**
 * Objetivo do CURSO como o aluno o lê e a apresentadora o diz ("Hoje, vamos …"), quando o do pacote não serve (revisão pré-gravação,
 * 31/10): o do pacote tem jargão ("identificar informações expostas") ou promete o curso antigo ("transformar feedback em um plano
 * de desenvolvimento"). Vale no roteiro, na fala, na descrição e no resumo do aluno. Chave: slug.
 */
export const OBJETIVO_CURSO: Record<string, string> = {
  'seus-dados-tambem-trabalham': 'Ver o que um print mostra sem querer e o que conferir antes de enviar um arquivo ou link.',
  'aprender-faz-parte': 'Reconhecer o que você já faz sozinho e aprender uma tarefa nova observando quem já faz.',
};

/**
 * Apoio visual das explicações ("destacar duas ou três ideias da fala, uma por vez", PROMPT_PORTAL_DNA.md §5): título do
 * cartão e tópicos cujo trecho em **negrito** é dito na fala (o motor exibe esses trechos como pílulas, uma a uma, quando a
 * apresentadora os diz). Chave: `<slug>/<aula>`. O importador confere que cada negrito está na fala.
 */
export const APOIO_VISUAL: Record<string, { titulo: string; topicos: string[] }> = {
  'o-outro-so-e-diferente/a01': { titulo: 'Do comportamento ao combinado', topicos: ['Observe o **comportamento concreto**', 'Em vez de supor, **perguntar**', 'Um **combinado** que respeita a pessoa'] },
  'o-outro-so-e-diferente/a02': { titulo: 'Respeito inclui limites', topicos: ['Diga: **Vamos respeitar**', 'Ofereça **apoio em particular**', 'Procure o **canal adequado**'] },
  'ia-como-aliada/a01': { titulo: 'Estrutura de um bom pedido', topicos: ['Diga o **resultado**', 'Diga para qual **público**', 'Peça um **formato**'] },
  'ia-como-aliada/a02': { titulo: 'Confira antes de usar', topicos: ['Compare com a **fonte**', 'Confira **nomes, números e condições**', 'O que **não entra** no pedido'] },
  'parece-verdade-sera/a01': { titulo: 'Antes de repassar', topicos: ['Procure o **comunicado original**', 'Confira a **data**', 'Diga que **não foi confirmada**'] },
  'parece-verdade-sera/a02': { titulo: 'Verificar com responsabilidade', topicos: ['Abra o **canal conhecido**', 'Confira o **endereço do site**', 'Diga **não consegui confirmar**'] },
  'seus-dados-tambem-trabalham/a01': { titulo: 'Mostre só o necessário', topicos: ['Mostre a **parte necessária**', 'Confira a **imagem exportada**', 'Use **informações fictícias**'] },
  'seus-dados-tambem-trabalham/a02': { titulo: 'Conferir antes de enviar', topicos: ['Confira o **destinatário**', 'Confira o **arquivo**', 'Confira a **permissão**'] },
  'tudo-e-urgente/a01': { titulo: 'Urgência precisa de contexto', topicos: ['Pergunte quando a **entrega será usada**', 'Quem pode **definir a prioridade**', 'Evite trocar sem **combinado**'] },
  'tudo-e-urgente/a02': { titulo: 'Depois da decisão', topicos: ['Confirme o **novo combinado**', 'Se mudar, **avise cedo**', 'Sem trabalho **fora do horário**'] },
  'travei-como-peco-ajuda/a01': { titulo: 'Quando parar e perguntar', topicos: ['O erro precisa ser **reversível**', 'O **teste autorizado**', 'Com risco: **pare e pergunte**'] },
  'travei-como-peco-ajuda/a02': { titulo: 'O que dizer ao pedir ajuda', topicos: ['Seu **objetivo**', 'O **erro observado**', 'O que **já verificou**'] },
  'errei-e-agora/a01': { titulo: 'Avisar com fatos', topicos: ['Descreva os **fatos**', 'Diga **quem recebeu**', 'Diga o **impacto**'] },
  'errei-e-agora/a02': { titulo: 'Corrigir e aprender', topicos: ['A **correção chegou**?', 'Uma **mudança proporcional**', 'Uma **verificação** que ajude'] },
  'minha-ideia-tambem-conta/a01': { titulo: 'Uma observação útil', topicos: ['**O que acontece**', 'O seu **efeito**', 'O **processo atual**'] },
  'minha-ideia-tambem-conta/a02': { titulo: 'Combinar o teste', topicos: ['**Quem autoriza**', 'Como **ouvir o retorno**', 'Se não funcionar, **encerre o teste**'] },
  'discordar-sem-brigar/a01': { titulo: 'Discordar com clareza', topicos: ['Fale da **proposta**', 'Fale do **dado**', 'Fale do **efeito esperado**'] },
  'discordar-sem-brigar/a02': { titulo: 'Sair do impasse', topicos: ['Defina o **critério**', 'Veja **quem vai usar**', '**Registrem o combinado**'] },
  'nem-toda-brincadeira/a01': { titulo: 'Reconhecer sem se defender', topicos: ['Diga: **Entendi**', 'Diga: **Não vou repetir**', 'Procure um **canal adequado**'] },
  'nem-toda-brincadeira/a02': { titulo: 'Apoiar com cuidado', topicos: ['Não prometa **sigilo**', 'Um **adulto de confiança**', 'Na **escola ou no trabalho**'] },
  'seu-ritmo-tambem-importa/a01': { titulo: 'Organize o que cabe', topicos: ['O que **precisa ser feito**', 'O que **depende de outra pessoa**', 'O **tempo disponível**'] },
  'seu-ritmo-tambem-importa/a02': { titulo: 'Depois do pedido', topicos: ['**Quando será revisto**', 'Pergunte **quem pode ajudar**', 'O trabalho **caiba no tempo**'] },
  'aprender-faz-parte/a01': { titulo: 'Escolha um foco', topicos: ['Peça um **exemplo**', 'Prazo, responsável ou contexto: escolha **um desses pontos**', 'Pratique em uma **situação simples**'] },
  'aprender-faz-parte/a02': { titulo: 'Acompanhe seu avanço', topicos: ['O **retorno recebido**', '**O que funcionou**', 'Ajuste o **próximo passo**'] },
  'por-onde-eu-comeco/a01': { titulo: 'Fato ou hipótese', topicos: ['Uma **reunião viável**', 'Um **dado confirmado**', 'O que está **em aberto**'] },
  'por-onde-eu-comeco/a02': { titulo: 'Ordem das etapas', topicos: ['**Esta etapa depende** de quê?', 'O que **vem antes**', '**Compare o resultado** com o pedido'] },
  'faz-sentido/a01': { titulo: 'Mais de uma explicação', topicos: ['Várias **hipóteses**', '**Retome com contexto**', 'Diga **quando precisa**'] },
  'faz-sentido/a02': { titulo: 'Conclusão provisória', topicos: ['Compare **o que mudou**', 'Veja os **registros disponíveis**', '**Não sabemos a causa**'] },
  'onde-esta-o-problema/a01': { titulo: 'Investigue com segurança', topicos: ['Registre o **sintoma**', 'Teste **uma hipótese de cada vez**', 'Sem acesso, **peça apoio**'] },
  'onde-esta-o-problema/a02': { titulo: 'Confirme que funcionou', topicos: ['Volte ao **objetivo inicial**', 'Registre **o que foi verificado**', 'Diga a **limitação**'] },
};
