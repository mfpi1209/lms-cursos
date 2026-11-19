import { describe, expect, it } from 'vitest';
import { parseScreenMocksMarkdown } from '../src/import/screen-mocks-markdown';
import { ScreenMockSchema } from '../src/screen-mock';

const parse = (body: string) => parseScreenMocksMarkdown(`## gravacao_x\n${body}\n`);

describe('Modelo: comparar (duas telas lado a lado)', () => {
  it('lê rótulos, lados e passos com [esq]/[dir]', () => {
    const { mocks, issues } = parse(`Modelo: comparar
Aparelho: celular
App: Assistente de IA
Esquerda: Pedido vago
Direita: Pedido com os 4 P
- [esq] digita: me explica marketing
- [esq] ia: Marketing é o conjunto de ações… (peso 2)
- [dir] digita: Aja como um professor de marketing (na fala: "Aja como um professor")
- [DIREITA] mostra: Os 4 P | Produto | Preço
- [esquerda] destaca: genérico`);
    expect(issues).toEqual([]);
    const m = mocks.get('gravacao_x')!;
    expect(m).toMatchObject({ model: 'compare', device: 'phone', app: 'Assistente de IA', sides: { left: { model: 'chat', label: 'Pedido vago' }, right: { model: 'chat', label: 'Pedido com os 4 P' } } });
    expect(m.sides!.left.app).toBeUndefined();
    expect(m.steps.map((s) => s.side)).toEqual(['left', 'left', 'right', 'right', 'left']);
    expect(m.steps[2]).toMatchObject({ kind: 'type', cue: 'Aja como um professor', side: 'right' });
    expect(m.steps[1]).toMatchObject({ kind: 'message', from: 'ai', weight: 2 });
  });

  it('modelo e app por lado: "comparar chat | notas" e "App: A | B"', () => {
    const { mocks, issues } = parse(`Modelo: Comparar chat | notas
App: Assistente de IA | Bloco de notas
- [esq] ia: resposta
- [dir] mostra: Minhas anotações`);
    expect(issues).toEqual([]);
    const m = mocks.get('gravacao_x')!;
    expect(m.app).toBe('Assistente de IA');
    expect(m.sides).toEqual({ left: { model: 'chat' }, right: { model: 'notes', app: 'Bloco de notas' } });
    expect(parse('Modelo: comparar planilha\nApp: Planilha\n- [esq] célula: A1 = 1\n- [dir] célula: A1 = 2').mocks.get('gravacao_x')!.sides).toEqual({ left: { model: 'sheet' }, right: { model: 'sheet' } });
  });

  it('erros: passo sem lado, lado sem passo, prefixo desconhecido, rótulo fora do comparar', () => {
    const noSide = parse('Modelo: comparar\nApp: IA\n- [esq] ia: a\n- ia: b\n- [dir] ia: c');
    expect(noSide.mocks.size).toBe(0);
    expect(noSide.issues[0]).toMatchObject({ code: 'SCREEN_MOCK_SCHEMA', line: 5 });
    expect(noSide.issues[0]!.message).toContain('[esq] ou [dir]');
    const oneSide = parse('Modelo: comparar\nApp: IA\n- [esq] ia: a');
    expect(oneSide.issues[0]!.message).toContain('direita não tem nenhum passo');
    expect(parse('Modelo: comparar\nApp: IA\n- [meio] ia: a\n- [dir] ia: b').issues[0]!.message).toContain('[meio]');
    expect(parse('Modelo: chat\nApp: IA\nEsquerda: x\n- ia: a').issues[0]!.message).toContain('Modelo: comparar');
    expect(parse('Modelo: chat\nApp: IA\n- [esq] ia: a').issues[0]!.message).toContain('Modelo: comparar');
    expect(parse('Modelo: comparar xpto\nApp: IA\n- [esq] ia: a\n- [dir] ia: b').issues[0]!.code).toBe('SCREEN_MOCK_SYNTAX');
  });

  it('o contrato aceita a comparação e recusa lado fora dela', () => {
    const steps = [{ kind: 'type', text: 'a', side: 'left' }, { kind: 'message', from: 'ai', text: 'b', side: 'right' }];
    expect(ScreenMockSchema.safeParse({ model: 'compare', app: 'IA', steps }).success).toBe(true);
    expect(ScreenMockSchema.parse({ model: 'compare', app: 'IA', steps, sides: { left: {}, right: { label: 'Depois' } } }).sides).toEqual({ left: { model: 'chat' }, right: { model: 'chat', label: 'Depois' } });
    expect(ScreenMockSchema.safeParse({ model: 'chat', app: 'IA', steps }).success).toBe(false);
  });
});
