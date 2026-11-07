import 'dotenv/config';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { writeArrayBuffer } from 'geotiff';
import { eq } from 'drizzle-orm';
import { db, pool } from '@/db';
import { projects } from '@/db/schema';
import type { Dataset, Metrics, Project, Sample } from '@/types';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const name = `TerraLab smoke test ${Date.now()}`;

async function main() {
  if (process.env.SATELLITE_API_URL) throw new Error('Smoke tests require the local demo backend.');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  // Keep external basemap availability out of a local raster integration test.
  await page.route('**/server.arcgisonline.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==',
        'base64',
      ),
    }),
  );
  let projectId: string | null = null;
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await expect(page.locator('.marker-dot')).toHaveCount(12);
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.getByRole('button', { name: 'Create project', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Project name').fill(name);
    await dialog
      .getByPlaceholder('What would you like to explore?')
      .fill('Temporary end-to-end test project.');
    await dialog.getByLabel('Classification classes').selectOption('3');
    const creation = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/projects') && response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
    const created = (await (await creation).json()) as Project;
    assert.ok(created.id, 'The project should be created in PostgreSQL');
    projectId = created.id;
    await expect(page.getByRole('heading', { name: 'Dataset library' })).toBeVisible();
    console.log('PASS project creation and class definitions');

    const width = 48,
      height = 48;
    const values = Array.from({ length: width * height * 4 }, (_, index) => {
      const pixel = Math.floor(index / 4),
        band = index % 4;
      return band === 3 ? 150 + (pixel % 95) : 30 + ((pixel + band * 35) % 130);
    });
    const raster = writeArrayBuffer(values, {
      width,
      height,
      ModelPixelScale: [0.002, 0.002, 0],
      ModelTiepoint: [0, 0, 0, -121.76, 38.575, 0],
      GeographicTypeGeoKey: 4326,
      GTModelTypeGeoKey: 2,
      PhotometricInterpretation: 2,
    });
    await page
      .locator('.upload-dropzone input[type="file"]')
      .setInputFiles({
        name: 'smoke-scene.tif',
        mimeType: 'image/tiff',
        buffer: Buffer.from(raster),
      });
    await expect(page.locator('.dataset-name strong')).toHaveText('smoke-scene.tif', {
      timeout: 30000,
    });
    const scenes = (await (
      await page.request.get(`${base}/api/projects/${projectId}/dataset`)
    ).json()) as Dataset[];
    assert.equal(scenes[0].bands, 4);
    assert.equal(scenes[0].width, 48);
    assert.equal(scenes[0].crs, 'EPSG:4326');
    assert.ok(scenes[0].bounds && scenes[0].previewUrl);
    console.log('PASS actual GeoTIFF upload, preview, and authoritative metadata');

    await page.getByRole('button', { name: 'View smoke-scene.tif on map' }).click();
    await page.getByLabel('Band combination').selectOption('ndvi');
    await expect(page.locator('.raster-loading')).toHaveCount(0, { timeout: 20000 });
    await expect(page.locator('.leaflet-image-layer')).toHaveAttribute('src', /^data:image\/png/, {
      timeout: 20000,
    });
    await page.getByLabel('Band combination').selectOption('false-color');
    await expect(page.locator('.raster-loading')).toHaveCount(0, { timeout: 20000 });
    await page.getByLabel('Band combination').selectOption('true-color');
    console.log('PASS true color, false color, and NDVI raster rendering');

    await page.getByRole('button', { name: 'Query next batch', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Batch size').selectOption('6');
    await page.getByRole('dialog').getByRole('button', { name: 'Query next batch' }).click();
    await expect(page.locator('.marker-dot')).toHaveCount(6);
    await page.getByRole('button', { name: 'Draw point (P)', exact: true }).click();
    await page.locator('.satellite-map').click({ position: { x: 280, y: 190 } });
    await expect(page.locator('.marker-dot')).toHaveCount(7);
    await page.getByRole('button', { name: 'Pan map', exact: true }).click();
    await page.locator('h1').click();
    await page.keyboard.press('2');
    await page.keyboard.press('n');
    await page
      .getByRole('textbox', { name: 'Sample note' })
      .fill('Human reviewed: boundary between water and vegetation.');
    await page.getByRole('button', { name: 'Accept label', exact: true }).click();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByRole('button', { name: 'Batch labeling mode' }).click();
    await page.getByRole('button', { name: 'Accept all', exact: true }).click();
    await expect(page.locator('.batch-progress')).toContainText('6 / 6 reviewed');
    await page.getByRole('button', { name: 'Submit labels & retrain' }).click();
    await expect(page.locator('.training-stage')).toBeVisible();
    await expect(page.locator('.training-stage')).toHaveCount(0, { timeout: 20000 });
    const metrics = (await (
      await page.request.get(`${base}/api/projects/${projectId}/metrics`)
    ).json()) as Metrics;
    assert.equal(metrics.curve.length, 1);
    assert.equal(metrics.labeledCount, 6);
    const saved = (await (
      await page.request.get(`${base}/api/projects/${projectId}/predictions`)
    ).json()) as Sample[];
    assert.equal(saved.filter((sample) => sample.status === 'skipped').length, 1);
    assert.ok(saved.some((sample) => sample.note.includes('Human reviewed')));
    assert.ok(saved.some((sample) => sample.geometry?.type === 'Point'));
    console.log('PASS querying, drawing, notes, skips, batch review, submission, and retraining');

    await page.locator('h1').click();
    await page.keyboard.press('3');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Submit labels & retrain' }).click();
    await expect(page.locator('.training-stage')).toBeVisible();
    await expect(page.locator('.training-stage')).toHaveCount(0, { timeout: 20000 });
    const corrected = (await (
      await page.request.get(`${base}/api/projects/${projectId}/metrics`)
    ).json()) as Metrics;
    assert.equal(corrected.curve.length, 2);
    assert.equal(corrected.labeledCount, 6, 'Correcting a label must not double-count the sample');
    console.log('PASS correction of previous labels without duplicate counts');

    await page.getByRole('button', { name: 'Datasets', exact: true }).click();
    await page
      .locator('input[aria-label="Import GeoJSON or CSV labels"]')
      .setInputFiles({
        name: 'ground-truth.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          'latitude,longitude,class,note\n38.53,-121.72,Forest,Verified\n38.54,-121.71,Water,Shoreline',
        ),
      });
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: '2 training labels imported.' }),
    ).toBeVisible({ timeout: 20000 });
    const imported = (await (
      await page.request.get(`${base}/api/projects/${projectId}/metrics`)
    ).json()) as Metrics;
    assert.equal(imported.labeledCount, 8);
    console.log('PASS validated CSV ground-truth import');

    await page.getByRole('button', { name: 'Analytics', exact: true }).click();
    await expect(page.locator('.history-table tbody tr')).toHaveCount(2);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export report' }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), `${projectId}-metrics.json`);
    await page.getByRole('button', { name: 'Datasets', exact: true }).click();
    await page.getByRole('button', { name: 'Delete smoke-scene.tif' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove scene' }).click();
    await expect(page.locator('.dataset-name')).toHaveCount(0);
    assert.equal((await page.request.get(`${base}${scenes[0].url}`)).status(), 404);
    console.log('PASS metric exports, iteration history, and durable dataset removal');
    assert.deepEqual(browserErrors, [], 'The browser should have no runtime errors');
    console.log('ALL END-TO-END CHECKS PASSED');
  } finally {
    const temporary = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.name, name));
    for (const item of temporary) {
      const response = await page.request.get(`${base}/api/projects/${item.id}/dataset`);
      if (response.ok())
        for (const scene of (await response.json()) as Dataset[])
          await page.request.delete(`${base}/api/projects/${item.id}/dataset/${scene.id}`);
      await db.delete(projects).where(eq(projects.id, item.id));
    }
    await browser.close();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
