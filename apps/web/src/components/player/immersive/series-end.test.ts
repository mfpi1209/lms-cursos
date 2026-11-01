import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EndNode } from '@lms/course-schema';
import type { PlatformSeries } from '../types';
import { EndPanel } from './immersive-player';

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }) as never;
const end = { id: 'fim', type: 'end', title: 'Meu roteiro', summary: doc('Resumo.'), outcomeLabel: 'Curso concluído', closingLine: 'Margem não é chute.' } as unknown as EndNode;
const trail = { name: 'Respeito e diálogo', href: '/aprender/trilhas/respeito-e-dialogo', done: 0, total: 3, badge: false, series: true, sealNote: 'Falta só a checagem final da trilha.' };
const props = { headingRef: null, headingId: 'h1', pending: false, node: end, carry: null, exitHref: '/aprender/c1', canRestart: false, onRestart: vi.fn(), hasRecap: false, onOpenRecap: vi.fn(), achievements: { choices: 2, practices: 0, skippedPractices: 0, reviews: 0, realLife: 'done' as const } };
const render = (extra: Record<string, unknown>) => renderToStaticMarkup(createElement(EndPanel, { ...props, ...extra } as never));

const part1: PlatformSeries = { trail: 'Respeito e diálogo', trailHref: trail.href, part: 1, total: 3, othersDone: false, next: { n: 2, title: 'Discordar sem brigar', href: '/aprender/enr_2/aulas/aula_01', started: false } };
const part3: PlatformSeries = { trail: 'Respeito e diálogo', trailHref: trail.href, part: 3, total: 3, othersDone: true };

describe('fim de uma parte da trilha em série', () => {
  const h = render({ series: part1, courseEnd: { course: 'O outro só é diferente', closingLine: 'Margem não é chute.' }, conquest: { name: 'Curso concluído · O outro só é diferente', trail: { ...trail, done: 0 } } });
  it('mantém a tela de curso concluído, com o chip "Parte 1 concluída"', () => {
    expect(h).toContain('data-course-end="true"');
    expect(h).toMatch(/data-testid="end-chip"[^>]*>.*Parte 1 concluída/);
    expect(h).not.toContain('Curso concluído</span>');
    expect(h).toContain('Você concluiu');
    expect(h).toContain('O outro só é diferente');
    expect(h).toContain('Margem não é chute.');
  });
  it('botão principal "Ir para a Parte 2: título" para a matrícula da próxima parte', () => {
    expect(h).toContain('data-testid="next-part-link"');
    expect(h).toContain('href="/aprender/enr_2/aulas/aula_01"');
    expect(h).toContain('Ir para a Parte 2: Discordar sem brigar');
  });
  it('o selo fica em segundo plano: link secundário e a conquista contando partes', () => {
    expect(h).toContain('data-testid="end-badge-link"');
    expect(h.indexOf('next-part-link')).toBeLessThan(h.indexOf('end-badge-link'));
    expect(h).toContain('Ver o caminho até o Selo');
    expect(h).toContain('1 de 3 partes concluídas');
    expect(h).not.toContain('trail-done-card');
  });
});

describe('fim da última parte', () => {
  const h = render({ series: part3, courseEnd: { course: 'Respeito e diálogo' }, conquest: { name: 'Curso concluído · Minha ideia também conta', trail: { ...trail, done: 2 } } });
  it('"Você concluiu {trilha}" com o chip da trilha e o selo', () => {
    expect(h).toMatch(/data-testid="end-chip"[^>]*>.*Trilha concluída/);
    expect(h).toContain('Você concluiu');
    expect(h).toContain('Respeito e diálogo');
    expect(h).toContain('data-testid="trail-done-card"');
    expect(h).toContain('Selo DNA Work · Respeito e diálogo');
    expect(h).toContain('Falta só a checagem final da trilha.');
  });
  it('sem botão de próxima parte; o selo é o caminho principal', () => {
    expect(h).not.toContain('next-part-link');
    expect(h).toContain('data-testid="end-badge-link"');
  });
});

describe('curso comum', () => {
  it('continua com "Curso concluído" e sem nada de série', () => {
    const h = render({ courseEnd: { course: 'Meu primeiro dia' }, conquest: { name: 'Curso concluído · Meu primeiro dia', trail: { name: 'Primeiro emprego', href: '/x', done: 1, total: 3, badge: false } } });
    expect(h).toMatch(/data-testid="end-chip"[^>]*>.*Curso concluído/);
    expect(h).not.toContain('next-part-link');
    expect(h).not.toContain('trail-done-card');
    expect(h).toContain('cursos concluídos');
  });
});
