import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@lms/db';
import { parseBody } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { advanceInstructorTemplate, quoteInstructor, startInstructor } from '@/server/new-instructor';
import { getLooksProvider, unavailable } from '../../media/looks/_lib/looks';
import { instructorDeps, instructorError } from './_lib/instructors';

const BodySchema = z.object({
  name: z.string().trim().min(2).max(40),
  role: z.string().trim().min(1).max(60),
  pronoun: z.enum(['she', 'he', 'they']),
  description: z.string().trim().min(20, 'Descreva o personagem com mais detalhes (aparência, idade, roupa).').max(600),
  studioKey: z.string().min(1).max(60),
  voiceKey: z.string().min(1).max(60),
  castDetails: z.string().max(600).optional(),
  /** sem isto: só o orçamento. Com `true`: aprovação da ação paga (4 visuais no HeyGen). */
  confirmPaid: z.boolean().default(false),
});

/**
 * Novo instrutor (personagem fictício por texto + 3 câmeras no estúdio + voz da biblioteca).
 * 1) sem `confirmPaid`: orçamento, nada chamado no provedor;
 * 2) com `confirmPaid: true`: grava o instrutor e dá o primeiro passo (cria o personagem).
 * Depois a tela chama `POST /api/library/instructors/:key` até terminar.
 */
export async function POST(req: Request) {
  try {
    const viewer = await requireEditor();
    const body = await parseBody(req, BodySchema);
    const provider = getLooksProvider();
    if (provider.kind === 'unavailable') return unavailable();
    const simulated = provider.kind === 'simulated';
    const db = getDb();
    const { confirmPaid, ...input } = body;
    if (!confirmPaid) return NextResponse.json({ requiresConfirmation: true, quote: await quoteInstructor(db, viewer.workspace.id, input, simulated) });
    const presenterKey = await startInstructor(db, viewer.workspace.id, viewer.user.id, input, simulated);
    const status = await advanceInstructorTemplate(db, { workspaceId: viewer.workspace.id, userId: viewer.user.id, presenterKey }, instructorDeps(db, viewer.workspace.id, provider, presenterKey));
    return NextResponse.json({ status }, { status: 201 });
  } catch (e) {
    return instructorError(e);
  }
}
