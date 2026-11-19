import { getDb, certificates } from '@lms/db';
import { requireViewer } from '@/server/viewer';
import { getBrand } from '@/config/brand';
import { IssuerForm } from './issuer-form';

export const metadata = { title: 'Certificado' };
export const dynamic = 'force-dynamic';

export default async function CertificadoConfigPage() {
  const viewer = await requireViewer();
  const issuer = await certificates.getIssuer(getDb(), viewer.workspace.id);
  const brand = getBrand(viewer.workspace.id);
  return (
    <div className="space-y-8">
      <section className="max-w-3xl space-y-4">
        <h1>Certificado de conclusão</h1>
        <p className="text-lg text-fg-muted">Quem emite os certificados deste workspace: instituição, CNPJ, quem assina, logo e assinatura.</p>
        <p className="text-sm text-fg-muted">
          As mudanças valem só para certificados emitidos a partir de agora. Os já emitidos mantêm os dados do dia da emissão. O certificado é ligado curso a curso, em Detalhes do curso.
        </p>
      </section>
      <IssuerForm initial={issuer} brandName={brand.name} />
    </div>
  );
}
