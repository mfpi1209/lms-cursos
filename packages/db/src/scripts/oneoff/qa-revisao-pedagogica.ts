/**
 * Revisão pedagógica da Fable (31/10; docs/qa/revisao-pedagogica/fable.md e fable.json): aplica no RASCUNHO os itens
 * "só texto" com `acao: aplicar` (P4–P7, P24–P34) e, no código, as checagens finais das trilhas (P9–P23 e P30).
 *
 * NÃO faz (decisão do dono ou exige gravar fala nova): P3 (cadastro na DNA Work), P35 (duas fortes), P8 (só verificar o áudio).
 * P1 e P2 (vídeo) têm scripts próprios: qa-p1-devolver-s3.ts (rascunho) e apps/worker/src/scripts/qa-p2-cortar-agente.ts (corte de áudio).
 *
 * Rascunho (cursos):
 *  - cada troca confere que o texto atual é o `de` (o que a revisão viu); se não bater, não troca e lista como "divergente";
 *  - o diff entre o documento lido e o gravado só pode conter os caminhos desta lista (nem um a mais, nem um a menos);
 *    qualquer outro aborta sem gravar. Nada de narração, fala de reação, `bridge`, direção, mídia, `media.adjust`;
 *  - texto ligado a fala gravada: se o `de` aparece (normalizado) numa transcrição de vídeo, narração, chamada ou fala de reação do
 *    curso, a troca NÃO é feita (estado "ligado-a-fala") e vai para o relatório;
 *  - o conjunto de cenas desatualizadas (como o orçamento `media-jobs/quote` as enxerga: `media.stale` ou impressão da apresentação)
 *    precisa ser o mesmo antes e depois;
 *  - controle de revisão (`expectedRevision`); em conflito (o ajuste fino e a gravação também escrevem no rascunho) relê e tenta de novo.
 * Trilhas (packages/course-schema/src/trails.ts, conteúdo fixo em código; não há rascunho para elas): troca só `label`/`feedback` das
 * opções listadas, com o texto atual conferido; confere o resultado carregando o módulo de novo; relata se a correta ainda é a mais longa.
 *
 * Idempotente (o que já está no valor novo é pulado). Sem `--apply` (padrão, ou `--dry-run`) não grava nada. Nos dois casos escreve o
 * antes/depois em JSON (`--saida`).
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/qa-revisao-pedagogica.ts [--dry-run | --apply] [--saida arq.json]
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CourseDocumentSchema, TRAIL_CHECKS, reactionScenes, allLessons, type CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { DomainError } from '../../errors';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { argumentos, caminhosDiferentes, cenasStale } from './_rascunho-qa';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Seg = string | number | { id: string };

const C = {
  C01: 'crs_99hpdsc8w88osiuh', C02: 'crs_arbeohlw3xp5v3zx', C05: 'crs_4tj8a3q3g9gudgb7', C07: 'crs_bmf11akamtxoti28', C08: 'crs_8g0csi2hflfztfge',
  C11: 'crs_u4nfw88a4n2n0ubv', C12: 'crs_5vccpfypr6fmxojb', C13: 'crs_gujuaiykqcsl2n31', C14: 'crs_hvvgkvtd1rb2um0l', C21: 'crs_4jh683s5h351z2db', C24: 'crs_dp9s7pdro9j6e3m0',
} as const;

interface Troca {
  item: string;
  /** código legível para o relatório (C14·A5·fim_aula_05) */
  onde: string;
  courseId: string;
  aula?: string;
  no?: string;
  /** caminho a partir do nó (ou do documento, sem `aula`); `{id}` acha o elemento do array pelo id */
  caminho: Seg[];
  de: string;
  para: string;
  /** `de`/`para` são trechos do texto (aparecem uma vez); senão são o texto inteiro */
  trecho?: boolean;
}

/** texto do retorno (1 parágrafo, 1 trecho) de uma opção */
const retorno = (opt: string): Seg[] => ['options', { id: opt }, 'feedback', 'content', 0, 'content', 0, 'text'];
const slotOpcao = (slot: string, i: number): Seg[] => ['scaffold', 'slots', { id: slot }, 'options', i];
const checklist = (i: number): Seg[] => ['recap', { id: 'checklist' }, 'items', i];
const promptTexto: Seg[] = ['prompt', 'content', 0, 'content', 0, 'text'];

