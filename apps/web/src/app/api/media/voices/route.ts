import { DomainError } from '@lms/db';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { getElevenLabs, getHeyGen, SIMULATED_VOICES } from '@/server/media';

export async function GET(req: Request) {
  return route(async () => {
    await requireStaff();
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider') ?? 'heygen';
    const token = url.searchParams.get('token') ?? undefined;
    if (provider === 'heygen') {
      const heygen = getHeyGen();
      if (!heygen) return { simulation: true, voices: SIMULATED_VOICES, nextToken: undefined };
      const r = await heygen.listVoices({ token, language: url.searchParams.get('language') ?? undefined });
      return { simulation: false, voices: r.voices.map((v) => ({ id: v.id, name: v.name, language: v.language, previewUrl: v.previewAudioUrl })), nextToken: r.hasMore ? r.nextToken : undefined };
    }
    if (provider === 'elevenlabs') {
      const el = getElevenLabs();
      if (!el) return { simulation: true, voices: SIMULATED_VOICES, nextToken: undefined };
      const r = await el.listVoices({ nextPageToken: token, search: url.searchParams.get('search') ?? undefined });
      return { simulation: false, voices: r.voices.map((v: { id: string; name: string; labels?: Record<string, string>; previewUrl?: string }) => ({ id: v.id, name: v.name, language: v.labels?.language, previewUrl: v.previewUrl })), nextToken: r.hasMore ? r.nextPageToken : undefined };
    }
    throw new DomainError('VALIDATION', 'provider deve ser heygen ou elevenlabs');
  });
}
