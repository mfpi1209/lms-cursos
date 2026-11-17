import { z } from 'zod';

/**
 * Tela simulada: a plataforma desenha a tela de demonstração (conversa com a IA, site, perfil, ajustes do celular,
 * agenda, planilha, anotações) a partir desta descrição e gera o MP4 sozinha, sem gravação humana e sem provedor pago.
 * O MP4 gerado entra no mesmo lugar de uma gravação de tela (`ScreenRecording.assetId`) e passa pela mesma montagem
 * (tela cheia + narração + legenda). A duração acompanha a narração da cena: cada passo começa quando a fala chega nele
 * (alinhamento por palavra); sem alinhamento, os passos se distribuem proporcionalmente ao `peso` (padrão 1).
 *
 * Sintaxe no roteiro de telas (`docs/roteiros/telas/<roteiro>.telas.md`), uma seção por arquivo:
 *
 *   ## gravacao_pedido_vago
 *   Modelo: chat
 *   Aparelho: celular
 *   App: Assistente de IA
 *   - digita: me explica marketing
 *   - ia: Marketing é o conjunto de ações que uma empresa usa para...
 *   - destaca: resposta genérica, sem contexto
 *
 * Passos (um por linha, na ordem em que aparecem na tela):
 *   digita: <texto>                        → texto sendo digitado no campo ativo (chat, busca, formulário, célula)
 *   usuário: <texto> | ia: <texto> | outro: <texto>   → balão de conversa (o da IA aparece "escrevendo")
 *   mostra: <título> | <linha> | <linha>   → bloco/cartão/trecho de página que aparece
 *   liga: <rótulo> | desliga: <rótulo>     → interruptor de ajuste
 *   toca: <rótulo>                         → toque/clique destacado num botão ou item
 *   célula: <B2> = <valor ou fórmula>      → preenchimento de célula de planilha
 *   evento: <título> | <dia> | <hora> | <cor opcional>  → evento de agenda
 *   destaca: <texto>                       → realce de um trecho já na tela (ou nota em destaque)
 * Sufixo opcional ` (peso 2)` no fim da linha dá mais tempo ao passo.
 * Sufixo opcional ` (na fala: "trecho")` força o início do passo naquele trecho da narração (sem ele, a plataforma
 * procura na fala as palavras do próprio passo; a tela fica vazia até o primeiro passo encontrado).
 *
 * COMPARAÇÃO (duas telas lado a lado, para quando a fala compara "à esquerda … à direita …"):
 *
 *   ## gravacao_pedido_4p
 *   Modelo: comparar                  (as duas telas são conversa; `Modelo: comparar notas` muda o modelo das duas,
 *                                      `Modelo: comparar chat | notas` dá um modelo a cada lado)
 *   Aparelho: celular                 (vale para as duas telas)
 *   App: Assistente de IA             (as duas; `App: Assistente de IA | Bloco de notas` dá um nome a cada lado)
 *   Esquerda: Pedido vago             (rótulo curto em cima da tela da esquerda; opcional)
 *   Direita: Pedido com contexto      (rótulo curto em cima da tela da direita; opcional)
 *   - [esq] digita: me explica marketing
 *   - [esq] ia: Marketing é o conjunto de ações…
 *   - [dir] digita: Aja como um professor de marketing…
 *   - [dir] ia: Produto: a coleção nova…
 *
 * Todo passo leva o prefixo `[esq]` ou `[dir]` (também `[esquerda]`/`[direita]`) dizendo em qual tela acontece. Os
 * passos seguem UMA linha do tempo só, na ordem em que estão escritos (a ordem da fala), e cada um começa quando a
 * fala chega nele, como nas outras telas — as duas telas ficam visíveis o tempo todo e cada uma só muda nos passos
 * dela. Cada tela é desenhada inteira (mesma tipografia, em escala) e as duas cabem lado a lado em 1080p.
 *
 * Balão repetido: no chat, todo `digita:` vira balão do usuário ao ser enviado. Um `usuário:` logo depois com o MESMO
 * texto — ou quase o mesmo (um contém o outro, ou ≥ 80% das palavras em comum) — é a mesma mensagem e NÃO vira um
 * segundo balão. Prefira escrever só o `digita:` (o `usuário:` repetido é desnecessário).
 *
 * Regras de conteúdo: telas genéricas, SEM logotipo nem identidade visual de marca real (o nome do serviço pode
 * aparecer como texto quando a aula ensina aquele serviço). Nada de dado pessoal real.
 */

