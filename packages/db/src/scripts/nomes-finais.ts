/**
 * Nomes finais dos 14 cursos atuais e títulos das aulas (docs/qa/enriquecimento/brief.md, seções 5 e 6).
 *
 * Só os RASCUNHOS: `document.title` (e, por `saveDraft`, a coluna `courses.title`), o resumo do aluno
 * (`learnerSummary`, que a ficha e o card mostram), a frase do curso (`branding.tagline`), o `branding.wordmark`
 * e o título das aulas. Ids, slugs, URLs, matrículas, capas, nós e vídeos não mudam. Não publica: as versões
 * já publicadas só mostram os textos novos depois da publicação (a coluna `courses.title` vale já).
 *
 * Idempotente: repetir não grava nada. Seguro com outros agentes editando: lê o rascunho de novo, só troca o que
 * ainda está com o texto antigo (ou já novo) e grava com `expectedRevision`; se houver conflito, relê e tenta
 * de novo. Um título que outra pessoa mudou para um terceiro valor não é sobrescrito (aparece como "PULADO").
 *
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/nomes-finais.ts            # dry-run (padrão)
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/nomes-finais.ts --apply
 */
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../client';
import { getDraft, saveDraft } from '../repositories/authoring';

const APPLY = process.argv.includes('--apply');

interface CourseSpec {
  code: string;
  id: string;
  oldTitle: string;
  title: string;
  summary: string;
  /** aula (id) → [título antigo, título novo] */
  lessons: Record<string, [string, string]>;
}

