import { describe, expect, it } from 'vitest';
import { certificatePendingItems, certificateSheetHref, certificateVerifyHref } from './certificate-card';

describe('certificatePendingItems', () => {
  it('avaliação e reflexão pedem tentativa nova; tarefa abre a aula', () => {
    const items = certificatePendingItems(
      [
        { kind: 'assessment', lessonId: 'a1', label: 'Avaliação: 1 de 3' },
        { kind: 'reflection', lessonId: 'a2', label: 'Reflexão' },
        { kind: 'task', lessonId: 'a3', label: 'Tarefa' },
      ],
      'enr1',
    );
    expect(items[0]).toMatchObject({ href: '/aprender/enr1/aulas/a1?reiniciar=1', action: 'Refazer avaliação' });
    expect(items[1]).toMatchObject({ href: '/aprender/enr1/aulas/a2?reiniciar=1', action: 'Responder reflexão' });
    expect(items[2]).toMatchObject({ href: '/aprender/enr1/aulas/a3', action: 'Abrir a aula' });
  });
  it('pendência do curso usa o link de retomada, se houver', () => {
    expect(certificatePendingItems([{ kind: 'course', label: 'Concluir' }], 'e', '/x')[0]).toEqual({ label: 'Concluir', href: '/x', action: 'Continuar o curso' });
    expect(certificatePendingItems([{ kind: 'course', label: 'Concluir' }], 'e')[0]).toEqual({ label: 'Concluir' });
  });
  it('urls públicas', () => {
    expect(certificateSheetHref('DNA-AAAA-BBBB')).toBe('/certificado/DNA-AAAA-BBBB/imprimir');
    expect(certificateVerifyHref('DNA-AAAA-BBBB')).toBe('/certificado/DNA-AAAA-BBBB');
  });
});
