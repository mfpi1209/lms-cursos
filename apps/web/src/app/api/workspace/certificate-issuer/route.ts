import { z } from 'zod';
import { CertificateIssuerSchema } from '@lms/course-schema';
import { getDb, certificates } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireStaff } from '@/server/viewer';

/** Emissor dos certificados do workspace (instituição, CNPJ, quem assina, logo e assinatura). Só a equipe. */
export const IssuerBody = z.object({ issuer: CertificateIssuerSchema });

export async function GET() {
  return route(async () => {
    const viewer = await requireStaff();
    return { issuer: await certificates.getIssuer(getDb(), viewer.workspace.id) };
  });
}

/** Grava o emissor; vale só para certificados emitidos depois (os já emitidos guardam os dados do dia da emissão). */
export async function PUT(req: Request) {
  return route(async () => {
    const viewer = await requireStaff();
    const { issuer } = await parseBody(req, IssuerBody);
    await certificates.setIssuer(getDb(), { workspaceId: viewer.workspace.id, issuer });
    return { issuer: await certificates.getIssuer(getDb(), viewer.workspace.id) };
  });
}