const TROCAS: Troca[] = [
  { item: 'P4', onde: 'C14·A5·fim_aula_05 checklist "Meu LinkedIn"', courseId: C.C14, aula: 'aula_05', no: 'fim_aula_05', caminho: checklist(3), de: 'dez conexões', para: 'primeiras conexões' },
  { item: 'P5', onde: 'C14·A12·fim_aula_12 checklist "Dia da entrevista"', courseId: C.C14, aula: 'aula_12', no: 'fim_aula_12', caminho: checklist(4), de: 'mensagem de agradecimento escrita', para: 'agradecimento enviado, se houver canal' },
  { item: 'P6', onde: 'C14·A12·q24·C retorno', courseId: C.C14, aula: 'aula_12', no: 'q24', caminho: retorno('c'),
    de: 'Apoie o aparelho e procure uma posição confortável que mantenha imagem e som estáveis. Adapte o enquadramento às suas condições.',
    para: 'Deitado e com o celular na mão, a imagem treme e o enquadramento fica estranho para quem entrevista. Faça assim: apoie o aparelho na altura dos olhos e, se puder, sente-se; adapte o enquadramento às suas condições.' },
  // P7 e P31–P34: o "Objetivo final" está em dois lugares do documento (descrição do curso e `brief.finalSkill`)
  { item: 'P7', onde: 'C02 descrição (Objetivo final)', courseId: C.C02, caminho: ['description'], trecho: true, de: 'a pessoa consegue consulta a orientação de vestimenta e combina alternativas', para: 'a pessoa consegue consultar a orientação de vestimenta e combinar alternativas' },
  { item: 'P7', onde: 'C02 brief.finalSkill', courseId: C.C02, caminho: ['brief', 'finalSkill'], de: 'Ao final, a pessoa consegue consulta a orientação de vestimenta e combina alternativas quando necessário.', para: 'Ao final, a pessoa consegue consultar a orientação de vestimenta e combinar alternativas quando necessário.' },
  { item: 'P31', onde: 'C05 descrição (Objetivo final)', courseId: C.C05, caminho: ['description'], trecho: true, de: 'consegue planejar a chegada e comunica atraso', para: 'consegue planejar a chegada e comunicar atraso' },
  { item: 'P31', onde: 'C05 brief.finalSkill', courseId: C.C05, caminho: ['brief', 'finalSkill'], de: 'Ao final, a pessoa consegue planejar a chegada e comunica atraso, intervalo ou ausência pelo canal combinado.', para: 'Ao final, a pessoa consegue planejar a chegada e comunicar atraso, intervalo ou ausência pelo canal combinado.' },
  { item: 'P32', onde: 'C07 descrição (Objetivo final)', courseId: C.C07, caminho: ['description'], trecho: true, de: 'contexto e apresenta uma discordância', para: 'contexto e apresentar uma discordância' },
  { item: 'P32', onde: 'C07 brief.finalSkill', courseId: C.C07, caminho: ['brief', 'finalSkill'], de: 'Ao final, a pessoa consegue pedir uma conversa com contexto e apresenta uma discordância respeitosa.', para: 'Ao final, a pessoa consegue pedir uma conversa com contexto e apresentar uma discordância respeitosa.' },
  { item: 'P33', onde: 'C11 descrição (Objetivo final)', courseId: C.C11, caminho: ['description'], trecho: true, de: 'pedir esclarecimento, compara informações diferentes e confirma a regra', para: 'pedir esclarecimento, comparar informações diferentes e confirmar a regra' },
  { item: 'P33', onde: 'C11 brief.finalSkill', courseId: C.C11, caminho: ['brief', 'finalSkill'], de: 'Ao final, a pessoa consegue pedir esclarecimento, compara informações diferentes e confirma a regra aplicável.', para: 'Ao final, a pessoa consegue pedir esclarecimento, comparar informações diferentes e confirmar a regra aplicável.' },
  { item: 'P34', onde: 'C12 descrição (Objetivo final)', courseId: C.C12, caminho: ['description'], trecho: true, de: 'pedir um exemplo de correção, combina uma mudança observável e busca apoio', para: 'pedir um exemplo de correção, combinar uma mudança observável e buscar apoio' },
  { item: 'P34', onde: 'C12 brief.finalSkill', courseId: C.C12, caminho: ['brief', 'finalSkill'], de: 'Ao final, a pessoa consegue pedir um exemplo de correção, combina uma mudança observável e busca apoio diante de desrespeito.', para: 'Ao final, a pessoa consegue pedir um exemplo de correção, combinar uma mudança observável e buscar apoio diante de desrespeito.' },
  // P24: o "exemplo" da revisão é a frase montada com a 1ª opção de cada lacuna (não é campo guardado)
  { item: 'P24', onde: 'C01·A2·m02 molde', courseId: C.C01, aula: 'aula_02', no: 'm02', caminho: ['scaffold', 'template'], de: 'Aconteceu {imprevisto}. Minha previsão está {previsao}. Vou {retorno}.', para: 'Aconteceu {imprevisto}. Minha previsão de chegada está {previsao}. Vou {retorno}.' },
  { item: 'P24', onde: 'C01·A2·m02 previsão #1', courseId: C.C01, aula: 'aula_02', no: 'm02', caminho: slotOpcao('previsao', 0), de: 'ainda indefinida', para: 'indefinida' },
  { item: 'P24', onde: 'C01·A2·m02 previsão #2', courseId: C.C01, aula: 'aula_02', no: 'm02', caminho: slotOpcao('previsao', 1), de: 'sujeita à retomada do transporte', para: 'presa à retomada do transporte' },
  { item: 'P24', onde: 'C01·A2·m02 previsão #3', courseId: C.C01, aula: 'aula_02', no: 'm02', caminho: slotOpcao('previsao', 2), de: 'dependente de uma nova rota', para: 'dependendo de uma nova rota' },
  { item: 'P25', onde: 'C13·A2·m02 instruções', courseId: C.C13, aula: 'aula_02', no: 'm02', caminho: promptTexto,
    de: 'Para aprender uma tarefa: observe um exemplo, anote o que importa, pratique dentro dos seus acessos e confira o resultado. Se precisar de ajuda, explique onde travou.',
    para: 'Antes de enviar, confira se a mensagem diz o que você está fazendo, o que já tentou e qual decisão precisa tomar. Se houver prazo, avise também.' },
  { item: 'P26', onde: 'C21·A2·q04·B rótulo', courseId: C.C21, aula: 'aula_02', no: 'q04', caminho: ['options', { id: 'b' }, 'label'],
    de: '“Para concluir A preciso de uma autorização; avanço em B. Podemos rever o prazo?”', para: '“Para concluir a tarefa 1 preciso de uma autorização; enquanto isso avanço na tarefa 2. Podemos rever o prazo?”' },
  { item: 'P26', onde: 'C21·A2·a02 situação #1', courseId: C.C21, aula: 'aula_02', no: 'a02', caminho: slotOpcao('situacao', 0), de: 'A depende de autorização', para: 'A tarefa 1 depende de autorização' },
  { item: 'P26', onde: 'C21·A2·a02 situação #2', courseId: C.C21, aula: 'aula_02', no: 'a02', caminho: slotOpcao('situacao', 1), de: 'A está esperando uma resposta', para: 'A tarefa 1 está esperando uma resposta' },
  { item: 'P26', onde: 'C21·A2·a02 situação #3', courseId: C.C21, aula: 'aula_02', no: 'a02', caminho: slotOpcao('situacao', 2), de: 'A precisa de material que ainda não chegou', para: 'A tarefa 1 precisa de material que ainda não chegou' },
  { item: 'P26', onde: 'C21·A2·a02 alternativa #1', courseId: C.C21, aula: 'aula_02', no: 'a02', caminho: slotOpcao('alternativa', 0), de: 'Enquanto isso posso avançar em B', para: 'Enquanto isso posso avançar na tarefa 2' },
  { item: 'P26', onde: 'C21·A2·a02 pedido #1', courseId: C.C21, aula: 'aula_02', no: 'a02', caminho: slotOpcao('pedido', 0), de: 'confirmar essa ordem e rever o prazo de A', para: 'confirmar essa ordem e rever o prazo da tarefa 1' },
  { item: 'P27', onde: 'C24·A2·a02 ponte', courseId: C.C24, aula: 'aula_02', no: 'a02', caminho: ['intro'],
    de: 'Você viu que algumas etapas dependem de uma confirmação. Agora monte um plano de quatro etapas, da primeira à última.',
    para: 'Você viu que algumas etapas dependem de uma confirmação. Agora monte um plano de quatro etapas: a primeira é o que precisa ser confirmado antes de começar.' },
  { item: 'P28', onde: 'C08·A2·m02 problema #2', courseId: C.C08, aula: 'aula_02', no: 'm02', caminho: slotOpcao('problema', 1), de: 'uma condição que precisa de avaliação', para: 'um cabo com a parte exposta' },
  { item: 'P28', onde: 'C08·A2·m02 problema #3', courseId: C.C08, aula: 'aula_02', no: 'm02', caminho: slotOpcao('problema', 2), de: 'um item que parece inadequado para uso', para: 'um equipamento que parece inseguro' },
  { item: 'P29', onde: 'C14·A9·m08 hoje #4', courseId: C.C14, aula: 'aula_09', no: 'm08', caminho: slotOpcao('hoje', 3), de: 'terminei os estudos', para: 'já concluí o ensino médio' },
];

