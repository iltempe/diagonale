import { expect, test } from '@playwright/test';

test.describe('editor', () => {
  test.use({ locale: 'it-IT' });

  test('loads the demo board with 4 phases and plays it', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('pitch').locator('canvas').first()).toBeVisible();
    await expect(page.getByTestId('phase-3')).toBeVisible();
    await expect(page.getByTestId('phase-4')).toHaveCount(0);
    await page.getByTestId('play').click();
    await page.waitForTimeout(800);
    await expect(page.locator('.playback .time')).not.toHaveText(/^0:00\.0 /);
  });

  test('switches language instantly without reloading', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('open-share')).toContainText('Condividi');
    await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));
    await page.getByTestId('lang-en').click();
    await expect(page.getByTestId('open-share')).toContainText('Share');
    await expect(page.locator('.inspector summary').first()).toHaveText('Selection');
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);
    await page.getByTestId('lang-it').click();
    await expect(page.locator('.inspector summary').first()).toHaveText('Selezione');
  });

  test('creates a board, applies a formation, adds phases and undoes', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('open-boards').click();
    await page.getByPlaceholder('Titolo della nuova lavagna').fill('Test e2e');
    await page.getByTestId('create-board').click();
    await expect(page.getByTestId('open-boards')).toContainText('Test e2e');
    await page.locator('summary', { hasText: 'Squadre' }).click();
    await page.getByTestId('apply-formation-home').click();
    await expect(page.locator('.team-editor').first()).toContainText('11 giocatori');
    await page.locator('body').press('n');
    await page.getByTestId('add-phase').click();
    await expect(page.getByTestId('phase-2')).toBeVisible();
    // add a player by tapping the pitch
    await page.getByTestId('tool-player_away').click();
    const box = (await page.getByTestId('pitch').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);
    await expect(page.locator('.inspector')).toContainText('Rimuovi giocatore');
    // draw a pass arrow
    await page.locator('body').press('1');
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4, { steps: 5 });
    await page.mouse.up();
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('undo')).toBeEnabled();
    // the board survives a reload (IndexedDB)
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByTestId('open-boards')).toContainText('Test e2e');
    await expect(page.getByTestId('phase-1')).toBeVisible();
  });

  test('share link opens the read-only player', async ({ page, context }) => {
    await page.goto('./');
    await page.getByTestId('open-share').click();
    const url = await page.getByTestId('share-url').inputValue();
    expect(url).toContain('#/d/');
    const p2 = await context.newPage();
    await p2.goto(url);
    await expect(p2.getByTestId('shared-stage').locator('canvas').first()).toBeVisible();
    await expect(p2.locator('.shared header h1')).toContainText('4-3-3');
  });
});

test('shared player works on a phone @mobile', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('open-share').click();
  const url = await page.getByTestId('share-url').inputValue();
  await page.goto(url);
  await expect(page.getByTestId('shared-stage').locator('canvas').first()).toBeVisible();
});
