import { z } from 'zod';
import type { CourseDocument } from './course';
import { freeCourseWorkloadMinutes } from './free-course';

/**
 * Certificado de conclusão por curso.
 *
 * Emissor: configurado por workspace (Estúdio › Configurações › Certificado). Sem configuração, a folha sai com o nome
 * da marca da plataforma, sem CNPJ e sem assinatura. Código no mesmo formato do selo (`DNA-XXXX-XXXX`), verificável
 * em `/certificado/<código>` (o QR da folha aponta para lá).
 *
 * Regra de emissão (decidida pelo dono): curso concluído (aulas obrigatórias) + todas as avaliações das aulas
 * obrigatórias aprovadas no último resultado ("X de Y") + reflexões obrigatórias respondidas + tarefas obrigatórias
 * aprovadas. Ver `evaluateCertificateRule`.
 */

const CNPJ_RE = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

export const CertificateIssuerSchema = z.object({
  /** razão social ou nome da instituição que emite; vazio = nome da marca da plataforma */
  institution: z.string().trim().max(120).default(''),
  /** CNPJ formatado (00.000.000/0000-00); vazio = não aparece */
  cnpj: z
    .string()
    .trim()
    .default('')
    .refine((v) => v === '' || CNPJ_RE.test(v), 'CNPJ no formato 00.000.000/0000-00'),
  signerName: z.string().trim().max(120).default(''),
  signerRole: z.string().trim().max(120).default(''),
  /** imagens do workspace (assets kind 'image'); ausentes = sem logo do emissor / sem assinatura desenhada */
  logoAssetId: z.string().min(1).optional(),
  signatureAssetId: z.string().min(1).optional(),
  /** mostra a marca da plataforma (DNA Work) junto ao emissor; desligue quando o emissor for outra instituição */
  showPlatformBrand: z.boolean().default(true),
});
export type CertificateIssuer = z.infer<typeof CertificateIssuerSchema>;

export const EMPTY_CERTIFICATE_ISSUER: CertificateIssuer = CertificateIssuerSchema.parse({});

/** Lê o emissor gravado (jsonb) sem quebrar com dados antigos ou incompletos. */
export function parseCertificateIssuer(raw: unknown): CertificateIssuer {
  const r = CertificateIssuerSchema.safeParse(raw ?? {});
  return r.success ? r.data : EMPTY_CERTIFICATE_ISSUER;
}

/** Só dígitos → 00.000.000/0000-00 (para a máscara do formulário). Menos de 14 dígitos: devolve o que der. */
export function formatCnpj(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 14);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12, 14)];
  let out = parts[0]!;
  if (parts[1]) out += `.${parts[1]}`;
  if (parts[2]) out += `.${parts[2]}`;
  if (parts[3]) out += `/${parts[3]}`;
  if (parts[4]) out += `-${parts[4]}`;
  return out;
}

/** Conteúdo programático gravado no certificado: módulos (com aulas obrigatórias da matrícula) e seus minutos. */
export interface CertificateProgramItem {
  title: string;
  minutes: number;
  lessons: string[];
}

export function certificateProgramOf(doc: CourseDocument, optionalLessonIds: Iterable<string> = []): CertificateProgramItem[] {
  const optional = new Set(optionalLessonIds);
  const out: CertificateProgramItem[] = [];
  for (const m of doc.modules) {
    const lessons = m.lessons.filter((l) => !optional.has(l.id));
    if (!lessons.length) continue;
    out.push({ title: m.title, minutes: lessons.reduce((n, l) => n + (l.estimatedMinutes ?? 0), 0), lessons: lessons.map((l) => l.title) });
  }
  return out;
}

/** Carga horária gravada no certificado (minutos): a declarada no certificado/briefing, senão a soma das aulas. */
export function certificateWorkloadMinutes(doc: CourseDocument): number {
  return freeCourseWorkloadMinutes(doc);
}

/* ------------------------------------------------------------------------ */
/* Regra de emissão (pura)                                                   */
/* ------------------------------------------------------------------------ */

export type CertificatePendingKind = 'course' | 'assessment' | 'reflection' | 'task';

export interface CertificatePending {
  kind: CertificatePendingKind;
  /** aula onde está a pendência (ausente em `course`) */
  lessonId?: string;
  lessonTitle?: string;
  /** texto curto para a aluna: "Avaliação do módulo 2: 1 de 3 acertos (precisa de 2)" */
  label: string;
}

export interface CertificateRuleInput {
  courseCompleted: boolean;
  /** avaliações das aulas obrigatórias, já resumidas pelo último resultado */
  assessments: Array<{ lessonId: string; lessonTitle: string; title: string; correct: number; total: number; passMin: number; passed: boolean | null }>;
  /** reflexões obrigatórias das aulas obrigatórias ainda sem resposta */
  missingReflections: Array<{ lessonId: string; lessonTitle: string; title: string }>;
  /** tarefas obrigatórias ainda não aprovadas */
  pendingTasks: Array<{ lessonId: string; lessonTitle?: string; title: string; status: 'missing' | 'submitted' | 'returned' | 'approved' }>;
}

export interface CertificateRuleResult {
  eligible: boolean;
  pending: CertificatePending[];
}

const TASK_STATUS_LABEL = { missing: 'ainda não enviada', submitted: 'aguardando correção', returned: 'devolvida para ajuste', approved: 'aprovada' } as const;

export function evaluateCertificateRule(input: CertificateRuleInput): CertificateRuleResult {
  const pending: CertificatePending[] = [];
  if (!input.courseCompleted) pending.push({ kind: 'course', label: 'Concluir todas as aulas obrigatórias do curso' });
  for (const a of input.assessments) {
    if (a.passed === true) continue;
    const label =
      a.passed === false
        ? `${a.title}: ${a.correct} de ${a.total} acertos (precisa de ${a.passMin}). Refaça a avaliação.`
        : `${a.title}: responder a avaliação (precisa de ${a.passMin} de ${a.total} acertos)`;
    pending.push({ kind: 'assessment', lessonId: a.lessonId, lessonTitle: a.lessonTitle, label });
  }
  for (const r of input.missingReflections) pending.push({ kind: 'reflection', lessonId: r.lessonId, lessonTitle: r.lessonTitle, label: `Responder a reflexão "${r.title}"` });
  for (const t of input.pendingTasks) {
    if (t.status === 'approved') continue;
    pending.push({ kind: 'task', lessonId: t.lessonId, ...(t.lessonTitle ? { lessonTitle: t.lessonTitle } : {}), label: `Tarefa "${t.title}": ${TASK_STATUS_LABEL[t.status]}` });
  }
  return { eligible: pending.length === 0, pending };
}
