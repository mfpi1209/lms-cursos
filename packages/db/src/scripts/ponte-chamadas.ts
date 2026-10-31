/**
 * Ponte vídeo → pergunta (pedido do autor, 2026-10-30, opção A): em cada decisão
 * dos cursos Primeira Vaga e Comece bem, a instrutora passa a CHAMAR o aluno no
 * fim do vídeo que vem antes ("Agora é com você: …").
 *
 * Edita o RASCUNHO direto (sem reimportar, para não perder vídeos pagos):
 *  - grava `bridge.call` em cada decisão;
 *  - acrescenta a chamada como PLANO FINAL do vídeo anfitrião (cena dirigida) ou
 *    no fim da fala (vídeo de plano único, ex.: as perguntas lidas pelo Rafael);
 *  - marca a mídia desses vídeos como desatualizada (o vídeo antigo continua
 *    tocando até a regravação ser aprovada e feita).
 * NADA é gravado nem cobrado aqui. A regravação é feita depois, no estúdio, pelo
 * orçamento (só os planos novos são cobrados nas cenas dirigidas).
 *
 * Uso (raiz do monorepo):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/ponte-chamadas.ts            # só mostra
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/ponte-chamadas.ts --apply    # grava
 */
import { applyCallsToGraph, compileCourse, CourseDocumentSchema, type ChoiceNode, type CourseDocument } from '@lms/course-schema';
import { createDb } from '../client';
import { getDraft, saveDraft } from '../repositories/authoring';

/** Chamadas por curso e decisão (até 16 palavras; olham para a frente: o aluno ainda vai ler a situação). */
export const CALLS: Record<string, Record<string, string>> = {
  // Primeira Vaga (Marina)
  crs_hvvgkvtd1rb2um0l: {
    q01: 'Agora é com você: veja esta situação e decida se ela entra no currículo.',
    q02: 'Sua vez: leia a situação e escolha que habilidade ela mostra.',
    q03: 'Agora é com você: leia esta vaga e decida se vale se candidatar.',
    q04: 'Sua vez: com pouco tempo, que parte da vaga você leria primeiro?',
    q05: 'Agora é com você: se fosse procurar estágio hoje, por onde você começaria?',
    q06: 'Sua vez: chegou uma mensagem de vaga. Veja os sinais e decida o que fazer.',
    q07: 'Agora é com você: escolha a linha de currículo mais forte.',
    q08: 'Sua vez: seu currículo passou de uma página. Escolha o que você tiraria.',
    q09: 'Agora é com você: escolha a foto que você usaria no perfil.',
    q10: 'Sua vez: escolha o título que você colocaria no seu perfil.',
    q11: 'Agora é com você: escolha a mensagem que você mandaria.',
    q12: 'Sua vez: a pessoa não respondeu. Escolha o que você faria.',
    q13: 'Agora é com você: chegou o convite para um teste online. Quando você faz?',
    q14: 'Sua vez: o tempo está acabando e você travou. Escolha o que fazer.',
    q15: 'Agora é com você: o grupo travou. Escolha o que você faria.',
    q17: 'Sua vez: escolha a apresentação que funciona melhor.',
    q18: 'Agora é com você: deu branco no meio da fala. O que você faz?',
    q19: 'Sua vez: leia o começo desta história e escolha o melhor final.',
    q20: 'Agora é com você: escolha a frase que mostra melhor a sua parte.',
    q21: 'Sua vez: escolha como você responderia sobre o seu ponto fraco.',
    q22: 'Agora é com você: por que você quer trabalhar aqui? Escolha a melhor resposta.',
    q23: 'Sua vez: perguntaram quanto você espera de bolsa. Escolha o que você diria.',
    q24: 'Agora é com você: escolha onde se posicionar para a entrevista online.',
    q25: 'Sua vez: a recrutadora pergunta se você tem alguma pergunta. Escolha a resposta.',
  },
  // Comece bem (Rafael): o vídeo da pergunta já lê a situação; a chamada fecha esse vídeo
  crs_gujuaiykqcsl2n31: {
    q01: 'Agora é com você: escolha a resposta que você daria.',
    q11: 'Sua vez: escolha a pergunta que você faria.',
    q02: 'Agora é com você: escolha como você confirmaria o combinado.',
    q03: 'Sua vez: escolha como você pediria ajuda.',
    q04: 'Agora é com você: escolha o que você faria com a orientação.',
    q05: 'Sua vez: escolha o compromisso que você assumiria.',
    q06: 'Agora é com você: escolha como você reagiria.',
    q07: 'Sua vez: escolha o que você faria para não repetir a falha.',
    q08: 'Agora é com você: escolha como você entenderia essa orientação.',
    q09: 'Sua vez: escolha a mudança que você faria.',
    q10: 'Agora é com você: escolha como você proporia essa oportunidade.',
  },
};

