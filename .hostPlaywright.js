import {defineConfig} from './lib/config.js';
import {version} from './lib/version.js';

export default defineConfig({
  caSubject: '/C=US/ST=Colorado/L=Denver/O=@cto.af/CN=cto-af-test-CA/OU=playwright',
  port: 9001,
  open: false,
  glob: ['README.md'],
  exec: 'npm run docs',
  headers: {
    'x-hostlocal-version': version,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
  temp: true,
  logLevel: 1,
  prefix: '/prefix',
  CGI: {
    'application/x-httpd-php': '/opt/homebrew/bin/php-cgi',
  },
});
