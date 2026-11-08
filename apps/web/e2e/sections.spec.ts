import { expect, test } from '@playwright/test';

test.use({ locale: 'it-IT' });

test('team centre: squad, fixture, result, stats, parent report with initials', async ({ page }) => {
  await page.goto('./#/team');
  await page.getByTestId('create-team').click();
  for (const [first, last] of [['Luca', 'Rossi'], ['Marco', 'Bianchi']]) {
    await page.getByTestId('add-squad-player').click();
    const row = page.locator('.table tbody tr').last();
    await row.getByLabel('Nome', { exact: true }).fill(first);
    await row.getByLabel('Cognome').fill(last);
  }
  await page.getByTestId('tc-tab-fixtures').click();
  await page.getByTestId('add-fixture').click();
  await page.getByLabel('Avversario').fill('Rivali');
  const selects = page.locator('.table select');
  await selects.nth(0).selectOption('starter');
  await selects.nth(1).selectOption('bench');
  await page.getByLabel('Partita giocata').check();
  await page.getByLabel('Gol fatti').fill('2');
  await page.locator('input[aria-label="Gol"]').first().fill('2');
  await page.getByTestId('parent-report').click();
  await expect(page.getByTestId('report-text')).toHaveValue(/L\. R\. \(2\)/);
  await expect(page.getByTestId('report-text')).not.toHaveValue(/Rossi/);
  await page.getByTestId('privacy').selectOption('full');
  await expect(page.getByTestId('report-text')).toHaveValue(/Luca Rossi/);
  await page.keyboard.press('Escape');
  await page.getByTestId('tc-tab-stats').click();
  await expect(page.locator('.kpi').first()).toContainText('1');
  await page.getByTestId('tc-tab-settings').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-ics').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.ics$/);
});

test('planner: session with a drill exports a PDF', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('phase-0')).toBeVisible();
  await page.getByTestId('nav-planner').click();
  await page.getByTestId('planner-new').click();
  await page.locator('.page-main select').last().selectOption({ index: 1 });
  await expect(page.locator('.page-main .card')).toHaveCount(1);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Esporta PDF' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
});

test('presentation mode plays the current board', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('phase-0')).toBeVisible();
  await page.getByTestId('present').click();
  await expect(page.getByTestId('shared-stage').locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Chiudi' }).click();
  await expect(page.getByTestId('phase-0')).toBeVisible();
});

test('one-click 9:16 social video export', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('phase-0')).toBeVisible();
  await page.getByTestId('open-export').click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.getByTestId('export-social').click()]);
  expect(dl.suggestedFilename()).toMatch(/-9x16\.(mp4|webm)$/);
});
