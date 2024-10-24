import {expect, test} from '@playwright/test';
import fs from 'node:fs/promises';

test('has title', async({page}) => {
  let response = await page.request.get('test/fixtures/index.html');
  expect(response.status()).toBe(200);

  response = await page.request.get('src/');
  expect(response.status()).toBe(404);

  response = await page.request.get('___DOES_NOT_EXIST');
  expect(response.status()).toBe(404);

  response = await page.request.get('/favicon.ico');
  expect(response.status()).toBe(200);

  await page.goto('docs/index.html', {waitUntil: 'networkidle'});
  await expect(page).toHaveTitle(/hostlocal - v\d+\.\d+\.\d+/);

  const now = new Date();
  await fs.utimes(new URL('../docs/index.html', import.meta.url), now, now);

  await page.waitForURL('docs/index.html', {waitUntil: 'load'});

  await page.evaluate(() => {
    // eslint-disable-next-line no-undef
    hostLocalSendShutdown();
  });

  await page.close({
    runBeforeUnload: true,
  });
});
