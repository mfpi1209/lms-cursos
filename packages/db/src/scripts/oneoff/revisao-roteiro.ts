/**
 * Revisão de roteiro (pedido do autor, 31/10: "aprovo até USD50"): falas mais naturais e ligadas.
 * Edita o RASCUNHO (nada é gravado aqui; a regravação vem depois, pelo orçamento, só dos planos novos):
 *  - abertura de cada aula: "Nesta aula, você vai X." → "Agora, vamos X." (1ª aula: "Oi! Eu sou … Hoje, vamos X.");
 *  - 1ª aula: plano novo de boas-vindas com o que o aluno leva (SEM promessa de selo: o Selo DNA Work é da TRILHA,
 *    não do curso; a frase de selo por curso que este script inseria foi retirada na auditoria de 31/10);
 *  - aula com missão: plano novo avisando a missão logo depois da abertura;
 *  - chamadas: o fato da situação + "Agora, responda: <pergunta>" (cartões aprovados).
 * Os vídeos mexidos ficam desatualizados (o antigo continua tocando até a regravação).
 *
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/revisao-roteiro.ts <perguntas.json> <cartoes.json> <saída.md> [--apply] <curso>…
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { applyCallsToGraph, type CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

/** Boas-vindas (o que o aluno leva), escritas a partir dos objetivos de cada curso. */
const WELCOME: Record<string, string> = {
  crs_99hpdsc8w88osiuh: 'Ao final do curso, você chega no primeiro dia sabendo o que confirmar e como avisar um imprevisto.',
  crs_arbeohlw3xp5v3zx: 'Ao final do curso, você sabe confirmar a roupa certa e o que dizer quando não tiver a peça pedida.',
  crs_hd4jnnpx3oj0xf14: 'Ao final do curso, você sabe quando o celular ajuda no trabalho e como combinar recados importantes.',
  crs_4z17p0m6d43qxmmo: 'Ao final do curso, você escreve mensagens de trabalho claras e acompanha um pedido sem pressionar ninguém.',
  crs_4tj8a3q3g9gudgb7: 'Ao final do curso, você planeja sua chegada com folga e avisa uma mudança de horário do jeito certo.',
  crs_b8zeh4b2gguseghq: 'Ao final do curso, você participa das brincadeiras respeitando limites e sabe dizer quando algo incomoda.',
  crs_bmf11akamtxoti28: 'Ao final do curso, você pede atenção na hora certa e apresenta uma diferença sem criar conflito.',
  crs_8g0csi2hflfztfge: 'Ao final do curso, você cuida dos espaços que divide com a equipe e avisa um problema sem improvisar.',
  crs_gjn468p3y6hwua4f: 'Ao final do curso, você confere uma foto antes de postar e sabe agir se algo indevido aparecer.',
  crs_q52zsimeeahpa9bq: 'Ao final do curso, você entrega uma tarefa com clareza e propõe o próximo passo sem passar por cima de ninguém.',
  crs_u4nfw88a4n2n0ubv: 'Ao final do curso, você pede exemplos para entender uma regra e resolve orientações diferentes sem chutar.',
  crs_5vccpfypr6fmxojb: 'Ao final do curso, você recebe uma correção com calma, entende o que mudar e sabe quando pedir apoio.',
  crs_gujuaiykqcsl2n31: 'Ao final das seis aulas, você começa no trabalho com mais segurança: entende pedidos, pede ajuda e cresce a cada experiência.',
  crs_hvvgkvtd1rb2um0l: 'Ao final das doze aulas, você tem currículo, perfil e preparo para a entrevista da sua primeira vaga.',
};

type Shot = { id: string; line: string; cameraId?: string; layout?: string; framing?: string; cameraMove?: string; motionPrompt?: string; transitionIn?: string };

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const [qFile, cFile, outFile, ...rest] = args.filter((a) => a !== '--apply');
const courses = rest;

