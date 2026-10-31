import { headers } from 'next/headers';
import { cache } from 'react';
import { getDb, identity, type schema } from '@lms/db';
import { auth } from '@/lib/auth';

export type Role = (typeof schema.roleEnum.enumValues)[number];

export interface Viewer {
  user: { id: string; name: string; email: string };
  workspace: { id: string; name: string; slug: string; branding: { name?: string; primaryColor?: string } };
  role: Role;
}

/**
 * Sessão + papel no workspace. Um único workspace no incremento 1: usa a
 * primeira (e única) associação do usuário. Toda autorização passa por aqui no
 * servidor — nunca pelo cliente.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const memberships = await identity.listMembershipsForUser(getDb(), session.user.id);
  const m = memberships[0];
  if (!m) return null;
  return {
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    workspace: { id: m.workspaceId, name: m.workspaceName, slug: m.workspaceSlug, branding: m.branding },
    role: m.role,
  };
});

export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: unknown) {
    super(message);
  }
}

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new HttpError(401, 'Faça login para continuar');
  return v;
}

export async function requireStaff(): Promise<Viewer> {
  const v = await requireViewer();
  if (!identity.isStaff(v.role)) throw new HttpError(403, 'Área restrita à equipe');
  return v;
}

export async function requireEditor(): Promise<Viewer> {
  const v = await requireViewer();
  if (!identity.canEdit(v.role)) throw new HttpError(403, 'Você não tem permissão para editar cursos');
  return v;
}

export async function requireAdmin(): Promise<Viewer> {
  const v = await requireViewer();
  if (v.role !== 'admin') throw new HttpError(403, 'Apenas administradores');
  return v;
}

export function homeFor(role: Role): string {
  return identity.isStaff(role) ? '/estudio' : '/aprender';
}
