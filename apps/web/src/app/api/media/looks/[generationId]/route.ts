import { NextResponse } from 'next/server';
import { getDb, media } from '@lms/db';
import { SimulatedHeyGenLooks } from '@lms/media';
import { HttpError, requireStaff } from '@/server/viewer';
import { getLooksProvider, LOOK_ID_RE, looksError, simulatedGenerator, unavailable } from '../_lib/looks';

/**
 * Situação da geração de um novo ângulo: `{ status, lookId?, previewUrl?, error? }`.
 * Geração real: só ids registrados numa câmera (`presentation.cameras[].generationId`)
 * de um curso do workspace de quem consulta — ninguém consulta gerações de outro
 * workspace com a chave do HeyGen do servidor. O cliente grava a câmera antes de
 * consultar; se o rascunho ainda não foi salvo, a consulta devolve 404 e o próximo
 * ciclo tenta de novo. Gerações simuladas (determinísticas, sem provedor) não são filtradas.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ generationId: string }> }) {
  try {
    const viewer = await requireStaff();
    const { generationId } = await ctx.params;
    if (!LOOK_ID_RE.test(generationId)) throw new HttpError(400, 'Identificador de geração inválido');
    // gerações simuladas continuam legíveis mesmo depois de configurar a chave real
    if (SimulatedHeyGenLooks.isSimulatedId(generationId)) {
      return NextResponse.json({ ...(await simulatedGenerator().getLookGeneration(generationId)), simulated: true });
    }
    if (!(await media.isCameraGenerationInWorkspace(getDb(), viewer.workspace.id, generationId))) throw new HttpError(404, 'Geração não encontrada nas câmeras dos cursos deste workspace');
    const provider = getLooksProvider();
    if (provider.kind === 'unavailable') return unavailable();
    if (provider.kind === 'simulated') throw new HttpError(409, 'Esta geração foi feita no HeyGen real, mas o servidor está em modo de demonstração.');
    const r = await provider.generator.getLookGeneration(generationId);
    return NextResponse.json({ ...r, simulated: false });
  } catch (e) {
    return looksError(e);
  }
}