/** modelos de UMA tela (também os de cada lado da comparação) */
export const SCREEN_MOCK_SIDE_MODELS = ['chat', 'browser', 'form', 'settings', 'calendar', 'sheet', 'notes'] as const;
export type ScreenMockSideModel = (typeof SCREEN_MOCK_SIDE_MODELS)[number];
/** `compare` = duas telas lado a lado (ver `sides` e `side` de cada passo) */
export const SCREEN_MOCK_MODELS = [...SCREEN_MOCK_SIDE_MODELS, 'compare'] as const;
export type ScreenMockModel = (typeof SCREEN_MOCK_MODELS)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const weight = z.number().positive().max(10).optional();
/** trecho da fala em que o passo começa (opcional; sem ele a plataforma acha o trecho sozinha) */
const cue = z.string().trim().min(1).max(200).optional();
/** só no modelo `compare`: em qual das duas telas o passo acontece */
const side = z.enum(['left', 'right']).optional();

export const ScreenMockStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('type'), text: text(600), weight, cue, side }),
  z.object({ kind: z.literal('message'), from: z.enum(['user', 'ai', 'other']), text: text(1500), weight, cue, side }),
  z.object({ kind: z.literal('show'), title: text(160).optional(), lines: z.array(text(400)).max(12).default([]), weight, cue, side }),
  z.object({ kind: z.literal('toggle'), label: text(120), on: z.boolean(), weight, cue, side }),
  z.object({ kind: z.literal('tap'), label: text(120), weight, cue, side }),
  z.object({ kind: z.literal('cell'), ref: z.string().regex(/^[A-Z]{1,2}[1-9]\d{0,2}$/, 'célula no formato B2'), value: text(200), weight, cue, side }),
  z.object({ kind: z.literal('event'), title: text(120), day: text(40), time: text(20), color: text(30).optional(), weight, cue, side }),
  z.object({ kind: z.literal('highlight'), text: text(300), weight, cue, side }),
]);
export type ScreenMockStep = z.infer<typeof ScreenMockStepSchema>;

const ScreenMockSideSchema = z.object({
  model: z.enum(SCREEN_MOCK_SIDE_MODELS).default('chat'),
  /** nome no topo desta tela (ausente = o `app` da seção) */
  app: text(60).optional(),
  /** rótulo curto em cima da tela ("Pedido vago") */
  label: text(40).optional(),
});
export type ScreenMockSide = z.infer<typeof ScreenMockSideSchema>;

export const ScreenMockSchema = z
  .object({
    model: z.enum(SCREEN_MOCK_MODELS),
    device: z.enum(['phone', 'desktop']).default('phone'),
    /** nome no topo da tela (genérico: "Assistente de IA", "Agenda", "Planilha") */
    app: text(60),
    steps: z.array(ScreenMockStepSchema).min(1).max(40),
    /** só no modelo `compare`: as duas telas */
    sides: z.object({ left: ScreenMockSideSchema, right: ScreenMockSideSchema }).optional(),
  })
  .superRefine((m, ctx) => {
    if (m.model !== 'compare') {
      if (m.sides) ctx.addIssue({ code: 'custom', path: ['sides'], message: '"Esquerda:"/"Direita:" só valem com "Modelo: comparar"' });
      m.steps.forEach((s, i) => {
        if (s.side) ctx.addIssue({ code: 'custom', path: ['steps', i], message: 'prefixo [esq]/[dir] só vale com "Modelo: comparar"' });
      });
      return;
    }
    m.steps.forEach((s, i) => {
      if (!s.side) ctx.addIssue({ code: 'custom', path: ['steps', i], message: 'no modelo comparar todo passo começa com [esq] ou [dir]' });
    });
    for (const sd of ['left', 'right'] as const) {
      if (!m.steps.some((s) => s.side === sd)) ctx.addIssue({ code: 'custom', path: ['steps'], message: `a tela da ${sd === 'left' ? 'esquerda' : 'direita'} não tem nenhum passo` });
    }
  });
export type ScreenMock = z.infer<typeof ScreenMockSchema>;

/** Um passo da tela em uma linha, na sintaxe do arquivo de telas (`digita: …`, `[esq] ia: …`, `(na fala: "…")`). */
export function screenMockStepLine(st: ScreenMockStep): string {
  const side = st.side ? `[${st.side === 'left' ? 'esq' : 'dir'}] ` : '';
  const tail = `${st.weight !== undefined ? ` (peso ${st.weight})` : ''}${st.cue ? ` (na fala: "${st.cue}")` : ''}`;
  const body = (() => {
    switch (st.kind) {
      case 'type': return `digita: ${st.text}`;
      case 'message': return `${st.from === 'user' ? 'usuário' : st.from === 'ai' ? 'ia' : 'outro'}: ${st.text}`;
      case 'show': return `mostra: ${[st.title ?? '', ...st.lines].join(' | ')}`;
      case 'toggle': return `${st.on ? 'liga' : 'desliga'}: ${st.label}`;
      case 'tap': return `toca: ${st.label}`;
      case 'cell': return `célula: ${st.ref} = ${st.value}`;
      case 'event': return `evento: ${[st.title, st.day, st.time, st.color].filter(Boolean).join(' | ')}`;
      case 'highlight': return `destaca: ${st.text}`;
    }
  })();
  return `${side}${body}${tail}`;
}
