import { redirect } from 'next/navigation';
import { identity } from '@lms/db';
import { requireViewer } from '@/server/viewer';
import { SettingsTabs } from './settings-tabs';

/** Configurações do workspace: só a administração (importar alunos, tokens de integração). */
export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer().catch(() => null);
  if (!viewer) redirect('/login');
  if (!identity.canEnroll(viewer.role)) redirect('/estudio');
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="eyebrow">Configurações do workspace</p>
        <SettingsTabs />
      </div>
      {children}
    </div>
  );
}
