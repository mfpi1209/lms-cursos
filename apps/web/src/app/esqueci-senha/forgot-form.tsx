'use client';
import { useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { authLinkClass } from '@/components/auth-page-shell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

/** A resposta é sempre a mesma, exista ou não conta com o e-mail (não revela cadastros). */
export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.requestPasswordReset({ email, redirectTo: '/redefinir-senha' });
    setLoading(false);
    // só erro de limite ou de rede aparece; "e-mail sem conta" não existe como resposta
    if (err && (err.status === 429 || !err.status)) {
      setError('Muitos pedidos seguidos. Espere um pouco e tente de novo.');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4" role="status">
        <p className="text-base leading-relaxed">Pronto. Se esse e-mail tiver cadastro, o link chega em alguns minutos. Olhe também a caixa de spam.</p>
        <p className="text-sm text-fg-muted">O link vale por 1 hora e só funciona uma vez.</p>
        <Link href="/login" className={authLinkClass}>Voltar para o login</Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-describedby={error ? 'forgot-error' : undefined}>
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {error && <p id="forgot-error" role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? 'Enviando…' : 'Enviar link'}</Button>
      <p className="text-center text-sm"><Link href="/login" className={authLinkClass}>Voltar para o login</Link></p>
    </form>
  );
}
