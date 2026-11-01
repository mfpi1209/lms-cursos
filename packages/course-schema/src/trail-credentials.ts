import { trailSlug } from './trails';

/**
 * Pacote currículo do Selo DNA Work · <trilha>: o que a pessoa pode escrever no currículo, no LinkedIn e no
 * certificado impresso. Tudo aqui é conteúdo curado + funções puras (sem banco, sem IA em tempo de execução).
 *
 * - `TRAIL_CREDENTIALS`: competências curadas (nome + descrição), resumo de currículo e palavras-chave por trilha.
 *   Chave = `trailSlug(trilha)`. Trilha SEM entrada aqui continua com as competências derivadas dos objetivos dos
 *   cursos (`competencyFromObjective`): todo consumidor deve passar por `credentialFor` / `competencyNamesFor`.
 * - Carga horária: soma das durações estimadas das aulas dos cursos da trilha + o tempo da checagem final.
 */

export interface TrailCompetency {
  /** nome curto, na 3ª pessoa ("Pede um exemplo quando a tarefa não está clara"); é o que fica gravado no selo */
  name: string;
  /** uma frase que explica o que a pessoa demonstrou */
  description: string;
}

export interface TrailCredential {
  competencies: TrailCompetency[];
  /** 1 a 2 frases, prontas para o campo "resumo" do currículo */
  cvSummary: string;
  /** termos de busca de recrutadores (ATS) coerentes com a trilha */
  keywords: string[];
}

/**
 * Conteúdo curado por trilha (chave = `trailSlug`), gerado de docs/selos/competencias.json (revisão pedagógica).
 * Trilha sem entrada cai nas competências derivadas dos cursos.
 */
