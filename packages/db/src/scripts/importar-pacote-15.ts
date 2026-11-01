/**
 * Importa os cursos do pacote (docs/novos-cursos/pacote-15) como RASCUNHOS no estúdio, já com as decisões do dono sobre a
 * análise editorial: 12 cursos finais com 2 decisões por aula; 3 do pacote são fundidos (arquivados) e a aula 3 de
 * "Liberdade e intimidade…" é acrescentada ao rascunho do curso existente. Sem IA, sem provedor, sem
 * gerar vídeo, sem publicar, sem matricular: só grava rascunhos (a mídia fica pendente e o estúdio a lista).
 *
 * IDEMPOTENTE. A chave estável de cada curso é o id editorial do pacote (`dna-proposta-*`), gravado no começo de
 * `brief.sourcesNote` como `[pacote-15:<id>]` (e o slug proposto vira o slug do curso). Reexecutar:
 *  - não cria um segundo curso (acha o curso pelo marcador; slug ocupado por outro curso = recusa, nunca toca nele);
 *  - atualiza o rascunho só quando a última revisão foi gravada por esta importação (origem `script`, nota
 *    "Importado do pacote-15…"). Se alguém mexeu depois (estúdio, kit, outro script) ou há mídia nas cenas, é
 *    CONFLITO: nada é gravado e o curso é listado; `--forcar` sobrescreve (nova revisão, o histórico fica);
 *  - não grava nada quando o documento gerado é igual ao rascunho (sem revisão nova);
 *  - nunca mexe em curso publicado/arquivado nem nos cursos existentes.
 * A trilha (`courses.trail`) é provisória (a do catálogo do pacote) e só é gravada quando o curso nasce ou está sem
 * trilha; para trocar: `--trilhas arquivo.json` ({ "<slug>": "Nome da trilha" }) com `--reaplicar-trilhas`, ou pelo
 * estúdio (campo Trilha), que a importação não desfaz.
 *
 * Uso (raiz do monorepo):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/importar-pacote-15.ts [--dry-run] [--only slug,slug]
 *     [--pacote docs/novos-cursos/pacote-15] [--workspace wsp_…] [--trilhas arq.json] [--reaplicar-trilhas] [--forcar]
 *     [--saida docs/novos-cursos/importacao.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { applyKitToDocument, emptyCourseDocument, type CourseDocument, type Lesson, type ResolvedKit } from '@lms/course-schema';
import { createDb, type Database } from '../client';
import * as s from '../schema';
import { createCourse, getDraft, listDraftRevisions, normalizeTrail, saveDraft, setCourseTrail } from '../repositories/authoring';
import { DomainError } from '../errors';
import { resolveKit } from '../repositories/library';
import { validateDraft } from '../repositories/publishing';
import { optionsFromKit, parseArgs as parseImportArgs, stableJson } from './import-markdown-course';
import { compileCourse } from '@lms/course-schema';
import { lerPacote, MARCADOR, NOTA_IMPORTACAO, validarPacote, type CursoPacote, type Instrutor } from './pacote-15/construir';
import { INSTRUTORES } from './pacote-15/dados';
import { aula3Patricia, CURSO_EXISTENTE_AULA3, FABRICAS, FUNDIDOS, TRILHA_FINAL, type AulaSpec } from './pacote-15/final';
import { construirCurso, validarCurso } from './pacote-15/montagem';

const AUTHOR_EMAIL = 'autor@demo.local';
const BASE_URL = process.env.PREVIA_BASE_URL ?? 'http://localhost:3010';

export interface Args {
  dryRun: boolean;
  only?: string[];
  pacote: string;
  workspace?: string;
  trilhas?: Record<string, string>;
  reaplicarTrilhas: boolean;
  forcar: boolean;
  saida?: string;
}

export function parseArgs(argv: readonly string[]): Args {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(a.slice(2), next);
      i++;
    } else flags.set(a.slice(2), true);
  }
  const str = (k: string) => {
    const v = flags.get(k);
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  const trilhasFile = str('trilhas');
  return {
    dryRun: flags.has('dry-run'),
    ...(str('only') ? { only: str('only')!.split(',').map((x) => x.trim()).filter(Boolean) } : {}),
    pacote: str('pacote') ?? 'docs/novos-cursos/pacote-15',
    ...(str('workspace') ? { workspace: str('workspace')! } : {}),
    ...(trilhasFile ? { trilhas: JSON.parse(readFileSync(trilhasFile, 'utf8')) as Record<string, string> } : {}),
    reaplicarTrilhas: flags.has('reaplicar-trilhas'),
    forcar: flags.has('forcar'),
    ...(str('saida') ? { saida: str('saida')! } : {}),
  };
}

export type Acao = 'criado' | 'atualizado' | 'sem mudanças' | 'conflito' | 'arquivado (fundido)' | 'arquivado (já estava)' | 'não criado (fundido)' | 'aula 3 acrescentada' | 'simulado (criaria)' | 'simulado (atualizaria)';

export interface Linha {
  id: string;
  slug: string;
  titulo: string;
  instrutor: string;
  kit: string;
  trilha: string | null;
  trilhaProposta: string;
  courseId: string | null;
  revisao: number | null;
  acao: Acao;
  motivo?: string;
  aulas: Array<{ id: string; titulo: string; previa: string | null; origem?: string }>;
  curso: string | null;
  avisosMotor: Record<string, number>;
  resumo: Record<string, number | string>;
}

function aulaTemMidia(l: Lesson): boolean {
  for (const n of l.graph.nodes) {
    if ((n as { media?: unknown }).media) return true;
    if (n.type === 'choice' && n.options.some((o) => o.reaction?.media)) return true;
  }
  return false;
}
function temMidia(doc: CourseDocument): boolean {
  return doc.modules.some((m) => m.lessons.some(aulaTemMidia));
}

/** O curso gerenciado por esta importação: o marcador no briefing (chave estável); slug ocupado por outro curso é erro. */
async function acharCurso(db: Database, workspaceId: string, cursoId: string, slug: string) {
  const marcador = `${MARCADOR(cursoId)}%`;
  const porMarcador = await db
    .select({ id: s.courses.id, slug: s.courses.slug, status: s.courses.status, latestVersionNumber: s.courses.latestVersionNumber, trail: s.courses.trail })
    .from(s.courses)
    .innerJoin(s.courseDrafts, eq(s.courseDrafts.courseId, s.courses.id))
    .where(and(eq(s.courses.workspaceId, workspaceId), sql`${s.courseDrafts.document} -> 'brief' ->> 'sourcesNote' like ${marcador}`));
  if (porMarcador.length > 1) throw new Error(`${cursoId}: ${porMarcador.length} cursos com o mesmo marcador (${porMarcador.map((c) => c.id).join(', ')}); resolva à mão`);
  if (porMarcador[0]) return { curso: porMarcador[0], ocupante: null as null | { id: string; title: string } };
  const [ocupante] = await db.select({ id: s.courses.id, title: s.courses.title }).from(s.courses).where(and(eq(s.courses.workspaceId, workspaceId), eq(s.courses.slug, slug))).limit(1);
  return { curso: null, ocupante: ocupante ?? null };
}

