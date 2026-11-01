/**
 * REVERTIDO por decisão do dono (item 5): NÃO rode de novo. `qa-opcoes-primeira-pessoa-reverter.ts` devolveu os 18 rótulos originais.
 * Robô de QA (31/10, achado menor "Opção fora da 1ª pessoa"): no RASCUNHO, reescreve em 1ª pessoa ("Eu …") as opções
 * apontadas, mantendo o sentido e a qualidade (qual é a certa). Onde o texto é uma fala/peça a escolher (pergunta ao
 * supervisor, título de perfil, final de história), usa "Eu pergunto …", "Eu coloco ‘…’", "Eu fecho com: ‘…’". As opções
 * vizinhas no mesmo molde (marcadas "irmã") mudam junto, para a pergunta não ficar com dois estilos.
 * Conferido: nenhuma reação gravada (`reaction.text` ou transcrição do vídeo) repete o rótulo literalmente, então nenhuma
 * foi deixada de fora por isso. Só o `label`: retornos, reações, qualidade, caminhos e mídia ficam como estão.
 *   DATABASE_URL=… ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/qa-opcoes-primeira-pessoa.ts [--dry-run | --apply] [--saida arq.json]
 */
import { argumentos, rodar, type Mudanca } from './_rascunho-qa';

const MUDANCAS: Mudanca[] = [
  {"codigo": "P323", "courseId": "crs_gujuaiykqcsl2n31", "lessonId": "aula_01", "nodeId": "q11", "campo": "label", "optionId": "a", "de": "“Como você quer a lista e até que horas?”", "para": "“Eu pergunto como ela quer a lista e até que horas.”"},
  {"codigo": "P324", "courseId": "crs_gujuaiykqcsl2n31", "lessonId": "aula_01", "nodeId": "q11", "campo": "label", "optionId": "b", "de": "“Tem algum jeito certo de fazer essa lista?”", "para": "“Eu pergunto se tem um jeito certo de fazer essa lista.”"},
  {"codigo": "irmã", "courseId": "crs_gujuaiykqcsl2n31", "lessonId": "aula_01", "nodeId": "q11", "campo": "label", "optionId": "c", "de": "“Pode deixar, qualquer coisa eu te chamo depois.”", "para": "“Eu digo que pode deixar e que chamo depois, se precisar.”"},
  {"codigo": "irmã", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_05", "nodeId": "q10", "campo": "label", "optionId": "a", "de": "“Estudante de Administração · Buscando estágio em finanças”", "para": "“Eu coloco ‘Estudante de Administração · Buscando estágio em finanças’.”"},
  {"codigo": "P393", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_05", "nodeId": "q10", "campo": "label", "optionId": "b", "de": "“Sem experiência, mas com muita vontade de aprender”", "para": "“Eu coloco ‘Sem experiência, mas com muita vontade de aprender’.”"},
  {"codigo": "irmã", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_05", "nodeId": "q10", "campo": "label", "optionId": "c", "de": "“Futuro CEO apaixonado por desafios e inovação”", "para": "“Eu coloco ‘Futuro CEO apaixonado por desafios e inovação’.”"},
  {"codigo": "P402", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_06", "nodeId": "q11", "campo": "label", "optionId": "a", "de": "“Oi! Vi seu perfil. Tem alguma vaga aberta aí no hospital?”", "para": "“Oi! Eu vi seu perfil. Tem alguma vaga aberta aí no hospital?”"},
  {"codigo": "P425", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_10", "nodeId": "q19", "campo": "label", "optionId": "a", "de": "“...e a feira aconteceu com 42 expositores e ainda sobrou dinheiro.”", "para": "“Eu fecho com: ‘...e a feira aconteceu com 42 expositores e ainda sobrou dinheiro.’”"},
  {"codigo": "P426", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_10", "nodeId": "q19", "campo": "label", "optionId": "b", "de": "“...e foi uma experiência muito legal para todo mundo.”", "para": "“Eu fecho com: ‘...e foi uma experiência muito legal para todo mundo.’”"},
  {"codigo": "irmã", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_10", "nodeId": "q19", "campo": "label", "optionId": "c", "de": "“...e acho que todo mundo gostou do meu trabalho.”", "para": "“Eu fecho com: ‘...e acho que todo mundo gostou do meu trabalho.’”"},
  {"codigo": "P427", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_10", "nodeId": "q20", "campo": "label", "optionId": "a", "de": "“A gente fez tudo junto e deu muito certo.”", "para": "“Eu e o grupo fizemos tudo junto e deu muito certo.”"},
  {"codigo": "P428", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_10", "nodeId": "q20", "campo": "label", "optionId": "c", "de": "“O grupo era ótimo, então foi tudo fácil.”", "para": "“Eu estava num grupo ótimo, então foi tudo fácil.”"},
  {"codigo": "P433", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_11", "nodeId": "q22", "campo": "label", "optionId": "c", "de": "“Porque é uma empresa grande e muito conhecida.”", "para": "“Porque eu quero trabalhar numa empresa grande e muito conhecida.”"},
  {"codigo": "P439", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_12", "nodeId": "q24", "campo": "label", "optionId": "a", "de": "“De frente para a janela, com a parede lisa atrás.”", "para": "“Eu fico de frente para a janela, com a parede lisa atrás.”"},
  {"codigo": "P440", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_12", "nodeId": "q24", "campo": "label", "optionId": "b", "de": "“De costas para a janela, que tem uma vista bonita.”", "para": "“Eu fico de costas para a janela, que tem uma vista bonita.”"},
  {"codigo": "irmã", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_12", "nodeId": "q24", "campo": "label", "optionId": "c", "de": "“Deitado na cama, segurando o celular na mão.”", "para": "“Eu me deito na cama e seguro o celular na mão.”"},
  {"codigo": "P441", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_12", "nodeId": "q25", "campo": "label", "optionId": "a", "de": "“Como é um dia normal de quem trabalha nessa vaga?”", "para": "“Eu pergunto como é um dia normal de quem trabalha nessa vaga.”"},
  {"codigo": "P442", "courseId": "crs_hvvgkvtd1rb2um0l", "lessonId": "aula_12", "nodeId": "q25", "campo": "label", "optionId": "c", "de": "“Como funcionam os horários e as folgas nesta vaga?”", "para": "“Eu pergunto como funcionam os horários e as folgas nesta vaga.”"},
];

const { apply, saida } = argumentos('docs/qa/lancamento/robo/correcoes-opcoes.antes-depois.json');
rodar({ rotulo: 'qa-opcoes', mudancas: MUDANCAS, apply, saida, nota: 'QA do robô: opções em 1ª pessoa' }).catch((e) => {
  console.error(`[qa-opcoes] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