/* ---------------- trilhas (conteúdo fixo em código) ---------------- */

interface TrocaTrilha {
  item: string;
  trilha: string;
  situacao: string;
  opcao: string;
  campo: 'label' | 'feedback';
  de: string;
  para: string;
}
const L = (item: string, trilha: string, situacao: string, opcao: string, de: string, para: string): TrocaTrilha => ({ item, trilha, situacao, opcao, campo: 'label', de, para });
const TROCAS_TRILHA: TrocaTrilha[] = [
  L('P9', 'primeiro-emprego', 'pe1', 'b', '“Respondo o e-mail confirmando horário, entrada e quem devo procurar.”', '“Confirmo por e-mail horário, entrada e quem procurar.”'),
  L('P9', 'primeiro-emprego', 'pe1', 'a', '“Chego cedo e pergunto na porta.”', '“Chego cedo e pergunto na porta a alguém que estiver passando.”'),
  L('P10', 'primeiro-emprego', 'pe4', 'c', '“Explico o que estou fazendo, o que já tentei e a mensagem de erro.”', '“Conto o que fiz, o que já tentei e o erro que aparece.”'),
  L('P10', 'primeiro-emprego', 'pe4', 'a', '“Digo que o sistema não funciona.”', '“Digo que o sistema não funciona e espero alguém consertar.”'),
  L('P11', 'primeiro-emprego', 'pe5', 'a', '“Aviso quem recebeu, digo o que está errado e proponho enviar a versão corrigida.”', '“Aviso quem recebeu o que está errado e mando a versão corrigida.”'),
  L('P11', 'primeiro-emprego', 'pe5', 'b', '“Corrijo no meu arquivo e não falo nada.”', '“Corrijo só no meu arquivo e espero alguém perguntar pela lista.”'),
  L('P12', 'imagem-e-postura', 'ip1', 'c', '“Pergunto se há orientação de roupa e de calçado para a área.”', '“Pergunto se há orientação de roupa e calçado.”'),
  L('P12', 'imagem-e-postura', 'ip1', 'a', '“Vou com a roupa que uso no dia a dia.”', '“Vou com a roupa que uso no dia a dia, que deve servir.”'),
  L('P13', 'imagem-e-postura', 'ip2', 'a', '“Aviso que só tenho a cinza-escura e pergunto se serve ou qual alternativa usar.”', '“Aviso que só tenho a cinza-escura e pergunto se serve.”'),
  L('P13', 'imagem-e-postura', 'ip2', 'b', '“Vou com a cinza e não falo nada.”', '“Vou com a cinza-escura e não comento nada com ninguém.”'),
  L('P13', 'imagem-e-postura', 'ip2', 'c', '“Falto no sábado.”', '“Falto no sábado para não aparecer com a roupa errada.”'),
  L('P14', 'imagem-e-postura', 'ip3', 'b', '“Pergunto em qual situação isso aconteceu e o que esperam que eu faça diferente.”', '“Pergunto em qual situação foi e o que esperam que eu faça.”'),
  L('P14', 'imagem-e-postura', 'ip3', 'a', '“Digo que vou melhorar e mudo tudo um pouco.”', '“Digo que vou melhorar e tento mudar um pouco de tudo.”'),
  L('P14', 'imagem-e-postura', 'ip3', 'c', '“Digo que sempre fui assim.”', '“Digo que sempre fui assim e que isso não vai mudar.”'),
  L('P15', 'imagem-e-postura', 'ip4', 'c', '“Digo com calma que posso conversar sobre a tarefa, mas não sobre esse comentário, e procuro a pessoa de referência.”', '“Digo que falo sobre a tarefa, não sobre esse comentário, e procuro apoio.”'),
  L('P15', 'imagem-e-postura', 'ip4', 'a', '“Respondo no mesmo tom.”', '“Respondo no mesmo tom, na frente de todo mundo.”'),
  L('P15', 'imagem-e-postura', 'ip4', 'b', '“Finjo que não ouvi e deixo pra lá.”', '“Finjo que não ouvi e deixo pra lá, para não criar clima.”'),
  L('P16', 'imagem-e-postura', 'ip5', 'b', '“Não posto essa foto e pergunto se posso tirar outra, com autorização de quem aparece.”', '“Não posto essa e tiro outra, com autorização de quem aparece.”'),
  L('P16', 'imagem-e-postura', 'ip5', 'c', '“Posto só para os amigos próximos.”', '“Posto só para os amigos próximos, que não vão espalhar.”'),
  L('P17', 'imagem-e-postura', 'ip6', 'a', '“Apago o vídeo, aviso o colega e sigo a orientação da empresa se precisar.”', '“Apago o vídeo, aviso o colega e sigo a orientação da empresa.”'),
  L('P17', 'imagem-e-postura', 'ip6', 'b', '“Deixo, porque já tem muitas visualizações.”', '“Deixo no ar, porque já tem muitas visualizações e ficou bom.”'),
  L('P18', 'rotina-e-combinados', 'rc1', 'a', '“Aviso que terminei, onde está o arquivo e o que ficou pendente.”', '“Aviso que terminei, onde está e o que ficou pendente.”'),
  L('P18', 'rotina-e-combinados', 'rc1', 'b', '“Não aviso: quem precisar vai achar na pasta.”', '“Não aviso: quem precisar vai achar o arquivo na pasta.”'),
  L('P18', 'rotina-e-combinados', 'rc1', 'c', '“Digo só ‘feito!’.”', '“Mando só ‘feito!’ no grupo e volto para outra tarefa.”'),
  L('P19', 'rotina-e-combinados', 'rc2', 'b', '“Pergunto um exemplo do que pode e do que não pode na minha função.”', '“Peço um exemplo do que pode e do que não pode no balcão.”'),
  L('P19', 'rotina-e-combinados', 'rc2', 'a', '“Faço como os colegas fazem.”', '“Faço como os colegas fazem, porque eles já conhecem a regra.”'),
  L('P19', 'rotina-e-combinados', 'rc2', 'c', '“Não uso o celular nunca, para não errar.”', '“Não uso o celular nunca no trabalho, para não errar.”'),
  L('P20', 'rotina-e-combinados', 'rc3', 'c', '“Conto as duas orientações a quem orienta meu trabalho e pergunto qual seguir.”', '“Mostro as duas orientações a quem me orienta e pergunto qual vale.”'),
  L('P20', 'rotina-e-combinados', 'rc3', 'a', '“Envio pelos dois caminhos, por garantia.”', '“Envio pelos dois caminhos, por garantia, e não pergunto nada.”'),
  L('P20', 'rotina-e-combinados', 'rc3', 'b', '“Escolho o que achar mais fácil.”', '“Escolho o caminho que achar mais fácil e envio logo.”'),
  L('P21', 'convivencia', 'cv1', 'b', '“Pergunto se ela tem um minuto, digo o assunto e que o prazo é hoje.”', '“Peço um minuto, digo o assunto e que o prazo é hoje.”'),
  L('P21', 'convivencia', 'cv1', 'a', '“Interrompo e falo tudo de uma vez.”', '“Interrompo na hora e falo tudo de uma vez, sem avisar.”'),
  L('P22', 'convivencia', 'cv2', 'c', '“Digo que entendi sexta e pergunto como podemos alinhar o prazo.”', '“Digo que entendi sexta e pergunto como alinhar o prazo.”'),
  L('P22', 'convivencia', 'cv2', 'a', '“Digo que ela está errada.”', '“Digo que ela está errada e que o prazo sempre foi sexta.”'),
  L('P22', 'convivencia', 'cv2', 'b', '“Faço correndo, sem comentar.”', '“Faço correndo, sem comentar a diferença com ninguém.”'),
  L('P23', 'convivencia', 'cv6', 'a', '“Digo com calma que prefiro que ele não comente minha roupa e, se continuar, procuro a pessoa de referência.”', '“Peço com calma que ele pare e, se continuar, procuro a pessoa de referência.”'),
  L('P23', 'convivencia', 'cv6', 'b', '“Rio junto para não criar clima.”', '“Rio junto para não criar clima e deixo passar mais uma vez.”'),
  L('P23', 'convivencia', 'cv6', 'c', '“Faço um comentário sobre a roupa dele também.”', '“Faço um comentário sobre a roupa dele também, para ele sentir.”'),
  { item: 'P30', trilha: 'convivencia', situacao: 'cv3', opcao: 'c', campo: 'feedback', de: 'Foi você. Resolva e siga em frente.', para: 'Foi você quem sujou: limpe e siga em frente, sem precisar levar isso ao grupo.' },
];

