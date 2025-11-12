import {defineConfig} from './lib/config.js';
import {version} from './lib/version.js';

export default defineConfig({
  port: 8112,
  open: 'docs/index.html',
  glob: ['src/*.ts', 'README.md'],
  exec: 'npm run docs',
  headers: {
    'x-hostlocal-version': version,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
  CGI: {
    'application/x-httpd-php': '/opt/homebrew/bin/php-cgi',
  },
});
