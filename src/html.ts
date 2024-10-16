import {Buffer} from 'node:buffer';
import fs from 'node:fs/promises';
import markdownit from 'markdown-it';

const md = markdownit({
  html: true,
  linkify: true,
  typographer: true,
});

const clientSrc = await fs.readFile(
  new URL('./client.js', import.meta.url),
  'utf8'
);
const clientScriptString = `
<script type="module">
${clientSrc}
</script>
`;
const clientScriptBuffer = Buffer.from(clientScriptString);

/**
 * Add the client script for auto-refresh to the end of the HTML contents.
 *
 * @param buf Original HTML.
 * @returns Modified HTML.
 */
export function addClientScript(buf: Buffer): Buffer {
  return Buffer.concat([buf, clientScriptBuffer]);
}

/**
 * Render Markdown to HTML.
 *
 * @param buf Markdown.
 * @param url This documnent's URL.
 * @returns HTML in a buffer.
 */
export function markdownToHTML(buf: Buffer, url: string): Buffer {
  const mkd = buf.toString();
  const html = `\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${url}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.7.0/github-markdown-dark.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>

  <style>
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }

    @media (max-width: 767px) {
      .markdown-body {
        padding: 15px;
      }
    }
  </style>
</head>
<body class="markdown-body">
${md.render(mkd)}
</body>
</html>
<script>hljs.highlightAll();</script>
${clientScriptString}
`;
  return Buffer.from(html);
}