/** Aplica as chamadas no documento (puro): devolve o documento novo e o que mudou. */
export function applyCalls(doc: CourseDocument, calls: Record<string, string>): { document: CourseDocument; hosts: Array<{ lessonId: string; choiceId: string; hostId: string }>; missing: string[]; unknown: string[] } {
  const d = structuredClone(doc);
  const seen = new Set<string>();
  const hosts: Array<{ lessonId: string; choiceId: string; hostId: string }> = [];
  const missing: string[] = [];
  for (const m of d.modules) {
    for (const l of m.lessons) {
      for (const n of l.graph.nodes) {
        if (n.type !== 'choice') continue;
        const call = calls[n.id];
        if (!call) {
          missing.push(n.id);
          continue;
        }
        seen.add(n.id);
        (n as ChoiceNode).bridge = { ...(n as ChoiceNode).bridge, call };
      }
      const before = new Map(l.graph.nodes.map((n) => [n.id, n] as const));
      const { graph, changed } = applyCallsToGraph(l.graph, d.presentation.cameras);
      l.graph = { ...l.graph, nodes: graph.nodes };
      for (const hostId of changed) {
        const choice = l.graph.nodes.find((q) => q.type === 'choice' && q.bridge?.call && (q.id === hostId || l.graph.edges.some((e) => e.from === hostId && e.to === q.id)));
        hosts.push({ lessonId: l.id, choiceId: choice?.id ?? '?', hostId });
        if (!before.get(hostId)) throw new Error(`anfitrião ${hostId} sumiu`);
      }
    }
  }
  const unknown = Object.keys(calls).filter((id) => !seen.has(id));
  return { document: CourseDocumentSchema.parse(d), hosts, missing, unknown };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    for (const [courseId, calls] of Object.entries(CALLS)) {
      const draft = await getDraft(db, courseId);
      if (!draft) throw new Error(`rascunho ${courseId} não encontrado`);
      const { document, hosts, missing, unknown } = applyCalls(draft.document, calls);
      if (unknown.length) throw new Error(`${courseId}: decisões inexistentes no rascunho: ${unknown.join(', ')}`);
      if (missing.length) throw new Error(`${courseId}: decisões sem chamada: ${missing.join(', ')}`);
      const errorsBefore = compileCourse(draft.document).errors.length;
      const r = compileCourse(document);
      if (r.errors.length > errorsBefore) throw new Error(`${courseId}: a mudança criaria erros: ${r.errors.map((e) => e.message).join('; ')}`);
      const notSpoken = r.warnings.filter((w) => w.code === 'CALL_NOT_SPOKEN' || w.code === 'CHOICE_NO_CALL');
      console.log(`\n${document.title} (${courseId}) — rascunho rev ${draft.revision}`);
      console.log(`  ${Object.keys(calls).length} chamadas; ${hosts.length} vídeos ganham a chamada no fim:`);
      for (const h of hosts) {
        const node = document.modules.flatMap((m) => m.lessons).find((l) => l.id === h.lessonId)!.graph.nodes.find((n) => n.id === h.hostId)!;
        const how = 'direction' in node && node.direction ? `plano final (${node.direction.shots.length} planos)` : 'fim da fala (plano único: regrava inteiro)';
        console.log(`   ${h.lessonId} ${h.hostId} → ${h.choiceId}: ${how}`);
      }
      if (notSpoken.length) console.log(`  avisos restantes: ${notSpoken.map((w) => w.message).join(' | ')}`);
      if (!apply) continue;
      const saved = await saveDraft(db, { courseId, document, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'Ponte vídeo → pergunta: chamada da instrutora no fim do vídeo antes de cada decisão (vídeos marcados para regravar o trecho novo)' });
      console.log(`  gravado: rascunho ${draft.revision} → ${saved.revision}`);
    }
    if (!apply) console.log('\n(só leitura; rode com --apply para gravar)');
  } finally {
    await close();
  }
}

if (process.argv[1]?.endsWith('ponte-chamadas.ts')) main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
