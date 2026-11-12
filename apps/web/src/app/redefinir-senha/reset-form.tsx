'use client';
import { useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { authLinkClass } from '@/components/auth-page-shell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export function ResetForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="space-y-4" role="alert">
        <p className="text-base leading-relaxed">Esse link não vale mais. Ele pode ter vencido ou já ter sido usado.</p>
        <Link href="/esqueci-senha" className={authLinkClass}>Pedir um link novo</Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="space-y-4" role="status">
        <p className="text-base leading-relaxed">Senha nova salva. Agora é só entrar.</p>
        <Link href="/login" className={authLinkClass}>Ir para o login</Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    if (password !== confirm) return setError('As duas senhas não são iguais.');
    setLoading(true);
    const { error: err } = await authClient.resetPassword({ newPassword: password, token: token! });
    setLoading(false);
    if (err) return setError(err.status === 429 ? 'Muitas tentativas. Espere um pouco.' : 'Esse link não vale mais. Peça um novo em "Esqueci minha senha".');
    setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-describedby={error ? 'reset-error' : undefined}>
      <Field label="Senha nova" htmlFor="new-password">
        <Input id="new-password" name="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Repita a senha" htmlFor="confirm-password">
        <Input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <p id="reset-error" role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? 'Salvando…' : 'Salvar senha'}</Button>
    </form>
  );
}
