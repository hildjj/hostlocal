import {AddClient, type FileInfo} from './html.js';
import type {RequiredHostOptions} from './opts.js';
import type {ServerState} from './staticFile.js';
import ansiHTML from 'ansi-html';
import assert from 'node:assert';
import http2 from 'node:http2';
import path from 'node:path';

function escape(s: string): string {
  return ansiHTML(s.replace(
    /[<>&]/g,
    (c: string) => `&#${c.codePointAt(0)};`
  ));
}

/**
 * Write the execError from state to the response.
 *
 * @param opts Options.
 * @param state Server state.
 * @param req Request.
 * @param res Response.
 * @returns Status code sent, for logging.
 * @throws Assert.
 */
export function errorHTML(
  opts: RequiredHostOptions,
  state: ServerState,
  req: http2.Http2ServerRequest,
  res: http2.Http2ServerResponse
): number {
  assert(state.execError);

  const html = `\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Exec error</title>
  <style type="text/css">
:root {
  color-scheme: light dark;
  --background-color: #fff;
  --text-color: #222;
  --title-color: #191919;
}
body {
  margin: 20px;
  color: var(--text-color);
  background-color: var(--background-color);
}
/* Dark mode. */
@media (prefers-color-scheme: dark) {
:root {
  --background-color: #121212;
  --text-color: #f0f0f0;
  --title-color: #fff;
}
  </style>
</head>
<body>
  <pre>
${escape(state.execError)}
  </pre>
</body>
</html>
`;
  const url = new URL(req.url, state.baseURL);
  const {pathname} = url;

  const relative = path.relative(state.baseURL.pathname, pathname);
  const file = path.resolve(path.join(state.base, relative));

  const headers: http2.OutgoingHttpHeaders = {
    ...state.headers,
    'content-type': 'text/html',
    'last-modified': new Date().toUTCString(),
  };

  const info: FileInfo = {
    file,
    url,
    headers,
    size: html.length,
    signal: opts.signal,
    dir: opts.dir,
    log: opts.log,
  };

  res.writeHead(500, headers);
  const add = new AddClient(info);
  add.pipe(res);
  add.end(html);
  return 500;
}