const newShot = (id: string, line: string, like: Shot, gesture: string): Shot => ({ id, line, layout: 'presenter', framing: like.framing ?? 'medium', ...(like.cameraId ? { cameraId: like.cameraId } : {}), cameraMove: 'static', motionPrompt: gesture, transitionIn: 'cut' });
const lc = (t: string) => t.charAt(0).toLocaleLowerCase('pt-BR') + t.slice(1);
/** missões com nome de substantivo ("sua mensagem") viram uma ação falada, como as demais ("confirme sua chegada") */
const MISSION_SPEECH: Record<string, string> = {
  'sua vaga-alvo': 'escolha sua vaga-alvo',
  'sua primeira experiência': 'conte sua primeira experiência',
  'sua mensagem': 'escreva sua mensagem',
  'sua linha de currículo': 'escreva sua linha de currículo',
  'sua história': 'conte sua história',
  'sua apresentação': 'prepare sua apresentação',
  'seu ponto a melhorar': 'escolha seu ponto a melhorar',
  'seu plano para o teste': 'monte seu plano para o teste',
  'seu papel na dinâmica': 'defina seu papel na dinâmica',
  'seu "sobre"': 'escreva o seu Sobre do LinkedIn',
};

/** "Nesta aula, você vai X." → "Agora, vamos X." (ou "Hoje, vamos X." na 1ª aula) */
function opening(line: string, first: boolean): string | null {
  const m = line.match(/^Nesta (última |primeira )?aula, você vai ([^.]+)\.(.*)$/s);
  if (!m) return null;
  const lead = m[1]?.startsWith('última') ? 'Agora, na última aula, vamos' : m[1]?.startsWith('primeira') ? (/começar/.test(m[2]!) ? 'Primeiro, vamos' : 'Para começar, vamos') : first ? 'Hoje, vamos' : 'Agora, vamos';
  return `${lead} ${m[2]}.${m[3]}`.trim();
}