export const TRAIL_CREDENTIALS: Record<string, TrailCredential> = {
  "primeiro-emprego": {
    "competencies": [
      {
        "name": "Alinhamento de tarefas, prazos e combinados",
        "description": "Confirmou entrega, prazo, critério e pessoa de referência antes de começar e realinhou prioridades em situações de trabalho simuladas."
      },
      {
        "name": "Comunicação de imprevistos e erros",
        "description": "Praticou avisar atraso ou erro assim que percebido, com o que aconteceu, o impacto e o próximo passo ou a versão corrigida."
      },
      {
        "name": "Pedido de ajuda com contexto",
        "description": "Demonstrou pedir ajuda dizendo o que precisava fazer, o que já tentou e o erro encontrado, em vez de insistir sozinho."
      },
      {
        "name": "Aplicação de feedback e plano de desenvolvimento",
        "description": "Praticou pedir exemplo do que melhorar, combinar uma ação com momento de revisão e propor uma próxima oportunidade de aprender."
      },
      {
        "name": "Preparação para processos seletivos",
        "description": "Leu vagas separando exigido de desejável, montou currículo de uma página e perfil, e preparou apresentação e respostas de entrevista."
      }
    ],
    "cvSummary": "Trilha prática de entrada no trabalho: combinados do primeiro dia, comunicação com quem orienta, feedback e preparação para processos seletivos.",
    "keywords": [
      "Comunicação",
      "Proatividade",
      "Responsabilidade",
      "Abertura a feedback",
      "Comprometimento",
      "Entrevista de emprego",
      "Currículo"
    ]
  },
  "rotina-e-combinados": {
    "competencies": [
      {
        "name": "Comunicação profissional por escrito",
        "description": "Escreveu mensagens de trabalho com identificação, contexto e pedido, e retomou um pedido pendente sem pressionar."
      },
      {
        "name": "Pontualidade e comunicação de ausências",
        "description": "Planejou trajeto e chegada e praticou avisar mudança de horário com antecedência, combinando como registrar a ausência."
      },
      {
        "name": "Uso do celular conforme a orientação do local",
        "description": "Distinguiu uso de trabalho de interrupção pessoal, confirmou o que é permitido e combinou canal para um recado necessário."
      },
      {
        "name": "Comunicação de entregas e próximos passos",
        "description": "Avisou conclusão de tarefa com local do resultado e pendências, e propôs a próxima atividade sem assumir acesso não combinado."
      },
      {
        "name": "Esclarecimento de regras e orientações",
        "description": "Pediu exemplo concreto para aplicar uma regra vaga e, diante de orientações divergentes, confirmou qual valia com quem decide."
      }
    ],
    "cvSummary": "Trilha prática de rotina de trabalho: mensagens profissionais, horários e ausências, celular no expediente, entrega de tarefas e esclarecimento de regras.",
    "keywords": [
      "Pontualidade",
      "Comunicação escrita",
      "Organização",
      "Disciplina",
      "Cumprimento de normas",
      "Compromisso com prazos"
    ]
  },
  "imagem-e-postura": {
    "competencies": [
      {
        "name": "Apresentação pessoal adequada ao ambiente",
        "description": "Consultou a orientação de roupa e calçado antes de decidir e propôs alternativa possível em vez de comprar por suposição."
      },
      {
        "name": "Responsabilidade com imagem e dados nas redes",
        "description": "Conferiu pessoas e informações visíveis antes de publicar, pediu autorização e retirou publicação indevida, avisando os envolvidos."
      },
      {
        "name": "Postura profissional diante de correções",
        "description": "Pediu exemplo concreto do que mudar, combinou uma mudança observável e buscou apoio quando a correção veio com desrespeito."
      }
    ],
    "cvSummary": "Trilha prática de postura profissional: vestimenta adequada ao ambiente, publicações sobre o trabalho com autorização e resposta a correções.",
    "keywords": [
      "Postura profissional",
      "Apresentação pessoal",
      "Receptividade a feedback",
      "Ética profissional",
      "Uso responsável de redes sociais",
      "Sigilo de informações"
    ]
  },
  "convivencia": {
    "competencies": [
      {
        "name": "Respeito a limites nas relações de trabalho",
        "description": "Perguntou como a pessoa prefere ser tratada, expressou um limite com calma e recorreu à referência quando o incômodo continuou."
      },
      {
        "name": "Apoio a colegas em situações de desconforto",
        "description": "Escolheu, em caso simulado, uma frase de acolhimento e um caminho de apoio para colega alvo de brincadeira, sem expor nem confrontar."
      },
      {
        "name": "Comunicação assertiva com a equipe",
        "description": "Pediu atenção informando assunto e urgência real e apresentou diferença de entendimento com fatos e proposta, sem atacar a pessoa."
      },
      {
        "name": "Cuidado com espaços e recursos compartilhados",
        "description": "Deixou o espaço coletivo pronto para a próxima pessoa e sinalizou um problema de manutenção sem improvisar a solução."
      }
    ],
    "cvSummary": "Trilha prática de convivência no trabalho: limites e respeito entre colegas, conversa assertiva com a equipe e cuidado com espaços compartilhados.",
    "keywords": [
      "Trabalho em equipe",
      "Relacionamento interpessoal",
      "Comunicação assertiva",
      "Respeito",
      "Empatia",
      "Zelo pelo ambiente de trabalho"
    ]
  },
  "respeito-e-dialogo": {
    "competencies": [
      {
        "name": "Respeito à diversidade na equipe",
        "description": "Reconheceu formas diferentes de participar, interveio diante de piada e insistência e fez convite que a pessoa pode recusar sem se explicar."
      },
      {
        "name": "Discordância construtiva e negociação",
        "description": "Discordou com objetivo comum, preocupação e proposta; definiu critérios para sair de um impasse e manteve o diálogo ao ouvir crítica."
      },
      {
        "name": "Proposta de melhorias com base em observação",
        "description": "Descreveu uma dificuldade com fato e efeito, sem culpar pessoas, e propôs um teste pequeno com sinal de resultado definido."
      }
    ],
    "cvSummary": "Trilha prática de diálogo no trabalho: respeito às diferenças, discordância sem conflito e proposta de melhorias pequenas e testáveis.",
    "keywords": [
      "Respeito à diversidade",
      "Inclusão",
      "Negociação",
      "Argumentação",
      "Iniciativa",
      "Colaboração"
    ]
  },
  "tecnologia-com-criterio": {
    "competencies": [
      {
        "name": "Proteção de dados pessoais em prints e mensagens",
        "description": "Identificou nome, telefone e conversas de terceiros em um print e os removeu antes de pedir ajuda, enviando só o necessário."
      },
      {
        "name": "Compartilhamento seguro de arquivos e links",
        "description": "Conferiu destinatário, conteúdo e nível de acesso antes de enviar e restringiu um link aberto a quem precisava dele."
      },
      {
        "name": "Verificação de informações antes de agir ou repassar",
        "description": "Checou origem, data e contexto de um aviso antes de agir e reconheceu sinais de vaga falsa que pede documentos antes da entrevista."
      },
      {
        "name": "Uso de inteligência artificial com revisão",
        "description": "Formulou pedido à IA com objetivo, contexto e formato, revisou a resposta com checklist e trocou dados reais por fictícios."
      }
    ],
    "cvSummary": "Trilha prática de tecnologia no trabalho: proteção de dados em prints e envios, checagem de informações e golpes, uso de IA com revisão.",
    "keywords": [
      "Proteção de dados",
      "Noções de segurança da informação",
      "Letramento digital",
      "Inteligência artificial",
      "Atenção aos detalhes",
      "Ética digital"
    ]
  },
  "autonomia-no-trabalho": {
    "competencies": [
      {
        "name": "Priorização de demandas com informações concretas",
        "description": "Diante de um pedido “urgente”, perguntou prazo e uso e avisou compromissos já assumidos antes de reordenar o trabalho."
      },
      {
        "name": "Negociação de prazos e carga de trabalho",
        "description": "Quando as tarefas não cabiam no tempo, listou o que faltava e pediu ajuste com situação, impacto e alternativa a quem decide."
      },
      {
        "name": "Correção de erros e melhoria de processo",
        "description": "Avisou erro com fato, impacto e próximo passo e escolheu uma mudança no processo, definindo como verificar se reduziu o erro."
      },
      {
        "name": "Aprendizagem autônoma de novas tarefas",
        "description": "Registrou o que já faz sozinho e o que quer aprender e montou plano para aprender uma tarefa observando, anotando e tirando dúvidas."
      }
    ],
    "cvSummary": "Trilha prática de autonomia: priorização de demandas, negociação de prazos, comunicação e correção de erros, aprendizado de tarefas novas.",
    "keywords": [
      "Autonomia",
      "Gestão do tempo",
      "Priorização",
      "Melhoria contínua",
      "Vontade de aprender",
      "Autodesenvolvimento"
    ]
  },
  "pensar-e-resolver": {
    "competencies": [
      {
        "name": "Planejamento de tarefas a partir do objetivo",
        "description": "Antes de agir, identificou o que precisa conseguir, o que já sabe e o que falta descobrir, e ordenou etapas marcando o que confirmar."
      },
      {
        "name": "Raciocínio baseado em fatos, não em suposições",
        "description": "Separou observação de conclusão, considerou explicações alternativas e comparou dados antes de apontar uma causa."
      },
      {
        "name": "Investigação de problemas com testes seguros",
        "description": "Montou investigação com sintoma, hipótese e verificação segura, confirmando se há como desfazer e quando parar para pedir apoio."
      },
      {
        "name": "Verificação de resultados após uma correção",
        "description": "Definiu critério de sucesso e o que registrar após um teste, confirmando a solução com teste autorizado, não só pela tela."
      }
    ],
    "cvSummary": "Trilha prática de raciocínio no trabalho: planejar a partir do objetivo, separar fato de suposição, investigar causas com segurança e confirmar resultados.",
    "keywords": [
      "Resolução de problemas",
      "Pensamento crítico",
      "Raciocínio lógico",
      "Planejamento",
      "Pensamento analítico",
      "Tomada de decisão"
    ]
  }
};

