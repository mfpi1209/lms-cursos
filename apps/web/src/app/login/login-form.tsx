'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export function LoginForm({ linkProblem = false }: { linkProblem?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentLink, setSentLink] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      setError('E-mail ou senha incorretos.');
      return;
    }
    router.replace('/');
    router.refresh();
  }

  // Mesma resposta exista ou não conta com o e-mail: nada aqui revela cadastros.
  async function sendLink() {
    setError(null);
    setSentLink(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Digite seu e-mail para receber o link.');
      return;
    }
    setLoading(true);
    const { error: err } = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: '/aprender', errorCallbackURL: '/login?erro=link' });
    setLoading(false);
    if (err?.status === 429) {
      setError('Muitos pedidos seguidos. Espere um pouco e tente de novo.');
      return;
    }
    setSentLink(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-describedby={error ? 'login-error' : undefined}>
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Senha" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {linkProblem && !error && !sentLink && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">Esse link não vale mais. Ele pode ter vencido ou já ter sido usado. Peça um novo abaixo.</p>
      )}
      {sentLink && (
        <p role="status" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">Se esse e-mail tiver cadastro, o link chega em alguns minutos. Olhe também a caixa de spam.</p>
      )}
      {error && (
        <p id="login-error" role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? 'Aguarde…' : 'Entrar'}</Button>
      <div className="flex flex-col gap-3 pt-1 text-sm sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={sendLink} disabled={loading} className="rounded-sm text-left font-medium underline underline-offset-4 decoration-fg/40 hover:decoration-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60">
          Receber link de acesso por e-mail
        </button>
        <Link href="/esqueci-senha" className="rounded-sm font-medium underline underline-offset-4 decoration-fg/40 hover:decoration-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Esqueci minha senha
        </Link>
      </div>
    </form>
  );
}
