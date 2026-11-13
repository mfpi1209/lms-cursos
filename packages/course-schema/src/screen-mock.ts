import { z } from 'zod';

/**
 * Tela simulada: a plataforma desenha a tela de demonstração (conversa com a IA, site, perfil, ajustes do celular,
 * agenda, planilha, anotações) a partir desta descrição e gera o MP4 sozinha, sem gravação humana e sem provedor pago.
 * O MP4 gerado entra no mesmo lugar de uma gravação de tela (`ScreenRecording.assetId`) e passa pela mesma montagem
 * (tela cheia + narração + legenda). A duração acompanha a narração da cena: os passos se distribuem no tempo da fala
 * (proporcional ao `peso`, padrão 1).
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
 *
 * Regras de conteúdo: telas genéricas, SEM logotipo nem identidade visual de marca real (o nome do serviço pode
 * aparecer como texto quando a aula ensina aquele serviço). Nada de dado pessoal real.
 */

export const SCREEN_MOCK_MODELS = ['chat', 'browser', 'form', 'settings', 'calendar', 'sheet', 'notes'] as const;
export type ScreenMockModel = (typeof SCREEN_MOCK_MODELS)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const weight = z.number().positive().max(10).optional();

export const ScreenMockStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('type'), text: text(600), weight }),
  z.object({ kind: z.literal('message'), from: z.enum(['user', 'ai', 'other']), text: text(1500), weight }),
  z.object({ kind: z.literal('show'), title: text(160).optional(), lines: z.array(text(400)).max(12).default([]), weight }),
  z.object({ kind: z.literal('toggle'), label: text(120), on: z.boolean(), weight }),
  z.object({ kind: z.literal('tap'), label: text(120), weight }),
  z.object({ kind: z.literal('cell'), ref: z.string().regex(/^[A-Z]{1,2}[1-9]\d{0,2}$/, 'célula no formato B2'), value: text(200), weight }),
  z.object({ kind: z.literal('event'), title: text(120), day: text(40), time: text(20), color: text(30).optional(), weight }),
  z.object({ kind: z.literal('highlight'), text: text(300), weight }),
]);
export type ScreenMockStep = z.infer<typeof ScreenMockStepSchema>;

export const ScreenMockSchema = z.object({
  model: z.enum(SCREEN_MOCK_MODELS),
  device: z.enum(['phone', 'desktop']).default('phone'),
  /** nome no topo da tela (genérico: "Assistente de IA", "Agenda", "Planilha") */
  app: text(60),
  steps: z.array(ScreenMockStepSchema).min(1).max(40),
});
export type ScreenMock = z.infer<typeof ScreenMockSchema>;
