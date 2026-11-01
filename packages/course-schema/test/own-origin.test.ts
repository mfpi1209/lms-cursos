import { describe, expect, it } from 'vitest';
import { compileCourse } from '../src/compile';
import { comunicacaoPrimeiroEmprego } from '../src/examples';
import { externalHostOf, externalImageRefs, isOwnPath, ownImageUrl } from '../src/own-origin';

const HEYGEN = 'https://files2.heygen.ai/talking_photo/abc/def.WEBP?Expires=1&Signature=x';

describe('privacidade do aluno: imagens só do nosso domínio', () => {
  it('só caminho do próprio domínio passa; link de fora, protocolo relativo e vazio não', () => {
    expect(ownImageUrl('/api/assets/ast_1')).toBe('/api/assets/ast_1');
    expect(ownImageUrl(HEYGEN)).toBeUndefined();
    expect(ownImageUrl('//cdn.exemplo.com/x.png')).toBeUndefined();
    expect(ownImageUrl('/\\cdn.exemplo.com/x.png')).toBeUndefined();
    expect(ownImageUrl('data:image/png;base64,AAAA')).toBeUndefined();
    expect(ownImageUrl('')).toBeUndefined();
    expect(ownImageUrl(undefined)).toBeUndefined();
    expect(isOwnPath('/destaque/c.webp')).toBe(true);
  });

  it('descobre o host externo e ignora o que é nosso', () => {
    expect(externalHostOf(HEYGEN)).toBe('files2.heygen.ai');
    expect(externalHostOf('/api/assets/ast_1')).toBeNull();
    expect(externalHostOf(undefined)).toBeNull();
  });

  it('lista retrato e câmeras que apontam para fora', () => {
    const refs = externalImageRefs({ avatarPreviewUrl: HEYGEN, cameras: [{ previewUrl: '/api/assets/ast_1' }, { previewUrl: HEYGEN }] as never });
    expect(refs).toEqual([
      { field: 'avatarPreviewUrl', host: 'files2.heygen.ai' },
      { field: 'cameras[1].previewUrl', host: 'files2.heygen.ai' },
    ]);
  });

  it('a publicação avisa (EXTERNAL_IMAGE) quando o retrato está fora, e não avisa quando está na plataforma', () => {
    const doc = comunicacaoPrimeiroEmprego;
    const fora = compileCourse({ ...doc, presentation: { ...doc.presentation, avatarPreviewUrl: HEYGEN } });
    expect(fora.warnings.some((w) => w.code === 'EXTERNAL_IMAGE')).toBe(true);
    expect(fora.ok).toBe(true);
    const dentro = compileCourse({ ...doc, presentation: { ...doc.presentation, avatarPreviewUrl: '/api/assets/ast_1' } });
    expect(dentro.warnings.some((w) => w.code === 'EXTERNAL_IMAGE')).toBe(false);
  });
});
