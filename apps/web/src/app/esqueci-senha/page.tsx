import { AuthPageShell } from '@/components/auth-page-shell';
import { ForgotForm } from './forgot-form';

export const metadata = { title: 'Esqueci minha senha' };

export default function EsqueciSenhaPage() {
  return (
    <AuthPageShell title="Esqueceu a senha?" lead="Digite seu e-mail. Se ele tiver cadastro, enviamos um link para você criar uma senha nova.">
      <ForgotForm />
    </AuthPageShell>
  );
}
