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
  caSubject: '/C=US/ST=Colorado/L=Denver/CN=_HostLocal-hostlocal',
  filter: {
    'application/x-httpd-php': ['php', 'text/html'],
  },
};
