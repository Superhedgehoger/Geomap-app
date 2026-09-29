import { expect, test } from '@playwright/test';

test('task navigation separates business, map editing and dangerous actions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#decisionModeBtn')).toContainText('编辑地图');
  await expect(page.locator('[data-section="overview"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('[data-section="data"]').click();
  await expect(page.locator('.decision-shell-dashboard')).toBeHidden();
  await expect(page.locator('.decision-section-context')).toContainText('经营数据');
  await page.locator('#decisionModeBtn').click();
  await expect(page.getByRole('tab', { name: '地图', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('#toggleCompactLabelsBtn')).toBeVisible();
  await expect(page.locator('#btn-clear-all-layers')).toBeHidden();
  await expect(page.locator('#baseMapSelect')).toBeVisible();
  const coordinatesFit = await page.locator('#gotoLng').evaluate((element) => {
    const panel = document.getElementById('controls')!.getBoundingClientRect();
    return element.getBoundingClientRect().right <= panel.right;
  });
  expect(coordinatesFit).toBe(true);
  await page.locator('#toolsFabBtn').click();
  await expect(page.getByText('点位表格', { exact: true })).toBeVisible();
  await page.locator('#toolsFabBtn').click();
  await page.screenshot({ path: test.info().outputPath('map-navigation.png') });
  await expect(page.locator('#basemapSelect')).toHaveCount(0);
  await page.getByRole('tab', { name: '点位', exact: true }).click();
  await expect(page.locator('#addManualMarkerBtn')).toBeVisible();
  await expect(page.locator('#toggleDrawToolbarBtn')).toBeVisible();
  await expect(page.locator('#baseMapSelect')).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '文件', exact: true })).toBeFocused();
  await expect(page.locator('#geojsonFile')).toBeVisible();
  await expect(page.locator('#exportGeoJSONBtn')).toBeVisible();
  await page.getByRole('tab', { name: '快照', exact: true }).click();
  await expect(page.getByTitle('保存快照')).toBeVisible();
  await expect(page.locator('#editor-panel-snapshots')).toContainText('历史复盘');
  await page.getByRole('tab', { name: '设置', exact: true }).click();
  await expect(page.locator('#toggleEditorBtn')).toBeVisible();
  await expect(page.locator('#btn-clear-all-layers')).toBeHidden();
  await page.getByText('清理地图数据', { exact: true }).click();
  await expect(page.locator('#btn-clear-all-layers')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('settings-navigation.png') });
  await page.locator('#btn-map-control-collapse').click();
  await page.getByRole('button', { name: '打开文件', exact: true }).click();
  await expect(page.locator('#geojsonFile')).toBeVisible();
  await page.locator('#decisionReturnBtn').click();
  await expect(page.locator('[data-section="overview"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.decision-shell-dashboard')).toBeVisible();
  const overflow = await page
    .locator('#decisionShell')
    .evaluate((element) => element.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('overview-navigation.png') });
});
