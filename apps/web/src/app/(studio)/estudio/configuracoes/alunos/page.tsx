import { getDb, students } from '@lms/db';
import { requireViewer } from '@/server/viewer';
import { emailState } from '@/server/student-import';
import { ImportForm } from './import-form';

export const metadata = { title: 'Importar alunos' };
export const dynamic = 'force-dynamic';

export default async function ImportarAlunosPage() {
  const viewer = await requireViewer();
  const courses = await students.listPublishedCourseSlugs(getDb(), viewer.workspace.id);
  return (
    <div className="space-y-8">
      <section className="max-w-3xl space-y-4">
        <h1>Importar alunos por CSV</h1>
        <p className="text-lg text-fg-muted">
          Envie a planilha, confira a prévia linha a linha e só então aplique. Repetir o mesmo arquivo não duplica ninguém: o e-mail identifica o aluno.
        </p>
        <p className="text-sm text-fg-muted">
          Colunas: <code>nome,email,rgm,telefone,cursos</code>. O <code>rgm</code> é obrigatório e único no workspace. Em <code>cursos</code>, os códigos (slugs) dos cursos publicados, separados por <code>;</code>.
          Aceita separador vírgula, ponto e vírgula ou tabulação, aspas, acentos (UTF-8) e até 5.000 linhas. O aluno não recebe senha: entra por link de acesso.
        </p>
      </section>
      <ImportForm courses={courses} email={emailState()} />
    </div>
  );
}
