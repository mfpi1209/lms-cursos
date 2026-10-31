import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, media } from '@lms/db';
import { ELEVENLABS_SFX_ADAPTER_VERSION, ElevenLabsError, ElevenLabsSfxAdapter, SFX_DURATION, SFX_TEXT_MAX, bumperSoundPrompt, estimateSoundEffectUsd, getStorage } from '@lms/media';
import { handleError, parseBody } from '@/server/http';
import { HttpError, requireEditor } from '@/server/viewer';
import { getMediaConfig } from '@/server/media';
import { mediaBudgetCheck } from '@/server/spend';

/**
 * Assinatura sonora gerada por IA (ElevenLabs Sound Effects). AÇÃO PAGA em
 * duas etapas, como os looks:
 * 1) sem `confirm: true`: devolve o prompt (inglês, montado da UI em pt-BR), a
 *    estimativa e a disponibilidade — nada é chamado;
 * 2) com `confirm: true`: exige ALLOW_PAID_PROVIDERS=1 + chave ElevenLabs (fora
 *    disso 409 "indisponível em modo de demonstração") e o teto diário de mídia
 *    (402); chama o provedor UMA vez e guarda o MP3 como áudio do workspace,
 *    pronto para `audio: { kind: 'file', assetId }` na vinheta.
 */
const BodySchema = z.object({
  mood: z.enum(['warm', 'bright', 'minimal']).default('warm'),
  durationSec: z.number().min(SFX_DURATION.min).max(SFX_DURATION.max).default(3),
  /** descrição própria (inglês); ausente = prompt padrão pelo `mood` */
  prompt: z.string().max(SFX_TEXT_MAX).optional(),
  promptInfluence: z.number().min(0).max(1).optional(),
  confirm: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const viewer = await requireEditor();
    const body = await parseBody(req, BodySchema);
    const cfg = getMediaConfig();
    const available = cfg.paidAllowed && !!cfg.elevenLabsApiKey;
    const prompt = (body.prompt?.trim() || bumperSoundPrompt({ durationSeconds: body.durationSec, mood: body.mood })).slice(0, SFX_TEXT_MAX);
    const estimatedUsd = estimateSoundEffectUsd(body.durationSec);
    if (body.confirm !== true) {
      return NextResponse.json({
        requiresConfirmation: true,
        available,
        reason: available ? null : cfg.paidAllowed ? 'ELEVENLABS_API_KEY ausente: som por IA indisponível' : 'Modo de demonstração: o som por IA é uma ação paga e fica desabilitado sem ALLOW_PAID_PROVIDERS=1. Use o som sintetizado (gratuito) ou envie um arquivo.',
        prompt,
        estimate: { provider: 'elevenlabs', estimatedUsd, note: 'Estimativa: ~100 créditos por segundo gerado (tabela MEDIA_PRICES_JSON); confira a fatura.' },
      });
    }
    if (!available) throw new HttpError(409, 'Som por IA indisponível neste ambiente (ação paga bloqueada em modo de demonstração ou chave ausente).');
    const budget = await mediaBudgetCheck(viewer.workspace.id, estimatedUsd);
    if (budget.exceeded) throw new HttpError(402, `Teto diário de mídia atingido (US$ ${budget.spentUsd.toFixed(2)} de ${budget.limitUsd?.toFixed(2) ?? '∞'}); o som por IA acrescentaria US$ ${estimatedUsd.toFixed(4)}`, budget);
    const adapter = new ElevenLabsSfxAdapter(cfg.elevenLabsApiKey!);
    const r = await adapter.generate({ text: prompt, durationSeconds: body.durationSec, promptInfluence: body.promptInfluence });
    const sha256 = createHash('sha256').update(r.bytes).digest('hex');
    const storage = await getStorage();
    const key = `${viewer.workspace.id}/audio/${sha256.slice(0, 2)}/${sha256}.mp3`;
    await storage.putObject(key, r.bytes, 'audio/mpeg');
    const asset = await media.createAsset(getDb(), {
      workspaceId: viewer.workspace.id, kind: 'audio', source: 'generated', mimeType: 'audio/mpeg', sizeBytes: r.bytes.byteLength, storageProvider: storage.provider, storageKey: key,
      originalName: `assinatura-sonora-${body.mood}.mp3`, sha256, durationSeconds: body.durationSec, transcript: prompt, createdBy: viewer.user.id,
    });
    return NextResponse.json({ asset: { id: asset.id, url: `/api/assets/${asset.id}`, durationSec: body.durationSec }, prompt, adapterVersion: ELEVENLABS_SFX_ADAPTER_VERSION, characterCost: r.characterCost ?? null }, { status: 201 });
  } catch (e) {
    if (e instanceof ElevenLabsError) return NextResponse.json({ error: { code: 'PROVIDER', message: e.message } }, { status: e.status >= 500 ? 502 : 422 });
    return handleError(e);
  }
}
