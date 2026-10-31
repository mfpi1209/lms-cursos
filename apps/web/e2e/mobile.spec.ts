import { test, expect, type Page } from '@playwright/test';
import { courseIdBySlug, login } from './helpers';

/**
 * Estúdio no celular (projeto `mobile`, Pixel 7): a trilha de montagem e o
 * painel do curso cabem na largura, sem rolagem horizontal, e a lista de
 * vídeos continua operável. Complementa a verificação manual a 375 px.
 */
async function noHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, 'a página não deve rolar na horizontal').toBeLessThanOrEqual(cw + 1);
}

test.describe('estúdio no celular', () => {
  test('painel do curso e trilha de montagem sem rolagem horizontal', async ({ page }) => {
    await login(page, 'autor@demo.local');
    const courseId = await courseIdBySlug(page, 'pode-entrar');
    await page.goto(`/estudio/cursos/${courseId}`);
    await expect(page.getByTestId('course-panel')).toBeVisible();
    await noHorizontalScroll(page);
    const list = page.getByTestId('course-video-list');
    await list.scrollIntoViewIfNeeded();
    await expect(list.getByTestId('video-filter-all')).toBeVisible();
    await noHorizontalScroll(page);

    await page.goto(`/estudio/cursos/${courseId}/montar`);
    await expect(page.getByTestId('wizard')).toBeVisible();
    await noHorizontalScroll(page);
    await page.goto(`/estudio/cursos/${courseId}/montar?passo=revisao`);
    await expect(page.getByTestId('step-header-revisao')).toBeVisible();
    await expect(page.getByTestId('review-checklist')).toBeVisible();
    await noHorizontalScroll(page);
  });
});
