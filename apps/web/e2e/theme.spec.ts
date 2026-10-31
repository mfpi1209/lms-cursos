import { test, expect } from '@playwright/test';
import { login } from './helpers';

/** Preferência de tema: Sistema / Claro / Escuro, persistida em cookie e aplicada em <html data-theme>. */
test.describe('tema', () => {
  test('alternar o tema persiste após recarregar; "Sistema" segue o sistema operacional', async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await login(page, 'aluna@demo.local');
    await page.goto('/aprender');
    const html = page.locator('html');
    const group = page.getByRole('radiogroup', { name: 'Tema da interface' });
    await expect(group).toBeVisible();

    // Claro
    await group.getByRole('radio', { name: 'Tema claro' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(html).toHaveAttribute('data-theme-pref', 'light');
    await expect(group.getByRole('radio', { name: 'Tema claro' })).toHaveAttribute('aria-checked', 'true');
    expect((await context.cookies()).find((c) => c.name === 'lms-theme')?.value).toBe('light');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('radio', { name: 'Tema claro' })).toHaveAttribute('aria-checked', 'true');

    // Escuro pelo teclado (setas dentro do grupo)
    await page.getByRole('radio', { name: 'Tema claro' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radio', { name: 'Tema escuro' })).toBeFocused();
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(html).toHaveAttribute('data-theme-pref', 'dark');

    // Sistema: resolve pelo prefers-color-scheme e acompanha a mudança sem recarregar
    await page.getByRole('radio', { name: 'Tema sistema' }).click();
    await expect(html).toHaveAttribute('data-theme-pref', 'system');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(html).toHaveAttribute('data-theme-pref', 'system');

    // a mesma preferência vale no player (cabeçalho próprio)
    await page.getByRole('radio', { name: 'Tema escuro' }).click();
    await page.getByRole('link', { name: /Continuar|Começar|Ver resultado/ }).first().click();
    await expect(page).toHaveURL(/\/aprender\/enr_/);
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });
});
