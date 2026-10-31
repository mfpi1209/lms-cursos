import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'senha-dev-123';

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Id de um curso do workspace pelo slug (o seed do e2e cria `comunicacao-no-primeiro-emprego` e `pode-entrar`). */
export async function courseIdBySlug(page: Page, slug: string): Promise<string> {
  const res = await page.request.get('/api/courses');
  if (!res.ok()) throw new Error(`GET /api/courses -> ${res.status()}`);
  const { courses } = (await res.json()) as { courses: Array<{ id: string; slug: string | null; title: string }> };
  const found = courses.find((c) => c.slug === slug);
  if (!found) throw new Error(`curso com slug "${slug}" não encontrado (rode o seed do e2e)`);
  return found.id;
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

/** Avança o player até o nó indicado ou até a conclusão, seguindo um roteiro de respostas por nodeId. */
export async function playThrough(page: Page, script: Record<string, { option?: string; options?: string[]; text?: string }>, stopAt?: string) {
  for (let i = 0; i < 40; i++) {
    const completed = page.getByTestId('player-completed');
    if (await completed.isVisible().catch(() => false)) return;
    const node = page.getByTestId('player-node');
    await expect(node).toBeVisible();
    const nodeId = await node.getAttribute('data-node-id');
    if (stopAt && nodeId === stopAt) return;
    const type = await node.getAttribute('data-node-type');
    const step = script[nodeId!];
    if (type === 'choice') {
      if (step?.option) await page.getByTestId(`option-${step.option}`).click();
      else await page.locator('[data-testid^="option-"]').first().click();
      await page.getByTestId('player-submit').click();
    } else if (type === 'assessment') {
      if (step?.options) for (const o of step.options) await page.getByTestId(`option-${o}`).click();
      else await page.locator('[data-testid^="option-"]').first().click();
      await page.getByTestId('player-submit').click();
      // se errou e ainda há tentativas, responde de novo até seguir
      if (await page.getByTestId('assessment-result').isVisible().catch(() => false)) {
        await page.locator('[data-testid^="option-"]').nth(1).click();
        await page.getByTestId('player-submit').click();
      }
    } else if (type === 'reflection') {
      await page.getByTestId('reflection-text').fill(step?.text ?? 'Eu avisaria cedo, mostraria os fatos e proporia uma alternativa concreta com prazo.');
      await page.getByTestId('player-submit').click();
    } else if (type === 'end') {
      return;
    } else {
      await page.getByTestId('player-continue').click();
    }
    await expect(node).not.toHaveAttribute('data-node-id', nodeId!, { timeout: 10_000 }).catch(() => {});
  }
  throw new Error('playThrough: limite de passos atingido');
}
