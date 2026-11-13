import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TaskDeliveryFields } from './task-delivery-view';
import type { TaskDraft } from './task-delivery';

const MIME = ['application/pdf', 'image/png', 'image/jpeg'] as const;

function draft(over: Partial<TaskDraft> = {}): TaskDraft {
  return {
    link: '',
    setLink: () => {},
    linkError: null,
    file: null,
    chooseFile: () => {},
    fileError: null,
    uploading: false,
    prepare: async () => null,
    ...over,
  };
}

const render = (d: TaskDraft) => renderToStaticMarkup(createElement(TaskDeliveryFields, { draft: d, acceptedMime: MIME }));

describe('TaskDeliveryFields: escolha de arquivo', () => {
  it('mostra rótulos em português e mantém o accept do campo de arquivo', () => {
    const html = render(draft());
    expect(html).toContain('Escolher arquivo');
    expect(html).toContain('Nenhum arquivo escolhido');
    expect(html).toContain('Arquivo (opcional)');
    expect(html).not.toContain('Choose File');
    expect(html).not.toContain('No file chosen');
    expect(html).toMatch(/<input[^>]*type="file"[^>]*>/);
    expect(html).toContain('accept="application/pdf,image/png,image/jpeg"');
    // o campo nativo fica escondido, mas focável
    expect(html).toMatch(/<input[^>]*class="peer sr-only"/);
    expect(html).not.toContain('Remover');
  });

  it('mostra o nome do arquivo escolhido e a ação Remover', () => {
    const file = new File(['x'.repeat(2048)], 'entrega.pdf', { type: 'application/pdf' });
    const html = render(draft({ file }));
    expect(html).toContain('entrega.pdf');
    expect(html).not.toContain('Nenhum arquivo escolhido');
    expect(html).toContain('Remover');
    expect(html).toContain('accept="application/pdf,image/png,image/jpeg"');
  });

  it('mantém o link antes do arquivo na ordem do DOM', () => {
    const html = render(draft());
    expect(html.indexOf('data-testid="task-link"')).toBeLessThan(html.indexOf('data-testid="task-file"'));
  });
});
