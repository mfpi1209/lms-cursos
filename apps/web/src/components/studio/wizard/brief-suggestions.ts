import type { CourseDocument } from '@lms/course-schema';

type Brief = CourseDocument['brief'];

/** Sugestão aplicável ao briefing: um campo, um valor, um motivo. Sem IA: modelos locais, preenchidos com o que o autor já escreveu. */
export interface BriefSuggestion {
  id: string;
  field: 'title' | 'topic' | 'audience' | 'finalSkill' | 'context';
  label: string;
  value: string;
  why: string;
}

const AUDIENCE_TEXT: Record<NonNullable<Brief['audienceProfile']>, string> = {
  first_job: 'Jovens de 16 a 24 anos buscando o primeiro emprego ou estágio: balconista, repositor, assistente de marketing, estágio de vendas. Chegam pelo celular, sem experiência formal e com pouco tempo.',
  experienced: 'Pessoas que já trabalharam na área e vão assumir uma função parecida em outra empresa. Conhecem a rotina; precisam ajustar hábitos e regras.',
  career_change: 'Pessoas vindas de outra área, com experiência de trabalho, mas sem a rotina desta função. Precisam dos termos e das regras básicas sem serem tratadas como iniciantes.',
  other: 'Descreva: cargo, momento de carreira e a situação de quem vai fazer o curso.',
};

const clean = (s: string) => s.trim().replace(/[.!…]+$/, '');
const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Sugestões para os campos vazios (ou fracos) do briefing, a partir do que já foi escrito. No máximo 4. */
export function briefSuggestions(title: string, brief: Brief, opts: { extended?: boolean } = {}): BriefSuggestion[] {
  const out: BriefSuggestion[] = [];
  const topic = clean(brief.topic);

  if (!brief.audience.trim() && brief.audienceProfile) {
    out.push({ id: 'audience-profile', field: 'audience', label: 'Descrever o público', value: AUDIENCE_TEXT[brief.audienceProfile], why: 'A IA escreve situações e exemplos para esse público (vagas reais, linguagem do dia a dia).' });
  }
  if (!brief.finalSkill.trim() && topic) {
    out.push({ id: 'skill-topic', field: 'finalSkill', label: 'Objetivo em uma frase', value: `…${lower(topic)}, sabendo o que dizer e o que fazer em seguida.`, why: 'Objetivo observável: a IA cria uma decisão por aula que treina exatamente isso.' });
  }
  if (!title.trim() && topic) {
    const short = topic.length > 48 ? `${topic.slice(0, 45).trimEnd()}…` : topic;
    out.push({ id: 'title-topic', field: 'title', label: 'Título a partir da ideia', value: short.charAt(0).toUpperCase() + short.slice(1), why: 'É o nome que o aluno vê. Curto e direto funciona melhor no celular.' });
  }
  if (opts.extended && !brief.context.trim() && brief.audienceProfile === 'first_job') {
    out.push({ id: 'context-first-job', field: 'context', label: 'Onde isso é usado', value: 'Na entrevista de 10 minutos pelo WhatsApp e nos primeiros dias na vaga: no balcão, no estoque ou no time de vendas, com o gestor por perto.', why: 'A situação real vira o cenário das cenas; sem ela, a IA inventa um contexto genérico.' });
  }
  if (!topic && brief.audienceProfile === 'first_job') {
    out.push({ id: 'topic-first-job', field: 'topic', label: 'Exemplo de ideia', value: 'Como se apresentar bem na primeira entrevista de estágio, mesmo sem experiência', why: 'A ideia em uma frase guia toda a estrutura. Troque pelo seu tema.' });
  }
  return out.slice(0, 4);
}
