import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DomainError, getDb, media, schema } from '@lms/db';
import { getStorage } from '@lms/media';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { publicBumper } from '@/server/bumper';

const PatchSchema = z.object({ default: z.boolean() });

async function requireBumper(workspaceId: string, assetId: string) {
  const a = await media.getAsset(getDb(), assetId);
  if (!a || a.workspaceId !== workspaceId || !a.metadata?.bumper) throw new DomainError('NOT_FOUND', 'Vinheta não encontrada');
  return a;
}

/** Marca (ou desmarca) a vinheta como padrão do workspace: uma por proporção; o par 9:16 acompanha. */
export async function PATCH(req: Request, ctx: { params: Promise<{ assetId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { assetId } = await ctx.params;
    const body = await parseBody(req, PatchSchema);
    const db = getDb();
    const a = await requireBumper(viewer.workspace.id, assetId);
    const t = schema.assets;
    const ids = [a.id, ...(a.metadata!.bumper!.verticalAssetId ? [a.metadata!.bumper!.verticalAssetId] : [])];
    for (const id of ids) {
      const cur = await media.getAsset(db, id);
      const b = cur?.metadata?.bumper;
      if (!cur || cur.workspaceId !== viewer.workspace.id || !b) continue;
      if (body.default) {
        await db.update(t).set({ metadata: sql`jsonb_set(${t.metadata}, '{bumper,default}', 'false'::jsonb, true)` }).where(and(eq(t.workspaceId, viewer.workspace.id), sql`${t.metadata}->'bumper'->>'aspect' = ${b.aspect}`, sql`coalesce((${t.metadata}->'bumper'->>'default')::boolean, false)`));
      }
      await media.setAssetMetadata(db, id, { ...cur.metadata, bumper: { ...b, default: body.default } });
    }
    return { bumper: publicBumper((await media.getAsset(db, a.id))!) };
  });
}

/** Apaga a vinheta (e o par 9:16) do workspace: registro e arquivo no storage. Cursos que a referenciam voltam à padrão. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ assetId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { assetId } = await ctx.params;
    const db = getDb();
    const a = await requireBumper(viewer.workspace.id, assetId);
    const storage = await getStorage();
    const ids = [a.id, ...(a.metadata!.bumper!.verticalAssetId ? [a.metadata!.bumper!.verticalAssetId] : [])];
    const deleted: string[] = [];
    for (const id of ids) {
      const cur = await media.getAsset(db, id);
      if (!cur || cur.workspaceId !== viewer.workspace.id || !cur.metadata?.bumper) continue;
      // jobs que apontam para o asset perdem a referência (FK) antes de apagar
      await db.update(schema.mediaJobs).set({ outputAssetId: null }).where(eq(schema.mediaJobs.outputAssetId, id));
      await db.delete(schema.assets).where(eq(schema.assets.id, id));
      if (storage.provider === cur.storageProvider) await storage.deleteObject(cur.storageKey).catch(() => undefined);
      deleted.push(id);
    }
    return { deleted };
  });
}
