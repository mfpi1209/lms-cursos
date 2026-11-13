import { describe, expect, it } from 'vitest';
import { parseScreenMocksMarkdown } from '../src/import/screen-mocks-markdown';

const one = (body: string, head = 'Modelo: chat\nApp: Assistente de IA') => parseScreenMocksMarkdown(`## gravacao_x\n${head}\n${body}\n`);

describe('parseScreenMocksMarkdown', () => {
  it('lê modelo, aparelho, app e todos os passos', () => {
    const { mocks, issues } = parseScreenMocksMarkdown(`Texto livre antes é ignorado.
# Título qualquer

## gravacao_tudo.mp4
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: me explica marketing
- usuário: oi
- ia: Marketing é... (peso 3)
- outro: resposta de outra pessoa
- mostra: Cartão | linha 1 | linha 2
- liga: Wi-Fi
- desliga: Bluetooth
- toca: Enviar
- célula: b2 = =SOMA(A1:A3)
- evento: Prova | sexta | 14h | azul
- destaca: resposta genérica
`);
    expect(issues).toEqual([]);
    expect([...mocks.keys()]).toEqual(['gravacao_tudo']);
    const m = mocks.get('gravacao_tudo')!;
    expect(m).toMatchObject({ model: 'chat', device: 'phone', app: 'Assistente de IA' });
    expect(m.steps).toEqual([
      { kind: 'type', text: 'me explica marketing' },
      { kind: 'message', from: 'user', text: 'oi' },
      { kind: 'message', from: 'ai', text: 'Marketing é...', weight: 3 },
      { kind: 'message', from: 'other', text: 'resposta de outra pessoa' },
      { kind: 'show', title: 'Cartão', lines: ['linha 1', 'linha 2'] },
      { kind: 'toggle', label: 'Wi-Fi', on: true },
      { kind: 'toggle', label: 'Bluetooth', on: false },
      { kind: 'tap', label: 'Enviar' },
      { kind: 'cell', ref: 'B2', value: '=SOMA(A1:A3)' },
      { kind: 'event', title: 'Prova', day: 'sexta', time: '14h', color: 'azul' },
      { kind: 'highlight', text: 'resposta genérica' },
    ]);
  });

  it('aparelho: celular/computador, padrão phone', () => {
    expect(one('- digita: a', 'Modelo: browser\nAparelho: computador\nApp: Site').mocks.get('gravacao_x')!.device).toBe('desktop');
    expect(one('- digita: a', 'Modelo: browser\nApp: Site').mocks.get('gravacao_x')!.device).toBe('phone');
  });

  it('aceita rótulos sem acento e em qualquer caixa; peso decimal com vírgula', () => {
    const r = one('- USUARIO: oi\n- Celula: C3 = 10 (peso 1,5)\n- DIGITA: x\n- Usuário: y', 'MODELO: Chat\nAPP: Conversa');
    expect(r.issues).toEqual([]);
    const steps = r.mocks.get('gravacao_x')!.steps;
    expect(steps[0]).toMatchObject({ kind: 'message', from: 'user' });
    expect(steps[1]).toEqual({ kind: 'cell', ref: 'C3', value: '10', weight: 1.5 });
    expect(steps[3]).toMatchObject({ from: 'user', text: 'y' });
  });

  it('o texto do passo pode ter dois pontos', () => {
    const r = one('- digita: Tema: marketing');
    expect(r.mocks.get('gravacao_x')!.steps[0]).toEqual({ kind: 'type', text: 'Tema: marketing' });
  });

  it('erros viram issues com a linha, sem lançar', () => {
    const r = parseScreenMocksMarkdown(`## a
Modelo: chat
App: X
- voa: alto
- evento: sem dia
- célula: sem igual
- digita:

## b
Modelo: foguete
App: X
- digita: a

## c
Modelo: sheet
App: X
- célula: ZZZ9 = 1

## d
Modelo: chat
App: X
`);
    expect(r.mocks.size).toBe(0);
    const by = (k: string) => r.issues.filter((i) => i.key === k);
    expect(by('a').map((i) => i.line)).toEqual([4, 5, 6, 7]);
    expect(by('a')[0]).toMatchObject({ code: 'SCREEN_MOCK_SYNTAX', message: expect.stringContaining('voa') });
    expect(by('b')[0]).toMatchObject({ line: 10, message: expect.stringContaining('foguete') });
    expect(by('c')[0]).toMatchObject({ code: 'SCREEN_MOCK_SCHEMA', line: 17 });
    expect(by('d')[0]).toMatchObject({ code: 'SCREEN_MOCK_EMPTY', line: 19 });
  });

  it('modelo ou app ausente é erro de validação na linha da seção', () => {
    const r = parseScreenMocksMarkdown('\n## a\n- digita: x\n');
    expect(r.mocks.size).toBe(0);
    expect(r.issues.length).toBeGreaterThan(0);
    expect(r.issues.every((i) => i.key === 'a' && i.line === 2)).toBe(true);
  });

  it('seção boa convive com a ruim; seção repetida é ignorada', () => {
    const r = parseScreenMocksMarkdown('## a\nModelo: chat\nApp: X\n- digita: 1\n## b\nModelo: chat\nApp: X\n- nada: 2\n## A.mp4\nModelo: chat\nApp: X\n- digita: 3\n');
    expect([...r.mocks.keys()]).toEqual(['a']);
    expect(r.issues.map((i) => i.code)).toEqual(['SCREEN_MOCK_SYNTAX', 'SCREEN_MOCK_DUPLICATE']);
  });

  it('seção qualificada pela cena: chave nome@CENA; duplicada vale a primeira', () => {
    const r = parseScreenMocksMarkdown('## g.mp4\nModelo: chat\nApp: X\n- digita: geral\n## g (v31)\nModelo: chat\nApp: X\n- digita: da v31\n## g (V31)\nModelo: chat\nApp: X\n- digita: repetida\n');
    expect([...r.mocks.keys()]).toEqual(['g', 'g@V31']);
    expect(r.mocks.get('g@V31')!.steps[0]).toMatchObject({ text: 'da v31' });
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ code: 'SCREEN_MOCK_DUPLICATE', key: 'g@V31', line: 9, message: expect.stringContaining('seção duplicada') });
  });

  it('vazio ou só texto livre: nada e sem erros', () => {
    expect(parseScreenMocksMarkdown('')).toEqual({ mocks: new Map(), issues: [] });
    expect(parseScreenMocksMarkdown('só um texto\n- digita: solto')).toEqual({ mocks: new Map(), issues: [] });
  });
});

describe('sufixo (na fala: "trecho") -> cue', () => {
  it('lê o cue, sozinho ou junto do peso (qualquer ordem), e não altera mocks sem cue', () => {
    const r = one('- digita: me indique três livros (na fala: "Eu peço")\n- ia: Claro! (peso 2) (na fala: “olha a resposta”)\n- toca: Enviar (na fala: "enviar") (peso 3)\n- destaca: sem cue (peso 2)');
    expect(r.issues).toEqual([]);
    const steps = r.mocks.get('gravacao_x')!.steps as Array<{ text?: string; label?: string; weight?: number; cue?: string }>;
    expect(steps[0]).toMatchObject({ kind: 'type', text: 'me indique três livros', cue: 'Eu peço' });
    expect(steps[0]!.weight).toBeUndefined();
    expect(steps[1]).toMatchObject({ kind: 'message', text: 'Claro!', weight: 2, cue: 'olha a resposta' });
    expect(steps[2]).toMatchObject({ kind: 'tap', label: 'Enviar', weight: 3, cue: 'enviar' });
    expect(steps[3]).toMatchObject({ kind: 'highlight', text: 'sem cue', weight: 2 });
    expect('cue' in steps[3]!).toBe(false);
  });
});
