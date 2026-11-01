import { LegalPage, legalMetadata } from '@/components/legal/legal-page';

export const metadata = legalMetadata('termos');
export const dynamic = 'force-dynamic';

export default function Page() {
  return <LegalPage id="termos" />;
}
