import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import * as s from '../schema';
import type { WorkspaceRole } from '../schema/identity';

export async function getMembership(db: DbOrTx, workspaceId: string, userId: string) {
  const [row] = await db.select().from(s.workspaceMemberships).where(and(eq(s.workspaceMemberships.workspaceId, workspaceId), eq(s.workspaceMemberships.userId, userId))).limit(1);
  return row ?? null;
}

export async function listMembershipsForUser(db: DbOrTx, userId: string) {
  return db
    .select({ workspaceId: s.workspaceMemberships.workspaceId, role: s.workspaceMemberships.role, workspaceName: s.workspaces.name, workspaceSlug: s.workspaces.slug, branding: s.workspaces.branding })
    .from(s.workspaceMemberships)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.workspaceMemberships.workspaceId))
    .where(eq(s.workspaceMemberships.userId, userId));
}

export async function listWorkspaceUsers(db: DbOrTx, workspaceId: string, role?: WorkspaceRole) {
  const where = role ? and(eq(s.workspaceMemberships.workspaceId, workspaceId), eq(s.workspaceMemberships.role, role)) : eq(s.workspaceMemberships.workspaceId, workspaceId);
  return db
    .select({ id: s.user.id, name: s.user.name, email: s.user.email, role: s.workspaceMemberships.role })
    .from(s.workspaceMemberships)
    .innerJoin(s.user, eq(s.user.id, s.workspaceMemberships.userId))
    .where(where)
    .orderBy(s.user.name);
}

export const STAFF_ROLES: WorkspaceRole[] = ['admin', 'author', 'reviewer'];
export function isStaff(role: WorkspaceRole | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role);
}
export function canEdit(role: WorkspaceRole | null | undefined): boolean {
  return role === 'admin' || role === 'author';
}
export function canPublish(role: WorkspaceRole | null | undefined): boolean {
  return role === 'admin' || role === 'author';
}
export function canEnroll(role: WorkspaceRole | null | undefined): boolean {
  return role === 'admin';
}
