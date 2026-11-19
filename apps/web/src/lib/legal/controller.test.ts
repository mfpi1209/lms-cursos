import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LegalPage, legalMetadata } from '@/components/legal/legal-page';
import { applyLegalController, legalControllerFromEnv } from './controller';
import { LEGAL_DOCS, LEGAL_ORDER, isLegalDraft } from './documents';
import { readLegalSource, readLegalText } from './source';

const LEGAL_ENV = ['LEGAL_PUBLISHED', 'LEGAL_CONTROLLER_NAME', 'LEGAL_CONTROLLER_CNPJ', 'LEGAL_CONTROLLER_ADDRESS', 'LEGAL_CONTROLLER_CONTACT', 'LEGAL_DPO_NAME', 'LEGAL_DPO_CONTACT'];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const k of LEGAL_ENV) delete process.env[k];
});

describe('rascunho por variável de ambiente (LEGAL_PUBLISHED)', () => {
  it('o padrão é rascunho: sem a variável, vazia ou com valor estranho', () => {
    expect(isLegalDraft({})).toBe(true);
    expect(isLegalDraft({ LEGAL_PUBLISHED: '' })).toBe(true);
    expect(isLegalDraft({ LEGAL_PUBLISHED: '0' })).toBe(true);
    expect(isLegalDraft({ LEGAL_PUBLISHED: 'talvez' })).toBe(true);
  });
  it('LEGAL_PUBLISHED=1 (ou true) publica', () => {
    expect(isLegalDraft({ LEGAL_PUBLISHED: '1' })).toBe(false);
    expect(isLegalDraft({ LEGAL_PUBLISHED: ' TRUE ' })).toBe(false);
  });
  it('a página mostra o aviso e o noindex por padrão, e os tira com a variável', () => {
    const draft = renderToStaticMarkup(createElement(LegalPage, { id: 'privacidade' }));
    expect(draft).toContain('legal-draft-notice');
    expect(draft).toContain('Rascunho em revisão jurídica');
    expect(legalMetadata('privacidade')).toMatchObject({ robots: { index: false, follow: false } });

    process.env.LEGAL_PUBLISHED = '1';
    const published = renderToStaticMarkup(createElement(LegalPage, { id: 'privacidade' }));
    expect(published).not.toContain('legal-draft-notice');
    expect(legalMetadata('privacidade')).not.toHaveProperty('robots');
  });
});

describe('dados do controlador (cliente) e da operadora (DNA Work)', () => {
  it('sem variáveis, mostra marcadores [CONTROLADOR: ...] e [ENCARREGADO: ...], nunca um nome inventado', () => {
    const c = legalControllerFromEnv({});
    expect(c.nome).toBe('[CONTROLADOR: nome]');
    expect(c.cnpj).toBe('[CONTROLADOR: CNPJ]');
    expect(c.encarregadoNome).toBe('[ENCARREGADO: nome]');
  });
  it('as variáveis LEGAL_CONTROLLER_* e LEGAL_DPO_* preenchem os campos; valor com chaves ou quebra de linha é limpo', () => {
    const c = legalControllerFromEnv({
      LEGAL_CONTROLLER_NAME: 'Instituição Exemplo Ltda.',
      LEGAL_CONTROLLER_CNPJ: '00.000.000/0001-00',
      LEGAL_CONTROLLER_ADDRESS: 'Rua A, 1\nSão Paulo',
      LEGAL_CONTROLLER_CONTACT: 'lgpd@exemplo.test',
      LEGAL_DPO_NAME: '{{CONTROLADOR_NOME}} Fulana',
      LEGAL_DPO_CONTACT: 'dpo@exemplo.test',
    });
    expect(c).toMatchObject({ nome: 'Instituição Exemplo Ltda.', cnpj: '00.000.000/0001-00', endereco: 'Rua A, 1 São Paulo', contato: 'lgpd@exemplo.test', encarregadoContato: 'dpo@exemplo.test' });
    expect(c.encarregadoNome).not.toContain('{');
  });
  it('applyLegalController troca todos os campos e deixa chave desconhecida como está', () => {
    const out = applyLegalController('{{CONTROLADOR_NOME}}|{{CONTROLADOR_CNPJ}}|{{ENCARREGADO_CONTATO}}|{{OUTRA}}', legalControllerFromEnv({ LEGAL_CONTROLLER_NAME: 'X', LEGAL_CONTROLLER_CNPJ: '1', LEGAL_DPO_CONTACT: 'a@b.test' }));
    expect(out).toBe('X|1|a@b.test|{{OUTRA}}');
  });
  it('as páginas de privacidade e termos renderizam os campos do controlador (marcadores por padrão, valores com as variáveis)', () => {
    for (const id of ['privacidade', 'termos'] as const) {
      const padrao = renderToStaticMarkup(createElement(LegalPage, { id }));
      expect(padrao).toContain('[CONTROLADOR: nome]');
      expect(padrao).toContain('[CONTROLADOR: CNPJ]');
      expect(padrao).toContain('[ENCARREGADO: nome]');
    }
    process.env.LEGAL_CONTROLLER_NAME = 'Instituição Exemplo Ltda.';
    process.env.LEGAL_CONTROLLER_CNPJ = '00.000.000/0001-00';
    process.env.LEGAL_DPO_NAME = 'Fulana de Tal';
    process.env.LEGAL_DPO_CONTACT = 'dpo@exemplo.test';
    for (const id of ['privacidade', 'termos'] as const) {
      const html = renderToStaticMarkup(createElement(LegalPage, { id }));
      expect(html).toContain('Instituição Exemplo Ltda.');
      expect(html).toContain('00.000.000/0001-00');
      expect(html).toContain('Fulana de Tal');
      expect(html).toContain('dpo@exemplo.test');
      expect(html).not.toContain('[CONTROLADOR: nome]');
    }
  });
  it('nenhum texto tem chave sem substituição, e privacidade e termos usam o modelo cliente-controlador / DNA-operadora', () => {
    for (const id of LEGAL_ORDER) {
      const txt = readLegalText(LEGAL_DOCS[id], {});
      expect(txt, id).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
    for (const id of ['privacidade', 'termos'] as const) {
      const src = readLegalSource(LEGAL_DOCS[id]);
      expect(src, id).toContain('{{CONTROLADOR_NOME}}');
      expect(src, id).toMatch(/operadora/i);
      // a DNA Work não é apresentada como controladora dos dados dos alunos
      expect(src, id).not.toMatch(/A responsável pelos seus dados é a DNA Work/);
    }
  });
  it('a política cita os dados tratados no piloto e o compartilhamento com o controlador', () => {
    const src = readLegalSource(LEGAL_DOCS.privacidade);
    for (const t of ['RGM', 'Telefone', '72 horas', 'só funciona uma vez', 'Notas', 'Reflexões', 'Entregas de tarefa', 'planilha (CSV)', 'API']) expect(src, t).toContain(t);
  });
});
