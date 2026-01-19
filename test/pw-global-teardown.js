import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Playwright global teardown.  Deletes Firefox policy file, and whatever else
 * is in that directory.
 */
export default async function globalTeardown() {
  const tmp = path.dirname(process.env.PLAYWRIGHT_FIREFOX_POLICIES_JSON);
  await fs.rm(tmp, {
    force: true,
    recursive: true,
  });
}
