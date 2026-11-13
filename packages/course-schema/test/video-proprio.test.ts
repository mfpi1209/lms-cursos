import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allLessons } from '../src/course';
import { importMarkdownCourse, MarkdownCourseError } from '../src/import/markdown-course';
import { AnyNodeSchema, sceneUsesScreenRecording, ScreenRecordingSchema } from '../src/nodes';
import type { AnyNode } from '../src/nodes';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FALA = `**Fala para gravação**

"Vou mostrar na tela como se faz o pedido. Repare que o pedido diz para quem é a lista e o que ela precisa. Quanto mais claro o pedido, mais útil fica a resposta. Agora olhe a tela e acompanhe cada passo, do primeiro clique até o envio da mensagem."

Texto na tela: Passo a passo
`;
const video = (code: string, extra = '') => `### ${code} — Cena ${code}\n${extra}\n${FALA}\n`;
const roteiro = (scenes: string, notes = '') => `# Curso de teste

Ideia: Testar vídeo próprio.
Público: alunos.
Objetivo final: Ao final, a pessoa assiste.
Duração-alvo: 1 aula de 3 a 5 minutos.

## Módulo 1 — Único

Descrição: Um módulo.

### Aula 1 — Tela

Objetivo: Ao final, você vê a tela.

${scenes}
### FIM — O que você levou

- Primeiro tópico curto
- Segundo tópico curto
${notes}`;
const NOTES = (line: string) => `\n## Notas para a montagem\n\n${line}\n`;

type Result = ReturnType<typeof importMarkdownCourse>;
const nodesOf = (r: Result): AnyNode[] => allLessons(r.document).flatMap((l) => l.graph.nodes as AnyNode[]);
const codes = (r: Result, code: string) => r.warnings.filter((w) => w.code === code);
const rec = (n: AnyNode | undefined) => (n && 'screenRecordings' in n ? n.screenRecordings : undefined);

describe('vídeo próprio: documento', () => {
  it('valida fileName (.mp4 sem caixa fixa, sem barra nem ..)', () => {
    expect(ScreenRecordingSchema.safeParse({ fileName: 'a.MP4' }).success).toBe(true);
    for (const bad of ['a.mov', 'pasta/a.mp4', 'a\\b.mp4', '..a.mp4', 'a..b.mp4', '.mp4']) expect(ScreenRecordingSchema.safeParse({ fileName: bad }).success, bad).toBe(false);
    expect(ScreenRecordingSchema.safeParse({ fileName: 'a.mp4', fit: 'longo' }).success).toBe(false);
    expect(ScreenRecordingSchema.safeParse({ fileName: 'a.mp4', assetId: 'x', durationSec: 12.5, fit: 'trimmed' }).success).toBe(true);
  });

  it('sceneUsesScreenRecording', () => {
    const base = { id: 'v1', type: 'content', body: { type: 'doc', content: [] } };
    expect(sceneUsesScreenRecording(AnyNodeSchema.parse(base))).toBe(false);
    expect(sceneUsesScreenRecording(AnyNodeSchema.parse({ ...base, screenRecordings: [{ fileName: 'a.mp4' }] }))).toBe(true);
    expect(sceneUsesScreenRecording({ screenRecordings: [] })).toBe(false);
  });
});

