import { test, expect } from '@playwright/test';
import { courseIdBySlug, login } from './helpers';

/**
 * Coerência produção → publicação (incremento 3, auditoria P1-1/P1-2):
 * - a publicação exige `expectedRevision` (422 sem ela) e confere o estado da mídia;
 * - vídeo simulado é listado na confirmação (em modo de demonstração não bloqueia);
 * - trocar a voz na apresentação deixa o vídeo "desatualizado (apresentação mudou)"
 *   na lista de vídeos, na validação (`MEDIA_STALE`) e no orçamento.
 * Usa o "Pode entrar" do seed do e2e, que tem um vídeo SIMULADO com impressão da apresentação.
 */
test.describe('estado da mídia na publicação', () => {
  test('publicar sem expectedRevision é 422; a confirmação lista vídeos simulados e faltando', async ({ page }) => {
    await login(page, 'admin@demo.local');
    const courseId = await courseIdBySlug(page, 'pode-entrar');

    const noRev = await page.request.post(`/api/courses/${courseId}/publish`, { data: {} });
    expect(noRev.status()).toBe(422);

    const validation = await (await page.request.post(`/api/courses/${courseId}/validate`)).json();
    expect(validation.media.simulated).toBe(1);
    expect(validation.warnings.some((w: { code: string; nodeId?: string }) => w.code === 'MEDIA_SIMULATED' && w.nodeId === 'q03_primeiro_emprego')).toBe(true);

    await page.goto(`/estudio/cursos/${courseId}/revisao`);
    await page.getByTestId('publish').click();
    const confirm = page.getByTestId('publish-confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm.getByTestId('publish-confirm-media')).toContainText(/1 vídeo simulado/);
    // modo de demonstração: nada de caixa "Publicar mesmo assim"; o botão libera sozinho
    await expect(confirm.getByTestId('publish-allow-simulated')).toHaveCount(0);
    await expect(confirm.getByTestId('publish-confirm-button')).toBeEnabled();
    await confirm.getByTestId('publish-confirm-cancel').click();
    await expect(page.getByTestId('publish-confirm')).toHaveCount(0);
  });

  test('trocar a voz marca o vídeo como "apresentação mudou" na lista, na validação e no orçamento', async ({ page }) => {
    await login(page, 'autor@demo.local');
    const courseId = await courseIdBySlug(page, 'pode-entrar');
    const before = await (await page.request.post(`/api/courses/${courseId}/validate`)).json();
    expect(before.media.stale).toBe(0);

    const draft = await (await page.request.get(`/api/courses/${courseId}/draft`)).json();
    const doc = structuredClone(draft.document);
    doc.presentation = { ...doc.presentation, avatarId: doc.presentation.avatarId ?? 'sim_avatar_ana', voiceProvider: 'heygen', voiceId: 'sim_voice_joao', voiceName: 'João (e2e)' };
    const saved = await page.request.put(`/api/courses/${courseId}/draft`, { data: { document: doc, expectedRevision: draft.revision } });
    expect(saved.ok()).toBeTruthy();
    const savedRevision = (await saved.json()).revision as number;

    const after = await (await page.request.post(`/api/courses/${courseId}/validate`)).json();
    expect(after.media.stale).toBe(1);
    expect(after.warnings.find((w: { code: string; nodeId?: string }) => w.code === 'MEDIA_STALE' && w.nodeId === 'q03_primeiro_emprego')?.message).toMatch(/apresentação/);

    // lista de vídeos do painel: estado próprio e filtro
    await page.goto(`/estudio/cursos/${courseId}`);
    const list = page.getByTestId('course-video-list');
    await list.scrollIntoViewIfNeeded();
    await expect(list.getByTestId('video-row-q03_primeiro_emprego')).toHaveAttribute('data-video-status', 'stale_presentation');
    await expect(list.getByTestId('video-row-q03_primeiro_emprego')).toContainText('apresentação mudou');
    await list.getByTestId('video-filter-stale_presentation').click();
    await expect(list.locator('[data-testid^="video-row-"]')).toHaveCount(1);
    // cenas com texto mas sem direção nem vídeo também aparecem (antes ficavam escondidas)
    await list.getByTestId('video-filter-none').click();
    expect(await list.locator('[data-testid^="video-row-"]').count()).toBeGreaterThan(5);

    // o orçamento inclui a cena desatualizada pela apresentação
    const quote = await (await page.request.post(`/api/courses/${courseId}/media-jobs/quote`, { data: { includeStale: true } })).json();
    expect(quote.items.some((it: { nodeId: string }) => it.nodeId === 'q03_primeiro_emprego')).toBe(true);
    const quoteNoStale = await (await page.request.post(`/api/courses/${courseId}/media-jobs/quote`, { data: { includeStale: false } })).json();
    expect(quoteNoStale.items.some((it: { nodeId: string }) => it.nodeId === 'q03_primeiro_emprego')).toBe(false);

    // restaura a apresentação para os outros testes
    const cur = await (await page.request.get(`/api/courses/${courseId}/draft`)).json();
    const restore = await page.request.post(`/api/courses/${courseId}/revisions/${draft.revision}/restore`, { data: { expectedRevision: cur.revision } });
    expect(restore.ok()).toBeTruthy();
    void savedRevision;
  });
});