/* ---------------- utilitários ---------------- */

const norm = (t: string) => t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

interface Resolvido {
  base: Record<string, unknown>;
  /** caminho absoluto, no formato do diff (a.b.0.c) */
  abs: string;
  /** objeto que contém o campo e a chave dele */
  pai: Record<string, unknown> | unknown[];
  chave: string | number;
}

function resolver(doc: CourseDocument, t: Troca): Resolvido | { erro: string } {
  let atual: unknown = doc;
  const abs: Array<string | number> = [];
  if (t.aula) {
    let achou = false;
    for (let mi = 0; mi < doc.modules.length && !achou; mi++) {
      const li = doc.modules[mi]!.lessons.findIndex((l) => l.id === t.aula);
      if (li < 0) continue;
      const ni = doc.modules[mi]!.lessons[li]!.graph.nodes.findIndex((n) => n.id === t.no);
      if (ni < 0) return { erro: `nó ${t.aula}/${t.no} não existe` };
      atual = doc.modules[mi]!.lessons[li]!.graph.nodes[ni];
      abs.push('modules', mi, 'lessons', li, 'graph', 'nodes', ni);
      achou = true;
    }
    if (!achou) return { erro: `aula ${t.aula} não existe` };
  }
  let pai: Record<string, unknown> | unknown[] | undefined;
  let chave: string | number = '';
  for (const seg of t.caminho) {
    pai = atual as Record<string, unknown> | unknown[];
    if (typeof seg === 'object') {
      if (!Array.isArray(pai)) return { erro: 'seletor {id} fora de array' };
      const i = pai.findIndex((x) => (x as { id?: string }).id === seg.id);
      if (i < 0) return { erro: `elemento id=${seg.id} não existe` };
      chave = i;
    } else chave = seg;
    if (typeof chave === 'number' ? !Array.isArray(pai) || chave >= pai.length : !(chave in (pai as object))) return { erro: `caminho ${String(chave)} não existe` };
    atual = (pai as Record<string | number, unknown>)[chave];
    abs.push(chave);
  }
  if (typeof atual !== 'string') return { erro: 'o campo não é texto' };
  return { base: doc as never, abs: abs.join('.'), pai: pai!, chave };
}

