import { AuthPageShell } from '@/components/auth-page-shell';
import { ResetForm } from './reset-form';

export const metadata = { title: 'Nova senha' };

export default async function RedefinirSenhaPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <AuthPageShell title="Crie sua nova senha" lead="Escolha uma senha com pelo menos 8 caracteres.">
      <ResetForm token={error || !token ? null : token} />
    </AuthPageShell>
  );
}