export const SPECS: CourseSpec[] = [
  {
    code: 'C01', id: 'crs_99hpdsc8w88osiuh', oldTitle: 'Primeiro dia: como chegar preparado', title: 'Meu primeiro dia',
    summary: 'O que confirmar, como chegar e quem procurar.',
    lessons: {
      aula_01: ['Confirme antes de sair', 'Como confirmar local, horário e documentos'],
      aula_02: ['Resolva a chegada sem adivinhar', 'Como avisar um atraso e se apresentar'],
    },
  },
  {
    code: 'C02', id: 'crs_arbeohlw3xp5v3zx', oldTitle: 'Que roupa eu uso para trabalhar?', title: 'Que roupa eu uso?',
    summary: 'Entenda a orientação do trabalho e converse sobre alternativas.',
    lessons: {
      aula_01: ['Descubra o combinado do ambiente', 'Como confirmar roupa e calçado'],
      aula_02: ['Converse sobre alternativas', 'Como conversar sobre alternativas de roupa'],
    },
  },
  {
    code: 'C03', id: 'crs_hd4jnnpx3oj0xf14', oldTitle: 'Celular no trabalho: quando pega mal?', title: 'Celular no trabalho',
    summary: 'Saiba como conciliar tarefas, mensagens e recados importantes.',
    lessons: {
      aula_01: ['Entenda quando pode usar', 'Como saber quando usar o celular'],
      aula_02: ['Combine recados e preserve o ambiente', 'Como receber um recado importante'],
    },
  },
  {
    code: 'C04', id: 'crs_4z17p0m6d43qxmmo', oldTitle: 'WhatsApp profissional sem passar vergonha', title: 'WhatsApp sem complicação',
    summary: 'Escreva mensagens claras e acompanhe seus pedidos.',
    lessons: {
      aula_01: ['Envie uma mensagem que ajuda', 'Como escrever uma mensagem com contexto e pedido'],
      aula_02: ['Acompanhe sem pressionar', 'Como acompanhar um pedido sem pressionar'],
    },
  },
  {
    code: 'C05', id: 'crs_4tj8a3q3g9gudgb7', oldTitle: 'Horário é combinado', title: 'Horário é combinado',
    summary: 'Organize sua chegada e saiba como avisar mudanças.',
    lessons: {
      aula_01: ['Planeje uma chegada possível', 'Como planejar o trajeto e a chegada'],
      aula_02: ['Avise e confirme o próximo passo', 'Como avisar uma mudança de horário'],
    },
  },
  {
    code: 'C06', id: 'crs_b8zeh4b2gguseghq', oldTitle: 'Liberdade e intimidade são coisas diferentes', title: 'Brincadeiras têm limite',
    summary: 'Reconheça preferências, expresse seus limites e saiba buscar apoio.',
    lessons: {
      aula_01: ['Conheça as pessoas sem presumir', 'Nomes, apelidos e brincadeiras'],
      aula_02: ['Expresse limites e procure apoio', 'Como expressar um limite e buscar apoio'],
      // aula 3 nova (em gravação por outro agente): só o título
      aula_03: ['Quando o alvo é outra pessoa', 'Como apoiar quando o alvo é outra pessoa'],
    },
  },
  {
    code: 'C07', id: 'crs_bmf11akamtxoti28', oldTitle: 'Como conversar com colegas e gestores', title: 'Como falar com a equipe',
    summary: 'Peça ajuda, confirme orientações e esclareça diferenças.',
    lessons: {
      aula_01: ['Escolha o momento e o canal', 'Como pedir orientação no momento certo'],
      aula_02: ['Discorde com fatos e proposta', 'Como esclarecer uma diferença de entendimento'],
    },
  },
  {
    code: 'C08', id: 'crs_8g0csi2hflfztfge', oldTitle: 'Espaços compartilhados: você não está sozinho', title: 'O espaço também é do outro',
    summary: 'Cuide dos ambientes e materiais que você compartilha.',
    lessons: {
      aula_01: ['Deixe pronto para a próxima pessoa', 'Como deixar o espaço pronto para a próxima pessoa'],
      aula_02: ['Comunique o que precisa de cuidado', 'Como avisar o que precisa de cuidado'],
    },
  },
  {
    code: 'C09', id: 'crs_gjn468p3y6hwua4f', oldTitle: 'Redes sociais e bastidores do trabalho', title: 'Posso postar isso?',
    summary: 'Confira o que sua publicação pode revelar sobre o trabalho.',
    lessons: {
      aula_01: ['Olhe além da sua foto', 'Como conferir o que a publicação mostra'],
      aula_02: ['Se algo escapou, comunique', 'Como comunicar uma publicação indevida'],
    },
  },
  {
    code: 'C10', id: 'crs_q52zsimeeahpa9bq', oldTitle: 'Acabou minha tarefa. E agora?', title: 'Terminei. E agora?',
    summary: 'Entregue com clareza e escolha o próximo passo.',
    lessons: {
      aula_01: ['Termine com uma entrega clara', 'Como entregar e avisar onde está o resultado'],
      aula_02: ['Tenha iniciativa com alinhamento', 'Como escolher a próxima tarefa'],
    },
  },
  {
    code: 'C11', id: 'crs_u4nfw88a4n2n0ubv', oldTitle: 'Não entendi a regra. Como pergunto?', title: 'Não entendi. Posso perguntar?',
    summary: 'Tire dúvidas e esclareça orientações que não ficaram claras.',
    lessons: {
      aula_01: ['Troque uma palavra vaga por um exemplo', 'Como pedir um exemplo'],
      aula_02: ['Quando as orientações não batem', 'Como esclarecer orientações diferentes'],
    },
  },
  {
    code: 'C12', id: 'crs_5vccpfypr6fmxojb', oldTitle: 'Como receber uma correção de postura', title: 'Recebi uma correção. E agora?',
    summary: 'Entenda o que aconteceu, converse e combine uma mudança.',
    lessons: {
      aula_01: ['Entenda o comportamento apontado', 'Como entender o que precisa mudar'],
      aula_02: ['Combine um ajuste e reconheça limites', 'Como combinar uma mudança e buscar apoio'],
    },
  },
  {
    code: 'C13', id: 'crs_gujuaiykqcsl2n31', oldTitle: 'Comece bem: seus primeiros passos no trabalho', title: 'Comecei a trabalhar',
    summary: 'Pratique os primeiros passos para aprender e ganhar autonomia.',
    lessons: {
      aula_01: ['Entenda antes de começar', 'Como confirmar a entrega, o prazo e quem orienta'],
      // aula_02 a aula_05 já são claros (verbo + o que se pratica): preservados
      aula_06: ['Proponha seu próximo passo', 'Proponha uma oportunidade de aprender'],
    },
  },
  {
    code: 'C14', id: 'crs_hvvgkvtd1rb2um0l', oldTitle: 'Primeira Vaga', title: 'Minha primeira vaga',
    summary: 'Prepare seu currículo, procure oportunidades e pratique entrevistas.',
    lessons: {
      aula_01: ['Você tem mais experiência do que imagina', 'Como reconhecer experiências que entram no currículo'],
      aula_02: ['Lendo uma vaga sem medo', 'Como ler uma vaga e decidir se candidatar'],
      aula_03: ['Onde achar vagas, e como fugir de golpes', 'Como procurar vagas e reconhecer golpes'],
      // aula_04 "Currículo de uma página": já claro, preservado
      aula_05: ['LinkedIn em 20 minutos', 'Prepare seu perfil profissional'],
      aula_06: ['A mensagem que abre portas', 'Como escrever uma mensagem para pedir uma conversa'],
      aula_07: ['O caminho de um processo seletivo', 'Como se organizar nas etapas do processo seletivo'],
      aula_08: ['Dinâmica de grupo', 'Como participar de uma dinâmica de grupo'],
      aula_09: ['"Fale sobre você" em um minuto', 'Como responder "fale sobre você"'],
      aula_10: ['Conte histórias, não adjetivos', 'Como contar o que você fez, com exemplos'],
      aula_11: ['Perguntas que dão frio na barriga', 'Como responder perguntas difíceis da entrevista'],
      aula_12: ['Entrevista online, suas perguntas e o depois', 'Prepare a entrevista e os próximos passos'],
    },
  },
];

