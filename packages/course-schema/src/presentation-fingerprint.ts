import type { Presentation } from './course';
import type { AnyNode, MediaRef } from './nodes';
import { resolveCameraPlacement } from './direction';

/**
 * Impressão da apresentação (auditoria P1-1): um hash curto do que, na
 * apresentação do curso, muda o vídeo de UMA cena — apresentador, voz, fundo
 * (cor/imagem, balcão, enquadramento, desfoque), posição (direita/esquerda,
 * tamanho, x, base, folga, cor), formato, expressividade e as câmeras que a cena
 * usa (a principal e as dos planos da direção).
 *
 * O pedido de vídeo grava a impressão em `media.generatedFrom.presentationFingerprint`
 * ao anexar. Depois, o estúdio compara com a apresentação atual: diferente =
 * "desatualizado (apresentação mudou)". Mídia antiga sem impressão é tratada
 * como desconhecida (nunca como desatualizada).
 *
 * Puro e determinístico (sem crypto do Node): vale no navegador e no servidor.
 */
export const PRESENTATION_FINGERPRINT_VERSION = 1;

/** FNV-1a de 32 bits (duas sementes → 16 hex). Não é criptográfico: só detecta mudança. */
function fnv1a(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hex8(n: number): string {
  return n.toString(16).padStart(8, '0');
}

export function shortHash(input: string): string {
  return hex8(fnv1a(input, 0x811c9dc5)) + hex8(fnv1a(input, 0x9747b28c));
}

const round = (n: number | undefined) => (n === undefined ? null : Math.round(n * 1000) / 1000);

/** Câmeras que UMA cena usa: a principal (sempre) e as dos planos da direção. */
export function sceneCameraIds(node: AnyNode | undefined): string[] {
  if (!node || !('direction' in node) || !node.direction?.shots?.length) return [];
  const ids = new Set<string>();
  for (const s of node.direction.shots) if (s.cameraId) ids.add(s.cameraId);
  return [...ids].sort();
}

export interface PresentationFingerprintOptions {
  /** ids das câmeras do kit usadas pelos planos da cena (além da principal) */
  cameraIds?: Iterable<string>;
}

/**
 * Impressão da apresentação para uma cena. Só entram os campos que mudam a
 * saída do vídeo; campos de posição livre só quando a apresentadora é montada
 * por nós (direita/esquerda), como no hash de cena.
 */
export function presentationFingerprint(pres: Presentation, opts: PresentationFingerprintOptions = {}): string {
  const used = new Set(opts.cameraIds ?? []);
  const main = pres.cameras.find((c) => c.lookId === pres.avatarId);
  if (main) used.add(main.id);
  const cameras = pres.cameras
    .filter((c) => used.has(c.id))
    .map((c) => {
      const r = resolveCameraPlacement(pres, c);
      return {
        id: c.id,
        lookId: c.lookId,
        framing: c.nativeFraming ?? 'medium',
        placement: r.placement,
        ...(r.transparent ? { scale: round(r.scale), x: round(r.x), bottom: round(r.bottom) } : {}),
        // estúdio com zonas: o lado da parede livre (pílulas, pergunta) segue a zona; só quando definida
        ...(c.zone ? { zone: c.zone } : {}),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const course = resolveCameraPlacement(pres, null);
  const ownComposition = course.transparent || cameras.some((c) => c.placement === 'right' || c.placement === 'left');
  const bg = pres.background;
  const background =
    bg.type === 'image'
      ? {
          type: 'image',
          assetId: bg.assetId,
          // só valem na montagem nossa (direita/esquerda): fora dela, trocar o balcão não muda o vídeo
          ...(ownComposition
            ? { foregroundFrom: round(bg.foregroundFrom), frame: bg.frame ? { x: round(bg.frame.x), y: round(bg.frame.y), w: round(bg.frame.w), h: round(bg.frame.h) } : null, blur: bg.blur !== false }
            : {}),
        }
      : { type: 'color', value: bg.value.toLowerCase() };
  const payload = {
    v: PRESENTATION_FINGERPRINT_VERSION,
    avatar: pres.avatarId ?? null,
    voice: `${pres.voiceProvider ?? 'heygen'}:${pres.voiceId ?? ''}`,
    aspect: pres.aspectRatio ?? '16:9',
    expressiveness: pres.expressiveness ?? 'high',
    removeBackground: pres.removeBackground !== false,
    background,
    placement: course.placement,
    ...(course.transparent ? { scale: round(course.scale), x: round(course.x), bottom: round(course.bottom), headroom: round(course.headroom) } : {}),
    ...(ownComposition ? { grade: pres.presenterGrade ?? 'none' } : {}),
    cameras,
  };
  return shortHash(JSON.stringify(payload));
}

/** Impressão gravada na mídia gerada por job (ausente em mídia antiga ou manual). */
export function mediaPresentationFingerprint(media: MediaRef | undefined | null): string | undefined {
  const fp = media?.generatedFrom?.presentationFingerprint;
  return typeof fp === 'string' && fp.length > 0 ? fp : undefined;
}

/**
 * A mídia desta cena foi gerada com OUTRA apresentação? `false` quando não há
 * mídia, quando ela não é vídeo gerado por job ou quando a impressão é
 * desconhecida (mídia anterior a esta regra).
 */
export function mediaPresentationStale(media: MediaRef | undefined | null, pres: Presentation | undefined | null, node?: AnyNode): boolean {
  if (!pres || !media || media.kind !== 'video') return false;
  const recorded = mediaPresentationFingerprint(media);
  if (!recorded) return false;
  return recorded !== presentationFingerprint(pres, { cameraIds: sceneCameraIds(node) });
}