type Estado = 'aplicar' | 'ja-aplicado' | 'divergente' | 'nao-encontrado' | 'ligado-a-fala';

/** textos falados/gravados do curso (normalizados): onde um `de` apareceria se estivesse ligado a uma fala */
function corpusFalado(doc: CourseDocument): string {
  const out: string[] = [];
  const mid = (m: { transcript?: string } | undefined | null) => m?.transcript && out.push(m.transcript);
  for (const l of allLessons(doc)) {
    for (const n of l.graph.nodes as unknown as Array<Record<string, unknown>>) {
      if (typeof n.narration === 'string') out.push(n.narration);
      mid(n.media as never);
      const br = n.bridge as { call?: string } | undefined;
      if (br?.call) out.push(br.call);
      for (const o of (n.options as Array<{ reaction?: { text?: string; media?: { transcript?: string } } }> | undefined) ?? []) {
        if (o.reaction?.text) out.push(o.reaction.text);
        mid(o.reaction?.media);
      }
    }
    for (const r of reactionScenes(l.graph) as unknown as Array<{ narration?: string }>) if (r.narration) out.push(r.narration);
  }
  return norm(out.join(' | '));
}

interface Registro {
  item: string;
  onde: string;
  courseId: string;
  caminho?: string;
  estado: Estado;
  antes: string;
  depois: string;
  motivo?: string;
  revisaoAntes?: number;
  revisaoDepois?: number;
}