describe('vídeo próprio: importador', () => {
  it('uma linha vira uma gravação e o aviso de falta de mídia aparece com lessonId/nodeId', () => {
    const r = importMarkdownCourse(roteiro(video('V01', 'Vídeo próprio: gravacao_a.mp4')));
    expect(rec(nodesOf(r).find((n) => n.id === 'v01'))).toEqual([{ fileName: 'gravacao_a.mp4' }]);
    expect(codes(r, 'SCREEN_MEDIA_MISSING')).toEqual([{ code: 'SCREEN_MEDIA_MISSING', lessonId: 'aula_01', nodeId: 'v01', message: 'V01: falta mídia (gravacao_a.mp4)' }]);
    expect(r.compile.errors).toEqual([]);
  });

  it('várias linhas, sem acento e em qualquer caixa: ordem preservada', () => {
    const r = importMarkdownCourse(roteiro(video('V01', 'Vídeo próprio: um.mp4\nvideo proprio: dois.MP4\nVÍDEO PRÓPRIO: `tres.mp4`')));
    expect(rec(nodesOf(r).find((n) => n.id === 'v01'))?.map((x) => x.fileName)).toEqual(['um.mp4', 'dois.MP4', 'tres.mp4']);
    expect(codes(r, 'SCREEN_MEDIA_MISSING')).toHaveLength(1);
  });

  it('sem a linha nada muda: sem campo e sem avisos novos', () => {
    const r = importMarkdownCourse(roteiro(video('V01')));
    expect(rec(nodesOf(r).find((n) => n.id === 'v01'))).toBeUndefined();
    expect(r.warnings.filter((w) => w.code.startsWith('SCREEN_'))).toEqual([]);
  });

  it('cena com gravação não gera direção de avatar, nem com cartão (que vai para o texto da tela)', () => {
    const comCartao = `### V01 — Cena\nVídeo próprio: a.mp4\n\n${FALA}\nCartão: Três passos\n- Escreva o **tema**\n- Diga o **tipo**\n`;
    const r = importMarkdownCourse(roteiro(comCartao), { direction: true });
    const n = nodesOf(r).find((x) => x.id === 'v01')!;
    expect('direction' in n && n.direction).toBeFalsy();
    expect(JSON.stringify(n.type === 'scenario' || n.type === 'content' ? n.body : {})).toContain('Três passos');
    expect(r.warnings.some((w) => w.code === 'CARD_WITHOUT_DIRECTION')).toBe(false);
  });

  it('nome inválido é erro de formato com a linha', () => {
    expect(() => importMarkdownCourse(roteiro(video('V01', 'Vídeo próprio: pasta/a.mp4')))).toThrow(MarkdownCourseError);
    expect(() => importMarkdownCourse(roteiro(video('V01', 'Vídeo próprio: a.mov')))).toThrow(/mp4/);
  });

  it('Vídeo próprio fora de cena V.. gera SCREEN_RECORDING_WRONG_SCENE e é ignorado', () => {
    const nota = `### A01 — Anotar\nPergunta: O que você viu?\nVídeo próprio: a.mp4\nDestino: FIM\n`;
    const r = importMarkdownCourse(roteiro(video('V01') + '\n' + nota));
    const w = codes(r, 'SCREEN_RECORDING_WRONG_SCENE');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ lessonId: 'aula_01', nodeId: 'a01' });
    expect(nodesOf(r).some((n) => rec(n))).toBe(false);
  });

  describe('conferência com as notas', () => {
    const cena = (code: string, files: string[]) => video(code, files.map((f) => `Vídeo próprio: ${f}`).join('\n'));
    it('lista igual: sem SCREEN_LIST_MISMATCH', () => {
      const r = importMarkdownCourse(roteiro(cena('V01', ['a.mp4']) + '\n' + cena('V02', ['b.mp4', 'c.mp4']), NOTES('Cenas com gravação de tela (anexar o MP4 na cena): V01 (a) · V02 (b, c)')));
      expect(codes(r, 'SCREEN_LIST_MISMATCH')).toEqual([]);
    });
    it('sem a linha nas notas: não avisa', () => {
      const r = importMarkdownCourse(roteiro(cena('V01', ['a.mp4']), NOTES('Instrutora: a apresentadora.')));
      expect(codes(r, 'SCREEN_LIST_MISMATCH')).toEqual([]);
    });
    it('diverge: cena fora da lista, cena listada sem a linha, arquivos diferentes e cena inexistente', () => {
      const r = importMarkdownCourse(roteiro(cena('V01', ['a.mp4']) + '\n' + cena('V02', ['b.mp4']) + '\n' + video('V03'), NOTES('Cenas com gravação de tela (anexar o MP4 na cena): V02 (outro) · V03 (c) · V09 (z)')));
      const msgs = codes(r, 'SCREEN_LIST_MISMATCH').map((w) => w.message).join('\n');
      expect(codes(r, 'SCREEN_LIST_MISMATCH')).toHaveLength(4);
      expect(msgs).toMatch(/V01: .*não está na lista/);
      expect(msgs).toMatch(/V02: arquivos diferentes/);
      expect(msgs).toMatch(/V03: .*não tem "Vídeo próprio:"/);
      expect(msgs).toMatch(/V09/);
      expect(r.compile.errors).toEqual([]);
    });
  });

  it('o exemplo docs/roteiros/exemplos/exemplo-video-proprio.md importa com 0 erros e sem divergência', () => {
    const r = importMarkdownCourse(readFileSync(path.join(ROOT, 'docs/roteiros/exemplos/exemplo-video-proprio.md'), 'utf8'));
    expect(r.compile.errors).toEqual([]);
    expect(rec(nodesOf(r).find((n) => n.id === 'v02'))?.map((x) => x.fileName)).toEqual(['gravacao_livros_resposta.mp4', 'gravacao_busca_confere.mp4']);
    expect(codes(r, 'SCREEN_LIST_MISMATCH')).toEqual([]);
    expect(codes(r, 'SCREEN_MEDIA_MISSING')).toHaveLength(2);
  });

  it('roteiros atuais da Cruzeiro: 0 erros e um SCREEN_LIST_MISMATCH por cena das notas', () => {
    for (const f of ['c1-ia-na-pratica', 'c2-linkedin-curriculo', 'c3-produtividade-foco', 'c4-dinheiro-no-controle', 'c5-seguranca-digital']) {
      const r = importMarkdownCourse(readFileSync(path.join(ROOT, `docs/roteiros/${f}.md`), 'utf8'));
      expect(r.compile.errors, f).toEqual([]);
      expect(codes(r, 'SCREEN_LIST_MISMATCH').length, f).toBe(r.parsed.screenList?.length ?? 0);
    }
  });
});