/** Conteúdo curado da trilha, ou null (sem entrada, ou entrada sem competências) = usar as competências derivadas. */
export function credentialFor(trail: string, credentials: Record<string, TrailCredential> = TRAIL_CREDENTIALS): TrailCredential | null {
  const c = credentials[trailSlug(trail)];
  return c && c.competencies.length > 0 ? c : null;
}

/** Nomes das competências a gravar/mostrar: os curados, se houver; senão os derivados dos objetivos. */
export function competencyNamesFor(trail: string, derived: readonly string[], credentials: Record<string, TrailCredential> = TRAIL_CREDENTIALS): string[] {
  const c = credentialFor(trail, credentials);
  return c ? c.competencies.map((x) => x.name) : [...derived];
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

/**
 * Competências gravadas no selo com a descrição curada quando o NOME bate (selos antigos, de antes do conteúdo
 * curado, ou nomes que mudaram depois ficam só com o texto gravado).
 */
export function describeCompetencies(trail: string, stored: readonly string[], credentials: Record<string, TrailCredential> = TRAIL_CREDENTIALS): TrailCompetency[] {
  const byName = new Map((credentialFor(trail, credentials)?.competencies ?? []).map((c) => [norm(c.name), c.description] as const));
  return stored.map((name) => {
    const description = byName.get(norm(name));
    return description ? { name, description } : { name, description: '' };
  });
}

/* ------------------------------------------------------------------------ */
/* Carga horária                                                             */
/* ------------------------------------------------------------------------ */

/** Tempo fixo da checagem final da trilha (situações de trabalho), somado à carga horária. */
export const TRAIL_FINAL_CHECK_MINUTES = 10;

/**
 * Carga horária da trilha, em minutos: soma de `estimatedMinutes` de todas as aulas das versões publicadas dos
 * cursos da trilha + `TRAIL_FINAL_CHECK_MINUTES`. Recebe só o que precisa (módulos e aulas), para ser pura.
 */
export function trailWorkload(courses: ReadonlyArray<{ modules: ReadonlyArray<{ lessons: ReadonlyArray<{ estimatedMinutes: number }> }> }>): number {
  let total = 0;
  for (const c of courses) for (const m of c.modules) for (const l of m.lessons) total += Number.isFinite(l.estimatedMinutes) ? Math.max(0, l.estimatedMinutes) : 0;
  return total + TRAIL_FINAL_CHECK_MINUTES;
}

/** "45 min" abaixo de 60; a partir daí "1 h 30 min" (hora cheia: "2 h"). Nunca arredonda para horas cheias. */
export function formatWorkload(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/* ------------------------------------------------------------------------ */
/* Texto para o currículo                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Linha pronta para colar no currículo:
 * `Selo DNA Work · <trilha> — DNA Work, <ano> · Carga horária: <x> · Competências: <c1>, <c2>, <c3> · Verificação: <url>`
 * Mostra até 3 competências (as primeiras). Com resumo curado, ele vem numa linha acima.
 */
export function cvText(input: { trail: string; year: number; workloadMinutes: number | null; competencies: readonly string[]; verifyUrl: string; summary?: string | null }): string {
  const parts = [`Selo DNA Work · ${input.trail} — DNA Work, ${input.year}`];
  if (input.workloadMinutes != null) parts.push(`Carga horária: ${formatWorkload(input.workloadMinutes)}`);
  const comps = input.competencies.slice(0, 3);
  if (comps.length) parts.push(`Competências: ${comps.map((c) => c.replace(/[.;]+$/, '')).join(', ')}`);
  parts.push(`Verificação: ${input.verifyUrl}`);
  const line = parts.join(' · ');
  return input.summary?.trim() ? `${input.summary.trim()}\n${line}` : line;
}
