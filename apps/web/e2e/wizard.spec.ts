import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * Trilha de montagem de ponta a ponta em MODO DE DEMONSTRAÇÃO (AI_PROVIDER=fake, MEDIA_SIMULATION=1).
 * Pré-requisito: worker rodando com AI_PROVIDER=fake (processa propostas, fontes e vídeos simulados).
 * Ordem da trilha: ideia → material → estrutura → aulas → apresentação → prévia → produção → publicar.
 */
test.describe('wizard', () => {
  test('ideia → material → estrutura (IA) → aulas (IA) → apresentação → prévia → produção → publicar → painel → storyboard', async ({ page }) => {
    test.setTimeout(240_000);
    await login(page, 'autor@demo.local');
    const caps = await (await page.request.get('/api/ai/capabilities')).json();
    test.skip(caps.provider !== 'fake', 'o wizard e2e só roda em modo demo (AI_PROVIDER=fake) para não gastar tokens reais');

    // passo 1 (fora do curso): /estudio/novo é o briefing; o curso nasce no passo 2
    await page.goto('/estudio/novo');
    await page.getByTestId('brief-title').fill(`Curso wizard ${Date.now()}`);
    await page.getByTestId('brief-topic').fill('como negociar um prazo com o gestor no primeiro estágio');
    await page.getByTestId('audience-first_job').click();
    await page.getByTestId('trait-shy').click();
    await page.getByRole('button', { name: /Criar curso/ }).click();
    await page.waitForURL(/\/montar$/);
    const courseId = page.url().split('/cursos/')[1]!.split('/')[0]!;
    await expect(page.getByTestId('step-header-conteudo')).toBeVisible();
    // a próxima ação aparece duas vezes (cartão compacto no celular + painel lateral): ambas com o mesmo estado
    await expect(page.getByTestId('next-action').first()).toHaveAttribute('data-action', 'sources');

    // passo 2: material
    await page.getByTestId('content-mode-paste').click();
    await page.getByLabel('Nome da fonte').fill('Manual');
    await page.getByTestId('source-paste').fill('Avise cedo, mostre os fatos e proponha uma alternativa. Registre o combinado por escrito.');
    await page.getByRole('button', { name: 'Guardar texto' }).click();
    await expect(page.getByTestId('source-list')).toContainText('Manual');
    await expect(page.getByTestId('next-action').first()).toHaveAttribute('data-action', 'outline');

    // passo 3: proposta de estrutura
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('step-header-estrutura')).toBeVisible();
    await page.getByTestId('outline-propose').click();
    await expect(page.getByTestId('outline-apply')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('outline-apply').click();
    await expect(page.locator('[data-testid^="lesson-"]').first()).toBeVisible({ timeout: 15_000 });

    // passo 4: gerar aulas e aplicar
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('step-header-aulas')).toBeVisible();
    await page.getByLabel('Selecionar todas').check();
    await page.getByTestId('lessons-generate').click();
    // as propostas são opt-in: marca cada uma depois de gerada
    const nLessons = await page.locator('[data-testid^="lesson-row-"]').count();
    await expect(page.locator('[data-testid^="proposal-prp_"]')).toHaveCount(nLessons, { timeout: 90_000 });
    for (const box of await page.locator('[data-testid^="proposal-prp_"]').all()) await box.check();
    await expect(page.getByTestId('lessons-apply')).toBeEnabled();
    await page.getByTestId('lessons-apply').click();
    await expect(page.getByTestId('wizard')).toContainText(/aplicadas/, { timeout: 20_000 });

    // passo 5: apresentação
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('step-header-apresentacao')).toBeVisible();
    await page.getByTestId('presenter-sim_avatar_ana').click();
    await page.getByTestId('voice-sim_voice_ana').click();
    await page.getByTestId('background-areia').click();

    // passo 6: prévia (lista de verificação + testar)
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('step-header-previa')).toBeVisible();
    await expect(page.getByTestId('preview-checklist')).toBeVisible();
    await expect(page.getByTestId('next-action').first()).toHaveAttribute('data-action', 'preview');
    const popup = page.waitForEvent('popup');
    await page.getByTestId('preview-start').click();
    await (await popup).close();

    // passo 7: produção (simulada)
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('step-header-producao')).toBeVisible();
    await expect(page.getByTestId('review-video-stats')).toBeVisible();

    // passo 8: publicar
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('step-header-revisao')).toBeVisible();
    await expect(page.getByTestId('review-publish')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('review-publish').click();
    // confirmação: lista o estado dos vídeos (aqui, sem vídeo: cenas "sem vídeo") e publica com a revisão validada
    const confirm = page.getByTestId('publish-confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm.getByTestId('publish-confirm-media')).toContainText(/sem vídeo|vídeo pronto|Nenhuma cena/);
    await page.getByTestId('publish-confirm-button').click();
    await expect(page.getByTestId('publish-success')).toBeVisible({ timeout: 20_000 });

    // painel do curso: trilha completa e storyboard
    await page.goto(`/estudio/cursos/${courseId}`);
    await expect(page.getByTestId('course-panel')).toBeVisible();
    await expect(page.getByTestId('trail-strip')).toBeVisible();
    await page.getByRole('link', { name: 'Storyboard' }).first().click();
    await page.waitForURL(/\/aulas\//);
    await expect(page.locator('[data-testid^="scene-"]').first()).toBeVisible();
    expect(await page.locator('[data-testid^="scene-"]').count()).toBeGreaterThanOrEqual(5);
    await expect(page.getByTestId('storyboard-issues')).toContainText(/Tudo certo|resolver/);
  });

  test('abrir o assistente num passo pela URL (?passo=)', async ({ page }) => {
    await login(page, 'autor@demo.local');
    await page.goto('/estudio');
    const first = page.locator('[data-testid^="course-"]').first();
    const href = await first.getByRole('link').first().getAttribute('href');
    const courseId = href!.split('/cursos/')[1]!.split('/')[0]!;
    await page.goto(`/estudio/cursos/${courseId}/montar?passo=tema`);
    await expect(page.getByTestId('step-header-tema')).toBeVisible();
    await expect(page).not.toHaveURL(/passo=/);
  });
});
