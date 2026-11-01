import { LegalPage, legalMetadata } from '@/components/legal/legal-page';

export const metadata = legalMetadata('cookies');
export const dynamic = 'force-dynamic';

export default function Page() {
  return <LegalPage id="cookies" />;
}
