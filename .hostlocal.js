import {version} from './lib/version.js';

export default {
  port: 8112,
  open: 'docs/index.html',
  glob: ['src/*.ts', 'README.md'],
  exec: 'npm run docs',
  headers: {
    'x-hostlocal-version': version,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
  caSubject: '/C=US/ST=Colorado/L=Denver/O=_HostLocal/CN=hostlocal',
  CGI: {
    'application/x-httpd-php': '/opt/homebrew/bin/php-cgi',
  },
};
