import { LegalPage, legalMetadata } from '@/components/legal/legal-page';

export const metadata = legalMetadata('privacidade');
export const dynamic = 'force-dynamic';

export default function Page() {
  return <LegalPage id="privacidade" />;
}
