/**
 * Revisão pedagógica da Fable, P1 (C14·A12·v23 "Suas perguntas, e o depois"): a aula promete "o que fazer depois, inclusive quando a
 * resposta é não", mas o plano s3 ("E se a resposta for não? Dói, mas faz parte. …") já gravado foi cortado pelo ajuste fino
 * (`media.adjust.drop: ['s4','s3']`). Este script prepara o RASCUNHO para a remontagem:
 *  - tira o s3 de `media.adjust.drop` (o s4, "Cada entrevista é um treino…", continua fora: é promessa);
 *  - `narration` da cena = soma dos planos que ficam (padrão de qa-revisao-final): a fala do s3 entra depois do s2, antes da chamada.
 * Quem refaz o vídeo é `apps/worker/src/scripts/remontar-emendas.ts <crs_id> --so=aula_12/v23` (clipes já pagos; custo 0).
 *
 * O diff só pode conter `media.adjust.drop` e `narration` do nó v23; o conjunto de cenas desatualizadas não pode mudar.
 * Idempotente. Controle de revisão. Sem `--apply` (padrão) não grava. Antes/depois em JSON (`--saida`).
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/qa-p1-devolver-s3.ts [--dry-run | --apply] [--saida arq.json]
 */
import { writeFileSync } from 'node:fs';
import { CourseDocumentSchema, type CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { DomainError } from '../../errors';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { argumentos, caminhosDiferentes, cenasStale } from './_rascunho-qa';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const COURSE = 'crs_hvvgkvtd1rb2um0l';
const AULA = 'aula_12';
const NO = 'v23';
const S3 = 'E se a resposta for não? Dói, mas faz parte. Pergunte, com educação, o que você pode melhorar. Anote, ajuste e siga para a próxima.';
const ANTES_DA_CHAMADA = 'A recrutadora pergunta se você tem alguma pergunta.';

type Alvo = { narration?: string; media?: { adjust?: { drop?: string[] } } };

async function main(): Promise<void> {
  const { apply, saida } = argumentos('docs/qa/revisao-pedagogica/p1-devolver-s3.antes-depois.json');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    for (let tentativa = 1; ; tentativa++) {
      const d = await getDraft(db, COURSE);
      if (!d) throw new Error('rascunho de C14 não encontrado');
      const original = d.document as CourseDocument;
      const doc = structuredClone(original) as CourseDocument;
      const mi = doc.modules.findIndex((m) => m.lessons.some((l) => l.id === AULA));
      const lesson = doc.modules[mi]!.lessons.find((l) => l.id === AULA)!;
      const no = lesson.graph.nodes.find((n) => n.id === NO) as unknown as Alvo | undefined;
      if (!no?.media?.adjust) throw new Error(`${AULA}/${NO} sem media.adjust`);
      const dropAntes = [...(no.media.adjust.drop ?? [])];
      const narrAntes = no.narration ?? '';
      const jaTemS3Falado = narrAntes.includes(S3);
      const dropJa = !dropAntes.includes('s3');
      const estado = dropJa && jaTemS3Falado ? 'ja-aplicado' : 'aplicar';
      if (estado === 'aplicar') {
        if (!dropAntes.includes('s4')) throw new Error('o s4 deveria estar fora (drop) e não está; não toquei');
        if (!jaTemS3Falado && !narrAntes.includes(ANTES_DA_CHAMADA)) throw new Error('a narração do v23 não tem o ponto de inserção esperado; não toquei');
        no.media.adjust.drop = dropAntes.filter((x) => x !== 's3');
        if (!jaTemS3Falado) no.narration = narrAntes.replace(ANTES_DA_CHAMADA, `${S3} ${ANTES_DA_CHAMADA}`);
      }
      const parsed = CourseDocumentSchema.parse(doc);
      const dif = caminhosDiferentes(original as unknown as Json, parsed as unknown as Json);
      const base = `modules.${mi}.lessons.${doc.modules[mi]!.lessons.findIndex((l) => l.id === AULA)}.graph.nodes.${lesson.graph.nodes.findIndex((n) => n.id === NO)}`;
      const permitido = new Set([`${base}.narration`, `${base}.media.adjust.drop`]);
      const fora = dif.filter((p) => !permitido.has(p));
      if (fora.length) throw new Error(`o diff tocou caminho(s) fora do previsto (ex.: ${fora.slice(0, 3).join(', ')}); nada foi gravado`);
      const staleAntes = cenasStale(original);
      const staleDepois = cenasStale(parsed);
      if (JSON.stringify(staleAntes) !== JSON.stringify(staleDepois)) throw new Error('o conjunto de cenas desatualizadas mudou; nada foi gravado');
      const reg = { item: 'P1', onde: 'C14·A12·v23', courseId: COURSE, estado, dropAntes, dropDepois: no.media.adjust.drop, narrationAntes: narrAntes, narrationDepois: no.narration, cenasDesatualizadas: { antes: staleAntes.length, depois: staleDepois.length }, revisaoAntes: d.revision } as Record<string, unknown>;
      console.log(`[p1] ${estado}: drop ${JSON.stringify(dropAntes)} → ${JSON.stringify(no.media.adjust.drop)}; narração ${jaTemS3Falado ? 'já tem' : 'ganha'} a fala do s3; cenas desatualizadas ${staleAntes.length} → ${staleDepois.length}`);
      if (!apply || estado === 'ja-aplicado') {
        writeFileSync(saida, JSON.stringify(reg, null, 1));
        console.log(`[p1] ${apply ? 'nada a fazer' : 'dry-run (nada gravado)'}; antes/depois em ${saida}`);
        break;
      }
      try {
        const salvo = await saveDraft(db, { courseId: COURSE, document: parsed, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: 'QA revisão pedagógica P1: devolve o plano s3 ao v23 da aula 12 (tira do drop; narração acompanha)' });
        reg.revisaoDepois = salvo.revision;
        writeFileSync(saida, JSON.stringify(reg, null, 1));
        console.log(`[p1] gravado: rascunho ${d.revision} → ${salvo.revision}. Falta remontar: remontar-emendas.ts ${COURSE} --so=${AULA}/${NO}`);
        break;
      } catch (e) {
        if (e instanceof DomainError && e.code === 'CONFLICT' && tentativa < 8) {
          console.log(`[p1] conflito de revisão, relendo (tentativa ${tentativa})`);
          await new Promise((res) => setTimeout(res, 700 * tentativa));
          continue;
        }
        throw e;
      }
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(`[p1] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