const PREFIXO_AULA3 = `${NOTA_IMPORTACAO} (aula 3 de nem-toda-brincadeira)`;

/**
 * Acrescenta a aula 3 ao rascunho do curso existente (aulas 1 e 2 intactas); idempotente.
 * Outras pessoas e scripts editam esse rascunho (a aula 3 sai do importador, mas o título das aulas é do script de nomes finais):
 *  - o TÍTULO da aula 3 que já está no rascunho é preservado (a importação não desfaz um nome decidido depois);
 *  - grava com `expectedRevision`; se alguém gravar no meio, relê o rascunho e tenta de novo (até 4 vezes);
 *  - se a aula 3 do rascunho já tem vídeo, recusa (reimportar descartaria a gravação) mesmo com `--forcar`.
 */
async function enxertarAula3(db: Database, args: Args, pacote: ReturnType<typeof lerPacote>, userId: string): Promise<Linha> {
  const tag = '[pacote-15]';
  const cursoPkg = pacote.cursos.find((x) => x.curso.slug_proposto === 'nem-toda-brincadeira')!.curso;
  const c = (slug: string): CursoPacote => pacote.cursos.find((x) => x.curso.slug_proposto === slug)!.curso;
  const courseId = CURSO_EXISTENTE_AULA3;
  const cod = { v: 4, q: 4, a: 3 };
  const a3 = aula3Patricia(c);
  for (let tentativa = 1; ; tentativa++) {
    const curso = await db.select({ id: s.courses.id, title: s.courses.title, trail: s.courses.trail }).from(s.courses).where(eq(s.courses.id, courseId)).limit(1);
    const draft = await getDraft(db, courseId);
    if (!curso[0] || !draft) throw new Error(`curso existente ${courseId} não encontrado`);
    const doc0 = draft.document as CourseDocument;
    const instrutor: Instrutor = { nome: doc0.branding.presenterName ?? '', papel: doc0.branding.presenterRole ?? '', pronome: doc0.presentation.presenterPronoun ?? 'she' };
    const opcoes = { presentation: doc0.presentation, presenter: { name: instrutor.nome, role: instrutor.papel }, direction: true, audienceProfile: 'first_job' as const, level: 'beginner' as const, traits: ['shy' as const] };
    const built = construirCurso(cursoPkg, [a3], instrutor, 'classica', opcoes, undefined, { cod, numeroPrimeiraAula: 3 });
    const v = validarCurso(built.document, cursoPkg, [a3], { primeiraAulaNoCurso: false, cod });
    if (v.erros.length) throw new Error(`aula 3: documento inválido:\n  - ${v.erros.join('\n  - ')}`);
    const lesson3 = built.document.modules[0]!.lessons[0]!;
    const obj3 = built.document.objectives.find((o) => o.id === lesson3.objectiveIds[0])!;
    const existentes = doc0.modules.flatMap((m) => m.lessons);
    const ja = existentes.find((l) => l.id === lesson3.id);
    if (ja) lesson3.title = ja.title; // o título decidido depois da importação vale
    const base: Linha = {
      id: 'aula 3', slug: 'nem-toda-brincadeira', titulo: `${curso[0].title} · aula 3 (${lesson3.title})`, instrutor: instrutor.nome, kit: '(do próprio curso)', trilha: curso[0].trail, trilhaProposta: cursoPkg.track_proposed,
      courseId, revisao: draft.revision, acao: 'sem mudanças', aulas: [{ id: lesson3.id, titulo: lesson3.title, previa: `${BASE_URL}/estudio/cursos/${courseId}/aulas/${lesson3.id}/previa`, origem: a3.origem }],
      curso: `${BASE_URL}/estudio/cursos/${courseId}`, avisosMotor: {}, resumo: { ...v.resumo, posicaoRecomendada: v.resumo.posicaoRecomendada.join(''), qualidades: JSON.stringify(v.resumo.qualidades) },
    };
    if (ja && stableJson(ja) === stableJson(lesson3)) {
      console.log(`${tag} aula 3 de ${courseId}: já está igual`);
      return base;
    }
    if (ja) {
      if (aulaTemMidia(ja)) {
        console.log(`${tag} CONFLITO aula 3 de ${courseId}: a aula 3 já tem vídeo gerado`);
        return { ...base, acao: 'conflito', motivo: 'a aula 3 já tem vídeo gerado; reimportar descartaria a gravação; nada foi gravado' };
      }
      const [ultima] = await listDraftRevisions(db, courseId, 1);
      if (!(ultima?.origin === 'script' && ultima.note?.startsWith(PREFIXO_AULA3)) && !args.forcar) {
        console.log(`${tag} CONFLITO aula 3 de ${courseId}: a aula 3 existe e o rascunho foi alterado depois da importação`);
        return { ...base, acao: 'conflito', motivo: 'a aula 3 já existe e o rascunho foi alterado depois da importação; nada foi gravado (--forcar troca só a aula 3, o resto do curso fica como está)' };
      }
    }
    const doc = structuredClone(doc0);
    const mod = doc.modules[0]!;
    const novaLista = mod.lessons.filter((l) => l.id !== lesson3.id);
    mod.lessons = [...novaLista, lesson3];
    doc.objectives = [...doc.objectives.filter((o) => o.id !== obj3.id), obj3];
    doc.completion = { ...doc.completion, requiredLessonIds: [...new Set([...doc.completion.requiredLessonIds, lesson3.id])] };
    // as aulas 1 e 2 não podem mudar
    for (const l of existentes.filter((x) => x.id !== lesson3.id)) if (stableJson(doc.modules.flatMap((m) => m.lessons).find((x) => x.id === l.id)) !== stableJson(l)) throw new Error(`a aula ${l.id} foi alterada: abortado`);
    const comp = compileCourse(doc);
    if (!comp.ok) throw new Error(`curso com a aula 3 não compila: ${comp.errors.map((e) => e.message).join('; ')}`);
    if (args.dryRun) {
      console.log(`${tag} (simulação) acrescentaria a aula 3 a ${courseId}`);
      return { ...base, acao: ja ? 'simulado (atualizaria)' : 'simulado (criaria)' };
    }
    try {
      const salvo = await saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId, origin: 'script', note: PREFIXO_AULA3 });
      console.log(`${tag} aula 3 ${ja ? 'atualizada' : 'acrescentada'} em ${courseId}: revisão ${draft.revision} → ${salvo.revision}`);
      return { ...base, revisao: salvo.revision, acao: 'aula 3 acrescentada' };
    } catch (e) {
      if (e instanceof DomainError && e.code === 'CONFLICT' && tentativa < 4) {
        console.log(`${tag} aula 3: o rascunho mudou durante a gravação (tentativa ${tentativa}); relendo`);
        continue;
      }
      throw e;
    }
  }
}