async function main(): Promise<void> {
  const { apply, saida } = argumentos('docs/qa/revisao-pedagogica/aplicado.antes-depois.json');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const registros: Registro[] = [];
  const cenasInfo: Array<{ curso: string; staleAntes: number; staleDepois: number }> = [];
  try {
    const porCurso = new Map<string, Troca[]>();
    for (const t of TROCAS) porCurso.set(t.courseId, [...(porCurso.get(t.courseId) ?? []), t]);
    for (const [courseId, itens] of porCurso) {
      for (let tentativa = 1; ; tentativa++) {
        const d = await getDraft(db, courseId);
        if (!d) throw new Error(`rascunho de ${courseId} não encontrado`);
        const original = d.document as CourseDocument;
        const doc = structuredClone(original) as CourseDocument;
        const corpus = corpusFalado(doc);
        const regs: Array<Registro & { abs?: string }> = [];
        const aplicar: Array<{ t: Troca; r: Resolvido }> = [];
        for (const t of itens) {
          const base = { item: t.item, onde: t.onde, courseId, antes: t.de, depois: t.para };
          const r = resolver(doc, t);
          if ('erro' in r) {
            regs.push({ ...base, estado: 'nao-encontrado', motivo: r.erro });
            continue;
          }
          const atual = (r.pai as Record<string | number, string>)[r.chave]!;
          if (t.trecho) {
            const nDe = atual.split(t.de).length - 1;
            const nPara = atual.split(t.para).length - 1;
            if (nPara === 1 && nDe === 0) regs.push({ ...base, estado: 'ja-aplicado', abs: r.abs, caminho: r.abs, antes: atual });
            else if (nDe !== 1) regs.push({ ...base, estado: 'divergente', abs: r.abs, caminho: r.abs, antes: atual, motivo: `o trecho esperado aparece ${nDe} vez(es)` });
            else if (corpus.includes(norm(t.de))) regs.push({ ...base, estado: 'ligado-a-fala', abs: r.abs, caminho: r.abs, antes: atual, motivo: 'o trecho aparece numa fala gravada do curso' });
            else {
              regs.push({ ...base, estado: 'aplicar', abs: r.abs, caminho: r.abs, antes: atual, depois: atual.replace(t.de, t.para) });
              aplicar.push({ t, r });
            }
            continue;
          }
          if (atual === t.para) regs.push({ ...base, estado: 'ja-aplicado', abs: r.abs, caminho: r.abs, antes: atual });
          else if (atual !== t.de) regs.push({ ...base, estado: 'divergente', abs: r.abs, caminho: r.abs, antes: atual, motivo: 'o texto do rascunho não é o que a revisão viu; não toquei' });
          else if (corpus.includes(norm(t.de))) regs.push({ ...base, estado: 'ligado-a-fala', abs: r.abs, caminho: r.abs, motivo: 'o texto aparece numa fala gravada do curso; não toquei' });
          else {
            regs.push({ ...base, estado: 'aplicar', abs: r.abs, caminho: r.abs });
            aplicar.push({ t, r });
          }
        }
        for (const { t, r } of aplicar) {
          const atual = (r.pai as Record<string | number, string>)[r.chave]!;
          (r.pai as Record<string | number, string>)[r.chave] = t.trecho ? atual.replace(t.de, t.para) : t.para;
        }
        const n = aplicar.length;
        const parsed = CourseDocumentSchema.parse(doc);
        const dif = caminhosDiferentes(original as unknown as Json, parsed as unknown as Json);
        const previstos = new Set(regs.filter((x) => x.estado === 'aplicar').map((x) => x.abs!));
        const fora = dif.filter((p) => !previstos.has(p));
        if (fora.length) throw new Error(`${courseId}: o diff tocou ${fora.length} caminho(s) fora do previsto (ex.: ${fora.slice(0, 3).join(', ')}); nada foi gravado`);
        const faltou = [...previstos].filter((p) => !dif.includes(p));
        if (faltou.length) throw new Error(`${courseId}: ${faltou.length} troca(s) prevista(s) não apareceram no diff (ex.: ${faltou.slice(0, 3).join(', ')}); nada foi gravado`);
        const staleAntes = cenasStale(original);
        const staleDepois = cenasStale(parsed);
        if (JSON.stringify(staleAntes) !== JSON.stringify(staleDepois)) throw new Error(`${courseId}: o conjunto de cenas desatualizadas mudou; nada foi gravado`);
        if (tentativa === 1) {
          cenasInfo.push({ curso: courseId, staleAntes: staleAntes.length, staleDepois: staleDepois.length });
          for (const r of regs) {
            if (r.estado === 'aplicar') console.log(`[revisao] ${r.item} ${r.onde}: "${r.antes}" → "${r.depois}"`);
            else if (r.estado === 'ja-aplicado') console.log(`[revisao] ${r.item} ${r.onde}: já aplicado`);
            else console.log(`[revisao] ATENÇÃO ${r.item} ${r.onde}: ${r.estado} (${r.motivo ?? ''}); não toquei`);
          }
        }
        if (!apply || !n) {
          registros.push(...regs.map(({ abs: _a, ...r }) => ({ ...r, revisaoAntes: d.revision })));
          break;
        }
        try {
          const salvo = await saveDraft(db, { courseId, document: parsed, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `QA revisão pedagógica (Fable): ${n} texto(s) (${[...new Set(aplicar.map((a) => a.t.item))].join(', ')})` });
          console.log(`[revisao] ${courseId}: ${n} texto(s); rascunho ${d.revision} → ${salvo.revision}`);
          registros.push(...regs.map(({ abs: _a, ...r }) => ({ ...r, revisaoAntes: d.revision, ...(r.estado === 'aplicar' ? { revisaoDepois: salvo.revision } : {}) })));
          break;
        } catch (e) {
          if (e instanceof DomainError && e.code === 'CONFLICT' && tentativa < 8) {
            console.log(`[revisao] ${courseId}: conflito de revisão (outro processo gravou), relendo (tentativa ${tentativa})`);
            await new Promise((res) => setTimeout(res, 700 * tentativa));
            continue;
          }
          throw e;
        }
      }
    }
  } finally {
    await close();
  }

  const trilhas = trilhasPasso(apply);
  const resumo = {
    script: 'qa-revisao-pedagogica',
    modo: apply ? 'aplicado' : 'dry-run (nada gravado)',
    geradoEm: new Date().toISOString(),
    rascunho: {
      trocas: registros.length,
      aplicar: registros.filter((r) => r.estado === 'aplicar').length,
      jaAplicado: registros.filter((r) => r.estado === 'ja-aplicado').length,
      divergenteOuLigado: registros.filter((r) => !['aplicar', 'ja-aplicado'].includes(r.estado)).length,
      cenasDesatualizadasAntesDepois: cenasInfo,
    },
    trilhas: trilhas.resumo,
  };
  writeFileSync(saida, JSON.stringify({ resumo, rascunho: registros, trilhas: trilhas.registros, tamanhoDasOpcoes: trilhas.tamanhos }, null, 1));
  console.log(`[revisao] ${resumo.modo}: rascunho ${resumo.rascunho.aplicar} a aplicar/aplicados, ${resumo.rascunho.jaAplicado} já aplicados, ${resumo.rascunho.divergenteOuLigado} fora; trilhas ${trilhas.resumo.aplicar} a aplicar/aplicadas, ${trilhas.resumo.jaAplicado} já aplicadas, ${trilhas.resumo.divergente} divergentes. Antes/depois em ${saida}`);
  if (trilhas.resumo.aindaMaisLongas.length) console.log(`[revisao] ATENÇÃO trilhas: a correta ainda é a mais longa em ${trilhas.resumo.aindaMaisLongas.join(', ')}`);
}

