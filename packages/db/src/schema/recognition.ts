import { pgTable, text, timestamp, integer, jsonb, boolean, index, unique } from 'drizzle-orm/pg-core';
import { user } from './auth';
import type { CertificateIssuer, CertificateProgramItem } from '@lms/course-schema';
import { workspaces } from './identity';
import { courses, courseVersions } from './authoring';
import { enrollments } from './learning';

/**
 * Checagem final de uma trilha: cada envio fica registrado (pode refazer sem limite). A trilha é identificada
 * pela chave estável (`trailSlug` de `courses.trail`); o nome mostrado vai junto, para o histórico.
 */
export const trailCheckAttempts = pgTable(
  'trail_check_attempts',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    trailKey: text('trail_key').notNull(),
    trailName: text('trail_name').notNull(),
    answers: jsonb('answers').$type<Record<string, string>>().notNull(),
    correct: integer('correct').notNull(),
    total: integer('total').notNull(),
    passed: boolean('passed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('trail_check_attempts_user_trail_idx').on(t.userId, t.trailKey)],
);

/**
 * Selo DNA Work de uma trilha. Um por pessoa e trilha (reemitir = mesmo selo). Guarda o necessário para a
 * página pública de verificação e para exportar depois (Open Badges): nome, trilha, competências, data e
 * os cursos que compuseram o selo. `revokedAt` invalida o código sem apagar o histórico.
 */
export const trailBadges = pgTable(
  'trail_badges',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    /** `null` depois que a conta foi apagada a pedido (`dados:apagar`): o selo fica cancelado e sem nome, sem ligação com a pessoa */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    trailKey: text('trail_key').notNull(),
    trailName: text('trail_name').notNull(),
    /** nome da pessoa no momento da emissão (a verificação pública não consulta o cadastro) */
    holderName: text('holder_name').notNull(),
    competencies: jsonb('competencies').$type<string[]>().notNull(),
    courses: jsonb('courses').$type<Array<{ courseId: string; title: string }>>().notNull(),
    /** carga horária da trilha (minutos) no momento da emissão; null em selos anteriores (a leitura recalcula) */
    workloadMinutes: integer('workload_minutes'),
    checkAttemptId: text('check_attempt_id').references(() => trailCheckAttempts.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [unique('trail_badges_code_uq').on(t.code), unique('trail_badges_user_trail_uq').on(t.userId, t.trailKey), index('trail_badges_workspace_idx').on(t.workspaceId)],
);

/**
 * Certificado de conclusão de UM curso para UMA matrícula (emitido uma vez; reemitir = o mesmo certificado).
 * Grava no momento da emissão tudo o que a folha e a verificação pública mostram (nome, RGM, curso, carga horária,
 * conteúdo programático e o emissor), para que mudanças posteriores no cadastro, no curso ou no emissor não alterem
 * um certificado já entregue. `revokedAt` invalida o código sem apagar o histórico. O código tem o formato do selo
 * (`DNA-XXXX-XXXX`) e não se repete entre selos e certificados.
 */
export const courseCertificates = pgTable(
  'course_certificates',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    courseVersionId: text('course_version_id').references(() => courseVersions.id, { onDelete: 'set null' }),
    enrollmentId: text('enrollment_id').references(() => enrollments.id, { onDelete: 'set null' }),
    /** `null` depois que a conta foi apagada a pedido: o certificado fica cancelado e sem nome */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    holderName: text('holder_name').notNull(),
    /** RGM no momento da emissão; a verificação pública NÃO mostra (só a folha, para a própria pessoa e a equipe) */
    holderRgm: text('holder_rgm'),
    courseTitle: text('course_title').notNull(),
    workloadMinutes: integer('workload_minutes').notNull(),
    program: jsonb('program').$type<CertificateProgramItem[]>().notNull().default([]),
    issuer: jsonb('issuer').$type<CertificateIssuer>().notNull(),
    /** quando a pessoa concluiu o curso (pode ser antes da emissão, se a regra fechou depois) */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
  },
  (t) => [
    unique('course_certificates_code_uq').on(t.code),
    unique('course_certificates_enrollment_uq').on(t.enrollmentId),
    index('course_certificates_user_idx').on(t.userId),
    index('course_certificates_course_idx').on(t.courseId),
  ],
);
