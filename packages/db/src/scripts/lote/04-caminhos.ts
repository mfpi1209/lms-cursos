/**
 * Lote 04 (cópia do 03-caminhos.ts): percorre TODOS os caminhos de cada aula do rascunho no motor real
 * (@lms/course-engine), sem banco de escrita nem custo. Confere que toda
 * escolha leva a algum lugar e toda aula chega ao fim.
 */
import { applyIntent, createInitialState } from '@lms/course-engine';
import { createDb } from '../../client';
import { getDraft } from '../../repositories/authoring';

const COURSE = 'crs_4z17p0m6d43qxmmo';

function intentsFor(node: any): { label: string; intent: any }[] {
  switch (node.type) {
    case 'choice':
      return node.options.map((o: any) => ({ label: `${node.id}=${o.quality ?? ''}`, intent: { kind: 'choose', optionId: o.id } }));
    case 'reflection': {
      const sc = node.scaffold;
      const text = sc?.template ? String(sc.template).replace(/\{[^}]+\}/g, 'x') : 'Minha frase de teste para a missão.';
      return [{ label: `${node.id}=frase`, intent: { kind: 'reflect', text } }];
    }
    case 'assessment': {
      const opts = node.options ?? node.question?.options ?? [];
      return opts.map((o: any) => ({ label: `${node.id}=${o.correct ? 'certa' : 'errada'}`, intent: { kind: 'assess', optionIds: [o.id] } }));
    }
    default:
      return [{ label: '', intent: { kind: 'advance' } }];
  }
}

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    const draft = await getDraft(db, COURSE);
    const doc = draft!.document as any;
    let problems = 0;
    for (const m of doc.modules) for (const l of m.lessons) {
      const graph = l.graph;
      const byId = new Map(graph.nodes.map((n: any) => [n.id, n]));
      const ends = new Map<string, number>();
      const visited = new Set<string>();
      let paths = 0;
      const stack: { state: any; trail: string[] }[] = [{ state: createInitialState(graph), trail: [] }];
      while (stack.length) {
        const { state, trail } = stack.pop()!;
        if (trail.length > 60) { problems++; console.log(`  LAÇO? ${trail.join(' > ')}`); continue; }
        visited.add(state.currentNodeId);
        if (state.status === 'completed') { paths++; ends.set(state.currentNodeId, (ends.get(state.currentNodeId) ?? 0) + 1); continue; }
        const node: any = byId.get(state.currentNodeId);
        for (const { label, intent } of intentsFor(node)) {
          try {
            const step: any = applyIntent(graph, state, intent);
            if (!step.transitioned && step.state.currentNodeId === state.currentNodeId && step.state.status !== 'completed') {
              // ficou na mesma cena (ex.: nova tentativa da avaliação): segue explorando, com limite de profundidade
            }
            stack.push({ state: step.state, trail: label ? [...trail, label] : trail });
          } catch (e: any) {
            problems++;
            console.log(`  ERRO em ${node.id} (${label}): ${e.message}`);
          }
        }
      }
      const unreached = graph.nodes.filter((n: any) => !visited.has(n.id)).map((n: any) => n.id);
      console.log(`${l.id} "${l.title}": ${paths} caminhos completos; fins ${[...ends].map(([k, v]) => `${k}×${v}`).join(', ')}; cenas nunca alcançadas: ${unreached.join(', ') || 'nenhuma'}`);
    }
    console.log(problems ? `PROBLEMAS: ${problems}` : 'OK: todo caminho termina');
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
