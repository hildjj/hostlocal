/**
 * @type {import('./lib/index.js').HostOptions}
 */
export default {
  port: 9000,
  dir: 'coverage/lcov-report',
  glob: [
    'src/*.ts',
    'test/**',
    'package.json',
    'tsconfig.json',
    'playwright.config.js',
  ],
  exec: 'npm run test',
  initial: true,
  timeout: 30000,
};
