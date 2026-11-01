/**
 * Decisão do dono (31/10, item 5 de decisoes-linha-de-base.md): as opções que são escolha de item, fala dirigida a alguém ou
 * continuação de frase ficam aceitas como exceção à 1ª pessoa. Este script DESFAZ `qa-opcoes-primeira-pessoa.ts` (13 opções
 * apontadas + 5 "irmãs"): devolve ao RASCUNHO os 18 rótulos originais, tirados de
 * docs/qa/lancamento/robo/correcoes-opcoes.antes-depois.json (campo `antes`; copiados aqui para o script não depender do arquivo).
 *
 * Só `options[].label`: o diff de `_rascunho-qa.ts` aborta qualquer outro caminho. Idempotente (o que já está no rótulo original é pulado;
 * o que não bate com o texto "Eu…" nem com o original — alguém editou — é listado e não é tocado). Conflito de revisão: relê e tenta de novo.
 * Confere também que o conjunto de cenas desatualizadas (`media.stale` ou apresentação) é o mesmo antes e depois, em cada curso.
 * Sem `--apply` (ou com `--dry-run`) não grava nada no banco.
 *   DATABASE_URL=… ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/qa-opcoes-primeira-pessoa-reverter.ts [--dry-run | --apply] [--saida arq.json]
 */
import { createDb } from '../../client';
import { getDraft } from '../../repositories/authoring';
import { argumentos, cenasStale, rodar, type Mudanca } from './_rascunho-qa';
import type { CourseDocument } from '@lms/course-schema';