/** Aplica o que falta no documento (já clonado). Devolve as mudanças feitas e os pulos. */
export function applySpec(doc: CourseDocument, spec: CourseSpec): { changes: string[]; skipped: string[] } {
  const changes: string[] = [];
  const skipped: string[] = [];
  const set = <T extends Record<string, unknown>>(obj: T, key: keyof T & string, label: string, oldValue: string | undefined, next: string, guard: boolean) => {
    const cur = obj[key] as unknown as string | undefined;
    if (cur === next) return;
    if (guard && cur !== oldValue) { skipped.push(`${label}: "${cur}" não é o texto antigo nem o novo (outra edição); mantido`); return; }
    (obj as Record<string, unknown>)[key] = next;
    changes.push(`${label}: "${cur ?? ''}" → "${next}"`);
  };
  set(doc as unknown as Record<string, unknown>, 'title', 'curso', spec.oldTitle, spec.title, true);
  // resumo do aluno e frase do curso: sempre o texto da especificação (a ficha e o card leem o resumo)
  set(doc as unknown as Record<string, unknown>, 'learnerSummary', 'resumo do aluno', undefined, spec.summary, false);
  set(doc.branding as unknown as Record<string, unknown>, 'tagline', 'frase do curso', undefined, spec.summary, false);
  set(doc.branding as unknown as Record<string, unknown>, 'wordmark', 'wordmark', undefined, spec.title, false);
  const lessons = new Map(doc.modules.flatMap((m) => m.lessons).map((l) => [l.id, l]));
  for (const [lessonId, [oldT, newT]] of Object.entries(spec.lessons)) {
    const l = lessons.get(lessonId);
    if (!l) { skipped.push(`aula ${lessonId}: não existe no rascunho`); continue; }
    set(l as unknown as Record<string, unknown>, 'title', `aula ${lessonId}`, oldT, newT, true);
  }
  return { changes, skipped };
}

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  let total = 0;
  try {
    for (const spec of SPECS) {
      let done = false;
      for (let attempt = 1; attempt <= 8 && !done; attempt++) {
        const d = await getDraft(db, spec.id);
        if (!d) { console.log(`[${spec.code}] ${spec.id}: rascunho não encontrado`); break; }
        const doc = structuredClone(d.document) as CourseDocument;
        const { changes, skipped } = applySpec(doc, spec);
        if (attempt === 1) {
          console.log(`[${spec.code}] ${spec.oldTitle} → ${spec.title}`);
          for (const c of changes) console.log(`   ${c}`);
          for (const s of skipped) console.log(`   PULADO ${s}`);
          if (!changes.length) console.log('   (nada a fazer)');
        }
        if (!changes.length || !APPLY) { done = true; break; }
        try {
          const saved = await saveDraft(db, { courseId: spec.id, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `nomes finais: ${changes.length} texto(s)` });
          console.log(`   gravado: rascunho ${d.revision} → ${saved.revision}`);
          total += changes.length;
          done = true;
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== 'CONFLICT' || attempt === 8) throw e;
          console.log(`   conflito de revisão (tentativa ${attempt}); relendo`);
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    }
    console.log(APPLY ? `\nFeito: ${total} texto(s) gravados.` : '\nDry-run: nada foi gravado (use --apply).');
  } finally {
    await close();
  }
}

if (process.argv[1]?.endsWith('nomes-finais.ts')) main().catch((e) => { console.error(`[nomes-finais] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