/* ---------------- trilhas ---------------- */

const TRAILS_TS = path.resolve(process.cwd(), 'packages/course-schema/src/trails.ts');

type Checagens = typeof TRAIL_CHECKS;

function valorTrilha(chk: Checagens, t: TrocaTrilha): string | undefined {
  const o = chk[t.trilha]?.situations.find((s) => s.id === t.situacao)?.options.find((x) => x.id === t.opcao);
  return o ? o[t.campo] : undefined;
}

function tamanhos(chk: Checagens): Array<{ trilha: string; situacao: string; corretaEhAMaisLonga: boolean; corretaSobreMediaDasOutras: number; alerta: boolean; tamanhos: Record<string, number> }> {
  const semAspas = (s: string) => s.replace(/^[“"]|[”"]$/g, '');
  const out: ReturnType<typeof tamanhos> = [];
  for (const [slug, tr] of Object.entries(chk)) {
    for (const s of tr.situations) {
      const len = s.options.map((o) => semAspas(o.label).length);
      const ci = s.options.findIndex((o) => o.correct);
      if (ci < 0) continue;
      const outros = len.filter((_, i) => i !== ci);
      const media = outros.reduce((a, b) => a + b, 0) / (outros.length || 1);
      out.push({
        trilha: slug, situacao: s.id,
        corretaEhAMaisLonga: len[ci]! > Math.max(...outros),
        corretaSobreMediaDasOutras: Math.round((len[ci]! / media) * 100) / 100,
        // critério do raio-X (alerta `opcao_muito_longa`)
        alerta: len[ci]! >= media * 1.5 && len[ci]! - media >= 20,
        tamanhos: Object.fromEntries(s.options.map((o, i) => [o.id + (o.correct ? '*' : ''), len[i]!])),
      });
    }
  }
  return out;
}

