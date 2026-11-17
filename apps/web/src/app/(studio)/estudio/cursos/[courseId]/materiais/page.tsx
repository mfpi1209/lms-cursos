import { MaterialsEditor } from './materials-editor';

export const metadata = { title: 'Materiais de apoio' };
export const dynamic = 'force-dynamic';

/** Materiais de apoio do curso (PDF, imagem, link): a aluna vê na página do curso e, por módulo, dentro da aula. */
export default async function CourseMaterialsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return <MaterialsEditor courseId={courseId} />;
}
