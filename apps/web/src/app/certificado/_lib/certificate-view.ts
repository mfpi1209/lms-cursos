import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { and, eq } from 'drizzle-orm';
import { getDb, identity, schema, type certificates } from '@lms/db';
import { getStorage } from '@lms/media';
import { formatWorkload, parseCertificateIssuer } from '@lms/course-schema';
import { getBrand } from '@/config/brand';
import type { Viewer } from '@/server/viewer';
import type { CourseCertificateData } from '../_components/course-certificate-sheet';

type CourseCertificate = certificates.CourseCertificate;

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const formatDateLong = (d: Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(d);

/**
 * Endereço público do site: o configurado (`NEXT_PUBLIC_APP_URL`, depois `BETTER_AUTH_URL`) para o QR impresso não
 * depender de por onde a pessoa abriu a página; sem configuração, o host do pedido.
 */
export async function publicOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* cai no host do pedido */
    }
  }
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost:3000'}`;
}

/**
 * Imagem do emissor (logo, assinatura) embutida na página como data URI. A rota `/api/assets` exige login, e a folha
 * precisa abrir para qualquer pessoa que confira o código. Só imagens do workspace do certificado, até 2 MB.
 */
async function imageDataUri(workspaceId: string, assetId: string | undefined): Promise<string | undefined> {
  if (!assetId) return undefined;
  const db = getDb();
  const [a] = await db
    .select()
    .from(schema.assets)
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.workspaceId, workspaceId), eq(schema.assets.kind, 'image')));
  if (!a || (a.sizeBytes ?? 0) > IMAGE_MAX_BYTES || !/^image\/(png|jpeg)$/.test(a.mimeType)) return undefined;
  try {
    const storage = await getStorage();
    const chunks: Buffer[] = [];
    for await (const c of storage.getStream(a.storageKey)) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return `data:${a.mimeType};base64,${Buffer.concat(chunks).toString('base64')}`;
  } catch {
    return undefined;
  }
}

/** O RGM aparece só para a própria pessoa e para a equipe do workspace do certificado. */
export function canSeeRgm(cert: Pick<CourseCertificate, 'userId' | 'workspaceId'>, viewer: Viewer | null): boolean {
  if (!viewer) return false;
  if (cert.userId && viewer.user.id === cert.userId) return true;
  return viewer.workspace.id === cert.workspaceId && identity.isStaff(viewer.role);
}

/** Monta os dados da folha a partir do que foi gravado na emissão (nada é relido do cadastro ou do curso). */
export async function certificateSheetData(cert: CourseCertificate, opts: { showRgm: boolean }): Promise<CourseCertificateData> {
  const brand = getBrand(cert.workspaceId);
  const issuer = parseCertificateIssuer(cert.issuer);
  const origin = await publicOrigin();
  const verifyUrl = `${origin}/certificado/${cert.code}`;
  const qrSvg = await QRCode.toString(verifyUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1D1E4C', light: '#ffffff' } });
  const [logoUrl, signatureUrl] = await Promise.all([imageDataUri(cert.workspaceId, issuer.logoAssetId), imageDataUri(cert.workspaceId, issuer.signatureAssetId)]);
  const issuerName = issuer.institution || brand.name;
  return {
    ...(issuer.showPlatformBrand ? { platform: { name: brand.name, ...(brand.logoDark ? { logoDark: brand.logoDark } : {}), ...(brand.logoRatio ? { logoRatio: brand.logoRatio } : {}) } } : {}),
    issuer: {
      name: issuerName,
      ...(issuer.cnpj ? { cnpj: issuer.cnpj } : {}),
      ...(logoUrl ? { logoUrl } : {}),
      ...(signatureUrl ? { signatureUrl } : {}),
      ...(issuer.signerName ? { signerName: issuer.signerName } : {}),
      ...(issuer.signerRole ? { signerRole: issuer.signerRole } : {}),
    },
    holderName: cert.holderName,
    ...(opts.showRgm && cert.holderRgm ? { holderRgm: cert.holderRgm } : {}),
    courseTitle: cert.courseTitle,
    workload: formatWorkload(cert.workloadMinutes),
    completedOn: formatDateLong(cert.completedAt ?? cert.issuedAt),
    issuedOn: formatDateLong(cert.issuedAt),
    program: cert.program.map((m) => ({ title: m.title, duration: m.minutes > 0 ? formatWorkload(m.minutes) : '' })),
    code: cert.code,
    verifyUrl,
    verifyShort: verifyUrl.replace(/^https?:\/\//, ''),
    qrSvg,
  };
}
