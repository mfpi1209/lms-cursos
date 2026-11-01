/**
 * Robô de QA (31/10, achado "Missão não anunciada": C09·A2, C11·A2, C14·A6, C14·A9, C14·A11): a revisão final (31/10) tirou da
 * abertura a frase "No fim desta aula, tem uma missão para você: …" (`media.adjust.drop: ['missao']`), porque ela cortava o
 * raciocínio da fala. Sem regravar, a menor correção é a ponte escrita da própria atividade (`intro` da reflexão, que aparece
 * no topo do "Na prática"): passa a abrir com "Esta é a missão da aula." Não promete "no fim": em C14·A6 a atividade fica no
 * meio de propósito. Só `intro`; não toca mídia nem cortes.
 *   DATABASE_URL=… ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/qa-ponte-missao.ts [--dry-run | --apply] [--saida arq.json]
 */
import { argumentos, rodar, type Mudanca } from './_rascunho-qa';

const MUDANCAS: Mudanca[] = [
  {"codigo": "P036", "courseId": "crs_gjn468p3y6hwua4f", "lessonId": "aula_02", "nodeId": "m02", "campo": "intro", "de": "Você viu que, se algo escapou, o caminho é parar a divulgação e avisar. Agora monte o seu aviso.", "para": "Esta é a missão da aula. Você viu que, se algo escapou, o caminho é parar a divulgação e avisar. Agora monte o seu aviso."},
  {"codigo": "P050", "courseId": "crs_u4nfw88a4n2n0ubv", "lessonId": "aula_02", "nodeId": "m02", "campo": "intro", "de": "Você viu que orientações diferentes se resolvem confirmando qual vale. Agora monte a pergunta para esclarecer a sua.", "para": "Esta é a missão da aula. Você viu que orientações diferentes se resolvem confirmando qual vale. Agora monte a pergunta para esclarecer a sua."},
  {"codigo": "P104", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_06", "nodeId": "m05", "campo": "intro", "de": "Você viu que uma mensagem curta e um pedido simples abrem conversas. Agora monte a sua mensagem.", "para": "Esta é a missão da aula. Você viu que uma mensagem curta e um pedido simples abrem conversas. Agora monte a sua mensagem."},
  {"codigo": "P115", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_09", "nodeId": "m08", "campo": "intro", "de": "Você viu que a apresentação cabe em três frases ligadas à vaga. Agora monte a sua.", "para": "Esta é a missão da aula. Você viu que a apresentação cabe em três frases ligadas à vaga. Agora monte a sua."},
  {"codigo": "P125", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_11", "nodeId": "m10", "campo": "intro", "de": "Você viu que um ponto a melhorar convence quando é real e tem uma ação. Agora monte o seu.", "para": "Esta é a missão da aula. Você viu que um ponto a melhorar convence quando é real e tem uma ação. Agora monte o seu."},
];

const { apply, saida } = argumentos('docs/qa/lancamento/robo/correcoes-missao.antes-depois.json');
rodar({ rotulo: 'qa-missao', mudancas: MUDANCAS, apply, saida, nota: 'QA do robô: ponte da missão' }).catch((e) => {
  console.error(`[qa-missao] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