export async function run(db: Database, args: Args): Promise<Linha[]> {
  const tag = '[pacote-15]';
  const pacote = lerPacote(path.resolve(args.pacote));
  const problemas = validarPacote(pacote);
  if (problemas.length) throw new Error(`pacote inconsistente:\n  - ${problemas.join('\n  - ')}`);
  console.log(`${tag} pacote lido: ${pacote.cursos.length} cursos, formato e roteiro.md conferidos`);

  const workspaces = await db.select({ id: s.workspaces.id }).from(s.workspaces);
  const workspaceId = args.workspace ?? (workspaces.length === 1 ? workspaces[0]!.id : undefined);
  if (!workspaceId) throw new Error('mais de um workspace: informe --workspace wsp_…');
  const [autor] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, AUTHOR_EMAIL)).limit(1);
  if (!autor) throw new Error(`autor ${AUTHOR_EMAIL} não existe`);

  const kits = new Map<string, ResolvedKit>();
  const linhas: Linha[] = [];
  const c = (slug: string): CursoPacote => pacote.cursos.find((x) => x.curso.slug_proposto === slug)!.curso;
  const sel = (slug: string) => !args.only || args.only.includes(slug);
  if (args.only) for (const o of args.only) if (!pacote.cursos.some((x) => x.curso.slug_proposto === o)) throw new Error(`--only: "${o}" não está no pacote`);

  for (const slug of Object.keys(FABRICAS).filter(sel)) {
    const curso = c(slug);
    const inst = INSTRUTORES[curso.instructor_proposed];
    if (!inst) throw new Error(`${slug}: instrutor "${curso.instructor_proposed}" sem kit mapeado (pacote-15/dados.ts)`);
    let kit = kits.get(inst.kit);
    if (!kit) {
      kit = await resolveKit(db, workspaceId, inst.kit); // erro claro se o kit não existe ou não tem câmeras prontas
      kits.set(inst.kit, kit);
    }
    const p = kit.presenter.data;
    const instrutor: Instrutor = { nome: p.name, papel: p.role, pronome: p.pronoun ?? 'they' };
    const opcoes = optionsFromKit(parseImportArgs(['--file', 'pacote-15.md', '--kit', inst.kit]), kit);
    const aulas: AulaSpec[] = FABRICAS[slug]!(c);
    const trilhaFinal = TRILHA_FINAL[slug]!;
    const construcao = construirCurso(curso, aulas, instrutor, inst.paleta, opcoes, (d) => applyKitToDocument(d, kit).document, undefined, trilhaFinal);
    const doc = construcao.document;
    const v = validarCurso(doc, curso, aulas);
    if (v.erros.length) throw new Error(`${slug}: documento inválido:\n  - ${v.erros.join('\n  - ')}`);
    const avisosMotor: Record<string, number> = {};
    for (const w of v.avisos) avisosMotor[w.code] = (avisosMotor[w.code] ?? 0) + 1;

    const trilhaAlvo = normalizeTrail(args.trilhas?.[slug] ?? trilhaFinal);
    const base: Omit<Linha, 'courseId' | 'revisao' | 'acao' | 'aulas' | 'curso' | 'trilha'> = {
      id: curso.id,
      slug,
      titulo: doc.title,
      instrutor: `${instrutor.nome} (${inst.kit})`,
      kit: inst.kit,
      trilhaProposta: curso.track_proposed,
      avisosMotor,
      resumo: { ...v.resumo, posicaoRecomendada: v.resumo.posicaoRecomendada.join(''), qualidades: JSON.stringify(v.resumo.qualidades) },
    };
    const lessons = doc.modules.flatMap((m) => m.lessons);
    const aulasDe = (courseId: string | null) => lessons.map((l, i) => ({ id: l.id, titulo: l.title, previa: courseId ? `${BASE_URL}/estudio/cursos/${courseId}/aulas/${l.id}/previa` : null, origem: aulas[i]!.origem }));
    // a trilha só é trocada quando está vazia ou ainda é a provisória que esta importação gravou antes (a do pacote)
    const trilhaPodeTrocar = (atual: string | null) => !atual || atual === curso.track_proposed || args.reaplicarTrilhas;

    const { curso: existente, ocupante } = await acharCurso(db, workspaceId, curso.id, curso.slug_proposto);
    if (!existente && ocupante) {
      const l: Linha = { ...base, courseId: null, revisao: null, acao: 'conflito', motivo: `o slug "${slug}" já pertence ao curso ${ocupante.id} ("${ocupante.title}"), que não foi criado por esta importação; não foi tocado`, aulas: aulasDe(null), curso: null, trilha: null };
      console.log(`${tag} CONFLITO ${slug}: ${l.motivo}`);
      linhas.push(l);
      continue;
    }

    if (!existente) {
      if (args.dryRun) {
        linhas.push({ ...base, courseId: null, revisao: null, acao: 'simulado (criaria)', aulas: aulasDe(null), curso: null, trilha: trilhaAlvo });
        console.log(`${tag} (simulação) criaria ${slug}: ${doc.title}`);
        continue;
      }
      const criado = await createCourse(db, { workspaceId, title: doc.title, createdBy: autor.id, document: emptyCourseDocument(doc.title), slug: curso.slug_proposto });
      const salvo = await saveDraft(db, { courseId: criado.id, document: doc, expectedRevision: 1, userId: autor.id, origin: 'script', note: `${NOTA_IMPORTACAO} (${curso.id})` });
      const trilha = trilhaAlvo ? await setCourseTrail(db, criado.id, trilhaAlvo) : null;
      console.log(`${tag} criado ${criado.id} (${slug}) revisão ${salvo.revision}, trilha "${trilha ?? '—'}"`);
      linhas.push({ ...base, courseId: criado.id, revisao: salvo.revision, acao: 'criado', aulas: aulasDe(criado.id), curso: `${BASE_URL}/estudio/cursos/${criado.id}`, trilha });
      continue;
    }

    // já existe: só rascunho nunca publicado, gerenciado por esta importação
    const rascunho = await getDraft(db, existente.id);
    if (!rascunho) throw new Error(`${existente.id}: rascunho não encontrado`);
    const conflitar = (motivo: string): Linha => ({ ...base, courseId: existente.id, revisao: rascunho.revision, acao: 'conflito', motivo, aulas: aulasDe(existente.id), curso: `${BASE_URL}/estudio/cursos/${existente.id}`, trilha: existente.trail });
    let motivo: string | null = null;
    if (existente.status !== 'draft' || existente.latestVersionNumber > 0) motivo = `curso ${existente.id} não está mais em rascunho (${existente.status}, versão ${existente.latestVersionNumber}); a importação não altera cursos publicados`;
    else {
      const [ultima] = await listDraftRevisions(db, existente.id, 1);
      if (!(ultima?.origin === 'script' && ultima.note?.startsWith(NOTA_IMPORTACAO))) motivo = `o rascunho foi alterado depois da importação (revisão ${rascunho.revision}, origem "${ultima?.origin ?? '?'}"${ultima?.note ? `, "${ultima.note}"` : ''}); suas alterações foram preservadas`;
      else if (temMidia(rascunho.document)) motivo = 'o rascunho já tem vídeo gerado; reimportar poderia descartá-lo';
    }
    if (motivo && !args.forcar) {
      console.log(`${tag} CONFLITO ${slug} (${existente.id}): ${motivo}`);
      linhas.push(conflitar(motivo));
      continue;
    }
    if (motivo) console.log(`${tag} --forcar: ${slug} será sobrescrito (${motivo})`);

    let trilha = existente.trail;
    const igual = stableJson(rascunho.document) === stableJson(doc);
    if (args.dryRun) {
      linhas.push({ ...base, courseId: existente.id, revisao: rascunho.revision, acao: igual ? 'sem mudanças' : 'simulado (atualizaria)', aulas: aulasDe(existente.id), curso: `${BASE_URL}/estudio/cursos/${existente.id}`, trilha });
      console.log(`${tag} (simulação) ${slug} ${existente.id}: ${igual ? 'sem mudanças' : 'atualizaria'}`);
      continue;
    }
    let revisao = rascunho.revision;
    let acao: Acao = 'sem mudanças';
    if (!igual) {
      const salvo = await saveDraft(db, { courseId: existente.id, document: doc, expectedRevision: rascunho.revision, userId: autor.id, origin: 'script', note: `${NOTA_IMPORTACAO} (${curso.id})${motivo ? ' · sobrescrito com --forcar' : ''}` });
      revisao = salvo.revision;
      acao = 'atualizado';
    }
    if (trilhaAlvo && trilhaPodeTrocar(existente.trail) && existente.trail !== trilhaAlvo) trilha = await setCourseTrail(db, existente.id, trilhaAlvo);
    console.log(`${tag} ${acao} ${existente.id} (${slug}) revisão ${revisao}, trilha "${trilha ?? '—'}"`);
    linhas.push({ ...base, courseId: existente.id, revisao, acao, aulas: aulasDe(existente.id), curso: `${BASE_URL}/estudio/cursos/${existente.id}`, trilha });
  }

  // fundidos: o curso do pacote deixa de existir como curso (decisão do dono). Arquiva o rascunho (sem apagar nada); nunca cria.
  for (const [slug, destino] of Object.entries(FUNDIDOS).filter(([k]) => sel(k))) {
    const curso = c(slug);
    const linhaBase = { id: curso.id, slug, titulo: curso.title, instrutor: curso.instructor_proposed, kit: '—', trilha: null, trilhaProposta: curso.track_proposed, aulas: [] as Linha['aulas'], curso: null as string | null, avisosMotor: {} as Record<string, number>, resumo: {} as Linha['resumo'], motivo: `fundido em ${destino}` };
    const { curso: ex } = await acharCurso(db, workspaceId, curso.id, curso.slug_proposto);
    if (!ex) {
      console.log(`${tag} ${slug}: fundido, não existe como curso (nada a criar)`);
      linhas.push({ ...linhaBase, courseId: null, revisao: null, acao: 'não criado (fundido)' });
      continue;
    }
    // a trilha provisória do pacote não fica no curso arquivado (senão apareceria na lista de trilhas do estúdio)
    const limparTrilha = async () => {
      if (!args.dryRun && ex.trail && ex.trail === curso.track_proposed) await setCourseTrail(db, ex.id, null);
    };
    if (ex.status === 'archived') {
      await limparTrilha();
      linhas.push({ ...linhaBase, courseId: ex.id, revisao: null, acao: 'arquivado (já estava)', trilha: ex.trail, curso: `${BASE_URL}/estudio/cursos/${ex.id}` });
      console.log(`${tag} ${slug} (${ex.id}): já arquivado`);
      continue;
    }
    if (ex.status !== 'draft' || ex.latestVersionNumber > 0) {
      linhas.push({ ...linhaBase, courseId: ex.id, revisao: null, acao: 'conflito', motivo: `deveria ser arquivado, mas não está em rascunho (${ex.status}, versão ${ex.latestVersionNumber}); não foi tocado`, trilha: ex.trail, curso: `${BASE_URL}/estudio/cursos/${ex.id}` });
      continue;
    }
    if (args.dryRun) {
      linhas.push({ ...linhaBase, courseId: ex.id, revisao: null, acao: 'simulado (atualizaria)', trilha: ex.trail });
      console.log(`${tag} (simulação) arquivaria ${slug} (${ex.id})`);
      continue;
    }
    // arquivar = o mecanismo do projeto (status "archived" + archivedAt); o rascunho, as revisões e a trilha ficam como estão
    await db.update(s.courses).set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() }).where(eq(s.courses.id, ex.id));
    await limparTrilha();
    console.log(`${tag} arquivado ${ex.id} (${slug}): ${linhaBase.motivo}`);
    linhas.push({ ...linhaBase, courseId: ex.id, revisao: null, acao: 'arquivado (fundido)', trilha: ex.trail, curso: `${BASE_URL}/estudio/cursos/${ex.id}` });
  }

  if (sel('nem-toda-brincadeira')) linhas.push(await enxertarAula3(db, args, pacote, autor.id));

  // conferência final no banco: o rascunho gravado compila sem erros (validação oficial do estúdio)
  if (!args.dryRun) {
    for (const l of linhas) {
      if (!l.courseId || l.acao === 'conflito' || l.acao.startsWith('arquivado') || l.acao.startsWith('não criado')) continue;
      const r = await validateDraft(db, l.courseId);
      if (!r.ok) throw new Error(`${l.slug}: rascunho gravado não compila: ${r.errors.map((e) => e.message).join('; ')}`);
      l.avisosMotor = {};
      for (const w of r.warnings) l.avisosMotor[w.code] = (l.avisosMotor[w.code] ?? 0) + 1;
    }
  }
  const cont = (a: string) => linhas.filter((l) => l.acao === a).length;
  console.log(`${tag} resumo: ${linhas.length} linhas · criados ${cont('criado')} · atualizados ${cont('atualizado')} · sem mudanças ${cont('sem mudanças')} · arquivados ${cont('arquivado (fundido)') + cont('arquivado (já estava)')} · aula 3 ${cont('aula 3 acrescentada')} · conflitos ${cont('conflito')} · simulados ${cont('simulado (criaria)') + cont('simulado (atualizaria)')}`);
  return linhas;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const { db, close } = createDb(url, { max: 2 });
  try {
    const linhas = await run(db, args);
    if (args.saida && !args.dryRun) {
      mkdirSync(path.dirname(path.resolve(args.saida)), { recursive: true });
      writeFileSync(path.resolve(args.saida), `${JSON.stringify({ geradoEm: new Date().toISOString(), cursos: linhas }, null, 2)}\n`);
      console.log(`[pacote-15] resultado gravado em ${args.saida}`);
    }
    if (linhas.some((l) => l.acao === 'conflito')) process.exitCode = 2;
  } finally {
    await close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(`[pacote-15] erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