/** `de` = o texto "Eu…" que o script de 1ª pessoa gravou; `para` = o rótulo original */
const MUDANCAS: Mudanca[] = [
  {"codigo": "P323", "courseId": "crs_gujuaiykqcsl2n31", "lessonId": "aula_01", "nodeId": "q11", "campo": "label", "optionId": "a", "de": "“Eu pergunto como ela quer a lista e até que horas.”", "para": "“Como você quer a lista e até que horas?”"},
  {"codigo": "P324", "courseId": "crs_gujuaiykqcsl2n31", "lessonId": "aula_01", "nodeId": "q11", "campo": "label", "optionId": "b", "de": "“Eu pergunto se tem um jeito certo de fazer essa lista.”", "para": "“Tem algum jeito certo de fazer essa lista?”"},
  {"codigo": "irmã", "courseId": "crs_gujuaiykqcsl2n31", "lessonId": "aula_01", "nodeId": "q11", "campo": "label", "optionId": "c", "de": "“Eu digo que pode deixar e que chamo depois, se precisar.”", "para": "“Pode deixar, qualquer coisa eu te chamo depois.”"},
  {"codigo": "irmã", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_05", "nodeId": "q10", "campo": "label", "optionId": "a", "de": "“Eu coloco ‘Estudante de Administração · Buscando estágio em finanças’.”", "para": "“Estudante de Administração · Buscando estágio em finanças”"},
  {"codigo": "P393", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_05", "nodeId": "q10", "campo": "label", "optionId": "b", "de": "“Eu coloco ‘Sem experiência, mas com muita vontade de aprender’.”", "para": "“Sem experiência, mas com muita vontade de aprender”"},
  {"codigo": "irmã", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_05", "nodeId": "q10", "campo": "label", "optionId": "c", "de": "“Eu coloco ‘Futuro CEO apaixonado por desafios e inovação’.”", "para": "“Futuro CEO apaixonado por desafios e inovação”"},
  {"codigo": "P402", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_06", "nodeId": "q11", "campo": "label", "optionId": "a", "de": "“Oi! Eu vi seu perfil. Tem alguma vaga aberta aí no hospital?”", "para": "“Oi! Vi seu perfil. Tem alguma vaga aberta aí no hospital?”"},
  {"codigo": "P425", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_10", "nodeId": "q19", "campo": "label", "optionId": "a", "de": "“Eu fecho com: ‘...e a feira aconteceu com 42 expositores e ainda sobrou dinheiro.’”", "para": "“...e a feira aconteceu com 42 expositores e ainda sobrou dinheiro.”"},
  {"codigo": "P426", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_10", "nodeId": "q19", "campo": "label", "optionId": "b", "de": "“Eu fecho com: ‘...e foi uma experiência muito legal para todo mundo.’”", "para": "“...e foi uma experiência muito legal para todo mundo.”"},
  {"codigo": "irmã", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_10", "nodeId": "q19", "campo": "label", "optionId": "c", "de": "“Eu fecho com: ‘...e acho que todo mundo gostou do meu trabalho.’”", "para": "“...e acho que todo mundo gostou do meu trabalho.”"},
  {"codigo": "P427", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_10", "nodeId": "q20", "campo": "label", "optionId": "a", "de": "“Eu e o grupo fizemos tudo junto e deu muito certo.”", "para": "“A gente fez tudo junto e deu muito certo.”"},
  {"codigo": "P428", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_10", "nodeId": "q20", "campo": "label", "optionId": "c", "de": "“Eu estava num grupo ótimo, então foi tudo fácil.”", "para": "“O grupo era ótimo, então foi tudo fácil.”"},
  {"codigo": "P433", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_11", "nodeId": "q22", "campo": "label", "optionId": "c", "de": "“Porque eu quero trabalhar numa empresa grande e muito conhecida.”", "para": "“Porque é uma empresa grande e muito conhecida.”"},
  {"codigo": "P439", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_12", "nodeId": "q24", "campo": "label", "optionId": "a", "de": "“Eu fico de frente para a janela, com a parede lisa atrás.”", "para": "“De frente para a janela, com a parede lisa atrás.”"},
  {"codigo": "P440", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_12", "nodeId": "q24", "campo": "label", "optionId": "b", "de": "“Eu fico de costas para a janela, que tem uma vista bonita.”", "para": "“De costas para a janela, que tem uma vista bonita.”"},
  {"codigo": "irmã", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_12", "nodeId": "q24", "campo": "label", "optionId": "c", "de": "“Eu me deito na cama e seguro o celular na mão.”", "para": "“Deitado na cama, segurando o celular na mão.”"},
  {"codigo": "P441", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_12", "nodeId": "q25", "campo": "label", "optionId": "a", "de": "“Eu pergunto como é um dia normal de quem trabalha nessa vaga.”", "para": "“Como é um dia normal de quem trabalha nessa vaga?”"},
  {"codigo": "P442", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_12", "nodeId": "q25", "campo": "label", "optionId": "c", "de": "“Eu pergunto como funcionam os horários e as folgas nesta vaga.”", "para": "“Como funcionam os horários e as folgas nesta vaga?”"},
];

async function stales(): Promise<Record<string, string[]>> {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    const out: Record<string, string[]> = {};
    for (const courseId of new Set(MUDANCAS.map((m) => m.courseId))) {
      const d = await getDraft(db, courseId);
      if (!d) throw new Error(`rascunho de ${courseId} não encontrado`);
      out[courseId] = cenasStale(d.document as CourseDocument);
    }
    return out;
  } finally {
    await close();
  }
}

const { apply, saida } = argumentos('docs/qa/lancamento/robo/correcoes-opcoes-reversao.antes-depois.json');
(async () => {
  const antes = await stales();
  await rodar({ rotulo: 'qa-opcoes-reverter', mudancas: MUDANCAS, apply, saida, nota: 'Decisão do dono (item 5): opções voltam ao rótulo original' });
  const depois = await stales();
  const iguais = JSON.stringify(antes) === JSON.stringify(depois);
  console.log(`[qa-opcoes-reverter] cenas desatualizadas por curso, antes e depois: ${iguais ? 'iguais' : 'DIFERENTES'} (${Object.entries(antes).map(([c, v]) => `${c.slice(-4)}:${v.length}→${depois[c]?.length}`).join(' ')})`);
  if (!iguais) {
    console.error('[qa-opcoes-reverter] ATENÇÃO: o conjunto de cenas desatualizadas mudou (pode ser a gravação de mídia em paralelo); confira.');
    process.exit(2);
  }
})().catch((e) => {
  console.error(`[qa-opcoes-reverter] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
