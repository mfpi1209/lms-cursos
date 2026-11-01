import { pgTable, text, timestamp, integer, jsonb, boolean, index, unique } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { workspaces } from './identity';

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
