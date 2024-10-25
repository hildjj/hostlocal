/* eslint-disable jsdoc/imports-as-dependencies */
import {defineConfig, devices} from '@playwright/test';
import config from './.hostlocal.js';

const {port} = config;
const prefix = '/prefix';
const baseURL = `https://localhost:${port}${prefix}/`;
const isCI = Boolean(process.env.CI);

/**
 * @type {import('@playwright/test').Project[]}
 */
const projects = [
  {
    name: 'chromium',
    use: {...devices['Desktop Chrome']},
  },

  {
    name: 'firefox',
    use: {...devices['Desktop Firefox']},
    ignoreHTTPSErrors: true,
  },

  {
    name: 'webkit',
    use: {...devices['Desktop Safari']},
    ignoreHTTPSErrors: true,
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
    command: `node bin/hostlocal.js -v --host ::1 -P ${prefix} -g README.md --shutTimes ${projects.length} -o ""`,
    url: baseURL,
    reuseExistingServer: !isCI,
    ignoreHTTPSErrors: true,
    timeout: 30000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
