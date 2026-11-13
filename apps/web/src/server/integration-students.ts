import { z } from 'zod';
import { getDb, students } from '@lms/db';
import { KeyedLimiter, MAGIC_LINK_CALLBACK, safeLocalPath } from '@/lib/auth-access';
import { HttpError } from './viewer';
import { createMagicLinkUrl } from './magic-link';
import type { IntegrationContext } from './integration-auth';

/** Links de acesso gerados por token: 1.000 por hora (memória do processo, como os demais limites). Cada link é um login pronto. */
export const LINK_RATE = { max: 1000, windowMs: 60 * 60_000 } as const;
let linkLimiter = new KeyedLimiter(LINK_RATE.max, LINK_RATE.windowMs);
export function resetLinkLimit() {
  linkLimiter = new KeyedLimiter(LINK_RATE.max, LINK_RATE.windowMs);
}

/** Nome em português de cada `status` (o `status` em inglês continua na resposta). */
const SITUACAO = { created: 'criado', updated: 'atualizado', unchanged: 'sem_mudanca', error: 'erro' } as const;

const rgmField = z.union([z.string(), z.number()]).transform((v) => String(v));
const studentRow = z.object({
  nome: z.string().default(''),
  email: z.string().default(''),
  rgm: rgmField.default(''),
  telefone: z.union([z.string(), z.null()]).optional(),
  cursos: z.array(z.string()).max(50).optional(),
});

export const studentsBody = z.object({
  alunos: z.array(studentRow).min(1, 'Envie ao menos um aluno').max(students.STUDENT_BATCH_MAX, `No máximo ${students.STUDENT_BATCH_MAX} alunos por chamada`),
  gerarLink: z.boolean().optional(),
  callbackURL: z.string().max(300).optional(),
});

/** `POST /api/integracao/v1/alunos`: cadastra/atualiza o lote (idempotente pelo RGM; sem RGM, pelo e-mail) e, se pedido, devolve o link de acesso de cada linha aceita. */
export async function postStudents(ctx: IntegrationContext, raw: unknown) {
  const body = studentsBody.parse(raw);
  const wantLink = body.gerarLink === true;
  let callbackURL = MAGIC_LINK_CALLBACK;
  if (body.callbackURL !== undefined) {
    callbackURL = safeLocalPath(body.callbackURL, '');
    if (!callbackURL) throw new HttpError(422, 'callbackURL deve ser um caminho do próprio site, como /aprender');
  }
  if (wantLink) {
    // reserva a cota antes de gravar qualquer coisa (limite por token)
    for (let i = 0; i < body.alunos.length; i++) {
      if (!linkLimiter.take(ctx.tokenId)) throw new HttpError(429, 'Limite de links de acesso por hora excedido para este token');
    }
  }
  const out = await students.upsertStudents(getDb(), { workspaceId: ctx.workspaceId, actorId: ctx.createdBy, rows: body.alunos, source: `integracao:${ctx.tokenName}` });
  const resultados = [];
  for (const r of out.results) {
    const item: Record<string, unknown> = {
      linha: r.index + 1,
      email: r.email,
      status: r.status,
      situacao: SITUACAO[r.status],
      ...(r.code ? { codigo: r.code } : {}),
      ...(r.reason ? { motivo: r.reason } : {}),
      ...(r.emailChanged ? { emailAlterado: true } : {}),
      ...(r.userId ? { userId: r.userId } : {}),
      cursosMatriculados: r.enrolled,
      cursosJaMatriculados: r.alreadyEnrolled,
    };
    if (wantLink && r.status !== 'error') {
      try {
        // o link vale como senha até vencer: vai só na resposta, nunca em log
        item.linkAcesso = await createMagicLinkUrl(r.email, { callbackURL });
      } catch {
        item.linkAcesso = null;
        item.motivoLink = 'Não foi possível gerar o link; tente de novo';
      }
    }
    resultados.push(item);
  }
  const resumo = { ...out.summary, criado: out.summary.created, atualizado: out.summary.updated, sem_mudanca: out.summary.unchanged, erro: out.summary.error };
  return { resumo, resultados };
}

/** `GET /api/integracao/v1/cursos`: slugs que o integrador pode enviar em `cursos`. */
export async function getCourses(ctx: IntegrationContext) {
  return { cursos: await students.listPublishedCourseSlugs(getDb(), ctx.workspaceId) };
}
