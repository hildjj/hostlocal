import {defineConfig, devices} from '@playwright/test';
import config from './.hostPlaywright.js';

const {port, prefix} = config;
const baseURL = `https://localhost:${port}${prefix}/`;
const isCI = Boolean(process.env.CI);

let repeats = 1;
const rei = process.argv.indexOf('--repeat-each');
if (rei >= 0) {
  repeats = parseInt(process.argv[rei + 1], 10);
}

/** @import {Project} from '@playwright/test' */
/** @type {Project[]} */
const projects = [
  {
    name: 'chromium',
    use: {...devices['Desktop Chrome']},
  },
  {
    name: 'firefox',
    use: {...devices['Desktop Firefox']},
  },
  {
    name: 'webkit',
    use: {...devices['Desktop Safari']},
  },
];

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './test',
  testMatch: '*.pw.js',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source
     code. */
  forbidOnly: isCI,

  /* Retry on CI only */
  retries: isCI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: isCI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'dot', // 'html'

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for major browsers */
  projects,

  /* Run your local dev server before starting the tests */
  webServer: {
    command: `node bin/hostlocal.js -c ./.hostPlaywright.js --shutTimes ${projects.length * repeats}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    ignoreHTTPSErrors: true,
    timeout: 30000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