async function main() {
  const rows = JSON.parse(readFileSync(qFile!, 'utf8')) as Array<{ c: string; l: string; q: string }>;
  const cards = JSON.parse(readFileSync(cFile!, 'utf8')) as Record<string, [string, string]>;
  const callFor = new Map<string, string>();
  rows.forEach((r, i) => {
    const card = cards[String(i)];
    if (card) callFor.set(`${r.c}/${r.l}/${r.q}`, `${card[0]} Agora, responda: ${lc(card[1])}`);
  });
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const md: string[] = ['# Revisão de roteiro: falas novas (para aprovar antes de gravar)', ''];
  try {
    for (const courseId of courses) {
      const d = (await getDraft(db, courseId))!;
      const doc = structuredClone(d.document) as CourseDocument;
      md.push(`## ${doc.title}`, '');
      const lessons = doc.modules.flatMap((m) => m.lessons);
      let changes = 0;
      lessons.forEach((l, li) => {
        const node = l.graph.nodes.find((n) => n.type === 'scenario' || n.type === 'content') as unknown as { id: string; direction?: { shots: Shot[] }; media?: { stale?: boolean } } | undefined;
        const mission = l.graph.nodes.find((n) => n.type === 'reflection') as { title?: string } | undefined;
        if (!node?.direction) return;
        const shots = node.direction.shots;
        const log: string[] = [];
        // abertura
        const nameIdx = shots.findIndex((s) => /^(Oi[,!]? )?(que bom ter você aqui[.!] )?Eu sou [oa] /i.test(s.line) && s.id !== 'chamada');
        let anchor = 0;
        for (let i = 0; i < shots.length; i++) {
          const o = opening(shots[i]!.line, li === 0);
          if (!o) continue;
          // 1ª aula com a apresentação no mesmo plano: "Oi! Eu sou … Hoje, vamos X."
          const own = o.match(/^(Hoje, vamos [^.]+\.)\s*(Eu sou .+)$/s);
          let line = own ? `Oi! ${own[2]!.trim()} ${own[1]}` : o;
          // apresentação no plano seguinte (só o nome): junta aqui e tira o outro plano
          const next = shots[i + 1];
          if (li === 0 && !own && next && /^Eu sou [oa] [^.]+, (sua|seu) orientador[a]? [^.]*DNA Work\.$/i.test(next.line.trim())) {
            line = `Oi! ${next.line.trim()} ${o}`;
            log.push(`- **${node.id}/${next.id}** sai (a apresentação foi para o plano de abertura)`);
            shots.splice(i + 1, 1);
          }
          log.push(`- **${node.id}/${shots[i]!.id}** abertura: “${line}”`);
          shots[i]!.line = line;
          anchor = i;
          break;
        }
        // 1ª aula: os planos novos entram logo depois da apresentação ("Eu sou …"), antes do caso
        if (li === 0 && nameIdx >= 0 && nameIdx < anchor) anchor = nameIdx;
        // novos planos logo depois da abertura: boas-vindas (1ª aula) e aviso da missão
        const like = shots[Math.max(0, anchor)]!;
        const add: Shot[] = [];
        if (li === 0 && WELCOME[courseId] && !shots.some((s) => s.id === 'boasvindas')) add.push(newShot('boasvindas', WELCOME[courseId], like, 'smiles warmly and opens both palms'));
        if (mission?.title && !shots.some((s) => s.id === 'missao')) {
          const name = lc(mission.title.replace(/^miss[aã]o\s*:\s*/i, '').trim());
          const spoken = MISSION_SPEECH[name.toLocaleLowerCase('pt-BR')] ?? name;
          add.push(newShot('missao', `No fim desta aula, tem uma missão para você: ${spoken}. Ela fica salva no seu roteiro.`, like, 'leans in slightly, curious'));
        }
        if (add.length) {
          shots.splice(Math.max(0, anchor) + 1, 0, ...add);
          for (const s of add) log.push(`- **${node.id}/${s.id}** novo: “${s.line}”`);
        }
        if (log.length) {
          if (node.media) node.media.stale = true;
          changes += log.length;
          md.push(`**${l.title}**`, ...log, '');
        }
        // chamadas: fato + "Agora, responda: …"
        for (const n of l.graph.nodes) {
          if (n.type !== 'choice') continue;
          const call = callFor.get(`${courseId}/${l.id}/${n.id}`);
          const c = n as unknown as { bridge?: { call?: string } };
          if (!call || c.bridge?.call === call) continue;
          c.bridge = { ...(c.bridge ?? {}), call };
          md.push(`- **chamada ${n.id}**: “${call}”`);
          changes++;
        }
        const synced = applyCallsToGraph(l.graph, doc.presentation.cameras);
        l.graph = synced.graph as typeof l.graph;
        // a chamada nova SUBSTITUI a antiga (withCall acrescenta "chamada_2"): o plano "chamada" fica com a fala nova
        // e a fala da cena passa a ser a soma dos planos (senão a direção fica "desatualizada" e não grava)
        for (const n of l.graph.nodes as unknown as Array<{ id: string; narration?: string; direction?: { shots: Shot[] }; media?: { stale?: boolean } }>) {
          const sh = n.direction?.shots;
          if (!sh?.length) continue;
          const extra = sh.filter((s) => /^chamada_\d+$/.test(s.id));
          const base = sh.find((s) => s.id === 'chamada');
          if (extra.length && base) {
            base.line = extra[extra.length - 1]!.line;
            n.direction!.shots = sh.filter((s) => !extra.includes(s));
            md.push(`- **${n.id}/chamada** troca a fala antiga pela nova (sem plano duplicado)`);
            changes++;
          }
          const joined = n.direction!.shots.map((s) => s.line.trim()).join(' ');
          const words = (t: string) => t.toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
          if (words(n.narration ?? '') !== words(joined)) {
            n.narration = joined;
            if (n.media) n.media.stale = true;
            changes++;
          }
        }
      });
      md.push('');
      if (APPLY && changes) {
        const saved = await saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `revisão de roteiro: ${changes} fala(s) (abertura, boas-vindas, missão, chamadas)` });
        console.log(`[revisão] ${courseId}: ${changes} mudança(s); rascunho ${d.revision} → ${saved.revision}`);
      } else console.log(`[revisão] ${courseId}: ${changes} mudança(s)${APPLY ? '' : ' (só a lista)'}`);
    }
  } finally {
    writeFileSync(outFile!, md.join('\n'));
    await close();
  }
}

main().catch((e) => {
  console.error(`[revisão] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
