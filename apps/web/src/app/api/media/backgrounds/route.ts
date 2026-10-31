import { getDb, media } from '@lms/db';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';

/** Ambientes: cores predefinidas + imagens enviadas pelo workspace. */
export const BACKGROUND_PRESETS = [
  { id: 'claro', name: 'Claro', type: 'color' as const, value: '#F7F8FA' },
  { id: 'branco', name: 'Branco', type: 'color' as const, value: '#FFFFFF' },
  { id: 'areia', name: 'Areia', type: 'color' as const, value: '#EFE6D8' },
  { id: 'mar', name: 'Mar', type: 'color' as const, value: '#0E7C86' },
  { id: 'marinho', name: 'Marinho', type: 'color' as const, value: '#16213A' },
  { id: 'grafite', name: 'Grafite', type: 'color' as const, value: '#2B2F36' },
];

export async function GET() {
  return route(async () => {
    const viewer = await requireStaff();
    const images = await media.listAssets(getDb(), viewer.workspace.id, 'image');
    // cenários: imagens com metadados `scenery` (enquadramento e posição sugeridos); o estúdio os lista num grupo próprio
    return {
      presets: BACKGROUND_PRESETS,
      images: images.map((a) => ({ id: a.id, name: a.originalName ?? a.id, assetId: a.id, url: `/api/assets/${a.id}`, ...(a.metadata?.scenery ? { scenery: a.metadata.scenery } : {}) })),
    };
  });
}