function trilhasPasso(apply: boolean) {
  const registros: Array<{ item: string; trilha: string; situacao: string; opcao: string; campo: string; estado: Estado; antes: string; depois: string }> = [];
  const esperado = structuredClone(TRAIL_CHECKS) as Checagens;
  let fonte = readFileSync(TRAILS_TS, 'utf8');
  const original = fonte;
  for (const t of TROCAS_TRILHA) {
    const atual = valorTrilha(TRAIL_CHECKS, t);
    const base = { item: t.item, trilha: t.trilha, situacao: t.situacao, opcao: t.opcao, campo: t.campo, antes: t.de, depois: t.para };
    if (atual === undefined) { registros.push({ ...base, estado: 'nao-encontrado' }); continue; }
    if (atual === t.para) { registros.push({ ...base, estado: 'ja-aplicado', antes: atual }); continue; }
    if (atual !== t.de) { registros.push({ ...base, estado: 'divergente', antes: atual }); continue; }
    // troca no texto do arquivo, dentro do bloco da situação e da linha `opt('<id>', …)`
    const ini = fonte.indexOf(`id: '${t.situacao}',`);
    if (ini < 0) { registros.push({ ...base, estado: 'nao-encontrado' }); continue; }
    const prox = fonte.indexOf('\n      {\n        id:', ini);
    const fim = prox < 0 ? fonte.length : prox;
    const bloco = fonte.slice(ini, fim);
    const linhaIni = bloco.indexOf(`opt('${t.opcao}', `);
    const linhaFim = linhaIni < 0 ? -1 : bloco.indexOf('\n', linhaIni);
    const linha = linhaIni < 0 ? '' : bloco.slice(linhaIni, linhaFim < 0 ? undefined : linhaFim);
    const alvo = `'${t.de}'`;
    if (!linha || linha.split(alvo).length !== 2) { registros.push({ ...base, estado: 'divergente', antes: atual }); continue; }
    const novaLinha = linha.replace(alvo, `'${t.para}'`);
    fonte = fonte.slice(0, ini) + bloco.slice(0, linhaIni) + novaLinha + bloco.slice(linhaIni + linha.length) + fonte.slice(fim);
    const o = esperado[t.trilha]!.situations.find((s) => s.id === t.situacao)!.options.find((x) => x.id === t.opcao)!;
    o[t.campo] = t.para;
    registros.push({ ...base, estado: 'aplicar' });
  }
  const aplicar = registros.filter((r) => r.estado === 'aplicar').length;
  for (const r of registros) {
    if (r.estado === 'aplicar') console.log(`[revisao] ${r.item} trilha ${r.trilha}/${r.situacao}/${r.opcao} ${r.campo}: "${r.antes}" → "${r.depois}"`);
    else if (r.estado !== 'ja-aplicado') console.log(`[revisao] ATENÇÃO ${r.item} trilha ${r.trilha}/${r.situacao}/${r.opcao}: ${r.estado}; não toquei`);
  }
  if (apply && aplicar) {
    const copia = path.join(tmpdir(), 'trails.antes-revisao-pedagogica.ts.txt');
    copyFileSync(TRAILS_TS, copia);
    writeFileSync(TRAILS_TS, fonte);
    // confere o resultado: carrega o módulo de novo, em outro processo, e compara com o esperado
    const lido = JSON.parse(execFileSync(path.resolve(process.cwd(), 'apps/worker/node_modules/.bin/tsx'), ['-e', `import { TRAIL_CHECKS } from ${JSON.stringify(TRAILS_TS)}; console.log(JSON.stringify(TRAIL_CHECKS));`], { encoding: 'utf8' }));
    if (JSON.stringify(lido) !== JSON.stringify(esperado)) {
      writeFileSync(TRAILS_TS, original);
      throw new Error('trails.ts: o módulo recarregado não bate com o esperado; arquivo restaurado');
    }
    if (fonte.split('\n').length !== original.split('\n').length) {
      writeFileSync(TRAILS_TS, original);
      throw new Error('trails.ts: o número de linhas mudou; arquivo restaurado');
    }
    console.log(`[revisao] trails.ts: ${aplicar} troca(s) gravada(s) e conferida(s) (cópia do original: ${copia})`);
  }
  const depois = tamanhos(esperado);
  return {
    registros,
    tamanhos: { antes: tamanhos(TRAIL_CHECKS), depoisDasTrocas: depois },
    resumo: {
      aplicar,
      jaAplicado: registros.filter((r) => r.estado === 'ja-aplicado').length,
      divergente: registros.filter((r) => !['aplicar', 'ja-aplicado'].includes(r.estado)).length,
      aindaMaisLongas: depois.filter((x) => x.corretaEhAMaisLonga && ['primeiro-emprego', 'imagem-e-postura', 'rotina-e-combinados', 'convivencia'].includes(x.trilha)).map((x) => `${x.situacao} (${x.corretaSobreMediaDasOutras}×${x.alerta ? ', ALERTA' : ''})`),
    },
  };
}

main().catch((e) => {
  console.error(`[revisao] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
