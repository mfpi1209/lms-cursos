import { z } from 'zod';
import { getDb, students } from '@lms/db';
import { emailConfigFromEnv, magicLinkEmail, sendEmail } from '@lms/email';
import { KeyedLimiter, magicLinkTtlHours } from '@/lib/auth-access';
import { CSV_MAX_ROWS } from '@/lib/alunos-csv';
import { createMagicLinkUrl } from './magic-link';
import type { Viewer } from './viewer';

/** Máximo de e-mails de acesso por endereço: o mesmo limite dos pedidos de link do login (3 a cada 15 min). */
const mailLimiter = new KeyedLimiter(3, 15 * 60_000);

export const importBody = z.object({
  rows: z
    .array(
      z.object({
        linha: z.number().int().positive(),
        nome: z.string().max(500),
        email: z.string().max(500),
        rgm: z.string().max(200),
        telefone: z.string().max(200).default(''),
        cursos: z.array(z.string().max(200)).max(50).default([]),
      }),
    )
    .min(1)
    .max(CSV_MAX_ROWS),
  dryRun: z.boolean().default(true),
  enviarLink: z.boolean().default(false),
});

/** Estado do envio de e-mail, para a tela avisar quando o transporte só registra em log. */
export function emailState() {
  const c = emailConfigFromEnv();
  return { transport: c.transport, delivers: c.transport !== 'log' };
}

/**
 * Prévia (`dryRun`, não grava) ou aplicação do CSV. Com `enviarLink`, depois de gravar manda o link de acesso por e-mail
 * a quem foi criado, trocou de e-mail ou ganhou matrícula nova (quem só foi conferido, sem mudança, não recebe e-mail de novo).
 */
export async function importStudentsFromCsv(viewer: Viewer, raw: unknown) {
  const body = importBody.parse(raw);
  const out = await students.upsertStudents(getDb(), {
    workspaceId: viewer.workspace.id,
    actorId: viewer.user.id,
    rows: body.rows.map((r) => ({ nome: r.nome, email: r.email, rgm: r.rgm, telefone: r.telefone, cursos: r.cursos })),
    dryRun: body.dryRun,
    source: 'csv',
  });
  const results = out.results.map((r) => ({ ...r, linha: body.rows[r.index]!.linha }));
  let emails: { transport: string; sent: number; failed: number; skipped: number } | undefined;
  if (!body.dryRun && body.enviarLink) {
    const state = emailState();
    emails = { transport: state.transport, sent: 0, failed: 0, skipped: 0 };
    for (const r of results) {
      if (r.status === 'error' || !(r.status === 'created' || r.emailChanged || r.enrolled.length > 0)) {
        if (r.status !== 'error') emails.skipped += 1;
        continue;
      }
      if (!mailLimiter.take(`import:${r.email}`)) {
        emails.skipped += 1;
        continue;
      }
      try {
        const url = await createMagicLinkUrl(r.email);
        if (!url) throw new Error('sem conta');
        await sendEmail(magicLinkEmail({ to: r.email, url, ttlHours: magicLinkTtlHours() }));
        emails.sent += 1;
      } catch {
        emails.failed += 1;
      }
    }
  }
  return { dryRun: body.dryRun, summary: out.summary, results, email: emails, emailState: emailState() };
}
