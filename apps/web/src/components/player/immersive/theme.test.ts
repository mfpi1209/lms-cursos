import { describe, expect, it } from 'vitest';
import { resolveBrand } from './theme';
import type { PlatformContext } from '../types';

const MARK = { name: 'DNA Work', wordmark: 'dna work', logoLight: '/brand/dnawork/logo.png', logoDark: '/brand/dnawork/logo-branco.png', logoRatio: 4 };
const ctx = (over: Partial<PlatformContext> = {}, lessons = 3, current = 1): PlatformContext =>
  ({
    theme: 'immersive',
    branding: {},
    courseTitle: 'Que roupa eu uso?',
    lessons: Array.from({ length: lessons }, (_, i) => ({ id: `a${i}`, title: `Aula ${i}`, status: 'not_started' as const, href: '' })),
    currentLessonId: `a${current}`,
    ...over,
  }) as PlatformContext;

describe('cabeçalho do player: logo à esquerda e nome curto do curso no centro', () => {
  it('o centro é o nome curto do curso (o do catálogo), em todos os cursos', () => {
    expect(resolveBrand(ctx({ courseShortTitle: 'Meu primeiro dia', courseTitle: 'Primeiro dia: como chegar preparado' })).title).toBe('Meu primeiro dia');
    expect(resolveBrand(ctx({ courseShortTitle: '  Terminei. E agora?  ' })).title).toBe('Terminei. E agora?');
  });
  it('sem nome curto (curso fora da tabela do catálogo), vale o título do curso; nunca a posição "Aula N de M"', () => {
    const b = resolveBrand(ctx());
    expect(b.title).toBe('Que roupa eu uso?');
    expect(b.title).not.toMatch(/^Aula \d/);
  });
  it('branding.wordmark e branding.subtitle gravados no curso não entram no cabeçalho (nem o "DNA Work" do C02)', () => {
    const b = resolveBrand(ctx({ courseShortTitle: 'Que roupa eu uso?', branding: { subtitle: 'DNA Work', wordmark: 'Roupa no trabalho' } }));
    expect(b.title).toBe('Que roupa eu uso?');
    expect(JSON.stringify(b)).not.toContain('DNA Work');
    expect(JSON.stringify(b)).not.toContain('Roupa no trabalho');
  });
  it('a mesma regra vale para curso de uma aula só', () => {
    expect(resolveBrand(ctx({ courseShortTitle: 'Posso postar isso?', branding: { subtitle: 'Sua próxima entrevista' } }, 1, 0)).title).toBe('Posso postar isso?');
  });
  it('a marca do workspace vai no contexto para o canto esquerdo (logo do catálogo)', () => {
    const b = resolveBrand(ctx({ brandMark: MARK }));
    expect(b.mark).toEqual(MARK);
  });
  it('sem marca no contexto, não há logo (o cabeçalho cai para o título em texto)', () => {
    expect(resolveBrand(ctx()).mark).toBeUndefined();
  });
});
