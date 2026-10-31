import { describe, expect, it } from 'vitest';
import { PresentationSchema } from '@lms/course-schema';
import { inferCameraZone, parseArgs, presentationFrom } from '../src/scripts/import-markdown-course';

/* Importador: --zone-cameras (estúdio com zonas), puro, sem banco. */
const source = PresentationSchema.parse({
  avatarId: 'look_principal',
  cameras: [
    { id: 'cam_principal', name: 'Principal', lookId: 'look_principal' },
    { id: 'cam_estudio_esq', name: 'Estúdio · Marina à esquerda', lookId: 'look_esq', placement: 'full_frame' },
    { id: 'cam_estudio_dir', name: 'Estúdio · Marina à direita', lookId: 'look_dir', placement: 'full_frame' },
    { id: 'cam_estudio_34', name: 'Estúdio · 3/4', lookId: 'look_34', placement: 'full_frame', previewUrl: 'https://x/34.png' },
    { id: 'cam_gerando', name: 'Gerando', lookId: '', status: 'generating', placement: 'full_frame', zone: 'left' },
  ],
});

describe('importador: --zone-cameras', () => {
  it('lê a flag; zona gravada ou deduzida do id/nome', () => {
    expect(parseArgs(['--file', 'x.md', '--zone-cameras', 'cam_estudio_esq,cam_estudio_dir,cam_estudio_34']).zoneCameras).toEqual(['cam_estudio_esq', 'cam_estudio_dir', 'cam_estudio_34']);
    expect(parseArgs(['--file', 'x.md']).zoneCameras).toBeUndefined();
    expect(inferCameraZone({ id: 'cam_estudio_esq', name: '' })).toBe('left');
    expect(inferCameraZone({ id: 'cam_estudio_dir', name: '' })).toBe('right');
    expect(inferCameraZone({ id: 'cam_estudio_34', name: '' })).toBe('center');
    expect(inferCameraZone({ id: 'x', name: 'Câmera 3/4' })).toBe('center');
    expect(inferCameraZone({ id: 'cam_x', name: 'Marina à direita', zone: 'left' })).toBe('left');
    expect(inferCameraZone({ id: 'cam_principal', name: 'Principal' })).toBeUndefined();
  });

  it('só as câmeras de zona, com zona; a 3/4 vira a principal (avatar = o look dela)', () => {
    const p = presentationFrom(source, undefined, ['cam_estudio_esq', 'cam_estudio_dir', 'cam_estudio_34']);
    expect(p.cameras.map((c) => [c.id, c.zone])).toEqual([['cam_estudio_34', 'center'], ['cam_estudio_esq', 'left'], ['cam_estudio_dir', 'right']]);
    expect(p.avatarId).toBe('look_34');
    expect(p.avatarPreviewUrl).toBe('https://x/34.png');
    expect(p.directionStyle.cameraMode).toBe('single');
    // a origem não muda
    expect(source.cameras.find((c) => c.id === 'cam_estudio_esq')?.zone).toBeUndefined();
  });

  it('erros claros: câmera inexistente, ainda gerando, sem zona ou sem lateral', () => {
    expect(() => presentationFrom(source, undefined, ['cam_estudio_esq', 'cam_nao_existe'])).toThrow(/não existe/);
    expect(() => presentationFrom(source, undefined, ['cam_gerando'])).toThrow(/não está pronta/);
    expect(() => presentationFrom(source, undefined, ['cam_principal'])).toThrow(/não tem zona/);
    expect(() => presentationFrom(source, undefined, ['cam_estudio_34'])).toThrow(/câmera lateral/);
  });
});
