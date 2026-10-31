'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label, Select } from '@/components/ui/input';

export function EnrollForm({ courseId, students }: { courseId: string; students: Array<{ id: string; name: string; email: string }> }) {
  const router = useRouter();
  const [userId, setUserId] = useState(students[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (students.length === 0) return <p className="text-sm text-fg-muted">Todos os alunos do workspace já estão matriculados.</p>;
  return (
    <form
      className="panel flex flex-wrap items-end gap-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api(`/api/courses/${courseId}/enrollments`, { json: { userId } });
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Erro ao matricular');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="min-w-[14rem] flex-1">
        <Label htmlFor="enroll-user">Aluno</Label>
        <Select id="enroll-user" className="text-sm" value={userId} onChange={(e) => setUserId(e.target.value)} data-testid="enroll-user">
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={busy} data-testid="enroll-submit">{busy ? 'Matriculando…' : 'Matricular aluno'}</Button>
      {error && <p role="alert" className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
