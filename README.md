# hostlocal

Serve files from a directory over HTTP/1.1 and HTTP/2, with live reload
notifications over a websocket.  It will automatically create self-signed
certificates.

This server is quite opinionated about its defaults to make setup as easy
as possible... if you have a problem shaped like mine.

NOTE:

This server is NOT intended for production use, or any other place where the
clients are not fully-trusted.  Simplifying assumptions have been made to
optimize code size, performance, and usability that make its use in a
production context inappropriate.  Security issues that are filed that do
not take this note into account will not be prioritized.

## Run

```sh
# Serve the docs directory, and open index.html in your default browser.
npx hostlocal docs
```

## CLI

```text
Usage: hostlocal [options] [directory]

Arguments:
  directory                   Directory to serve. (default: cwd)

Options:
  -6, --ipv6                  Listen on IPv6 only, if host supports both IPv4
                              and IPv6.
  -c, --config <file>         If the given file exists, import it as a module
                              and use its default export as the options.  Name
                              is relative to cwd. Command line parameters
                              overwrite options from the config file. (default:
                              ".hostlocal.js")
  --certDir <directory>       Directory, relative to cwd, to cache cert info.
                              (default: ".cert")
  -e, --exec <shell command>  Execute this command when the glob changes.
                              (default: "npm run build")
  -g, --glob <pattern>        Set of files to watch.  If one of these changes,
                              execute the command in the --exec option.  Can be
                              specified multiple times.
  -h, --help                  display help for command
  -H, --host <address>        Hostname or IP address to listen on. "::" for
                              everything. (default: "localhost")
  -i, --initial               If glob is specified, run the exec command on
                              startup, before listening.
  --logFile <file>            If specified, JSON logs are written to this file.
  --no-script                 If specified, JavScript will not be added to the
                              end of HTML files to do auto-refresh.
  --notAfterDays <number>     How many days is the certificate valid? (default:
                              7)
  -o, --open <path>           Open this path in the default browser.  Relative
                              to server root and prefix, if specified.  If
                              empty (""), do not open anything. (default: ".")
  -O, --no-open               Do not open a page in the default browser.
  -p, --port <number>         Port to serve content from.  Use 0 to get an
                              unused port. (default: 8111)
  -P, --prefix <string>       Make all of the URLs served have paths that start
                              with this prefix, followed by a slash.
  -q, --quiet                 Do less logging.  Can be specified more than
                              once.
  --rawMarkdown               Do not process markdown into HTML.
  -t, --timeout <number>      Time, in ms, to allow exec to run.
  -v, --verbose               Do more logging.  Can be specified more than
                              once.
  -V, --version               output the version number
```

## Config files

Instead of using the command line, you can store your configuration in a
file, by default called ".hostlocal.js".  This is an ES6 module with a default
export containing your config.  Its default value is:

```js
import {defineConfig} from './lib/config.js';

export default defineConfig({
  certDir: '.cert',
  config: '.hostlocal.js',
  dir: process.cwd(),
  exec: 'npm run build',
  CGI: {},
  glob: [],
  headers: {},
  host: 'localhost',
  index: ['index.html', 'index.htm', 'README.md'],
  initial: false,
  ipv6: false,
  logLevel: 0,
  logFile: null,
  notAfterDays: 7,
  open: '.',
  port: 8111,
  prefix: '',
  rawMarkdown: false,
  script: true,
  signal: null,
  timeout: null,
});
```

Command-line options take precedence over these.  Most of these match their
command line options for semantics.  Others:

- **dir**: Serve this directory (tied to optional directory in CLI).
- **CGI**: Object containing a map from original mime type to `command`.  The
  command is any shell command that emits at least a content-type header with
  string CR/LF in the header.  **NOTE:** This feature has a high probability
  of generating a security issue when you misconfigure it and allow external
  access. This is an example that might work sometimes, but would be
  catastrophic with untrusted inputs:

```json
{
  "CGI": {
    "application/x-httpd-php": "php-cgi"
  }
}
```

- **index**: Array of strings for files to search for if a directory is requested.
- **logLevel**: The sum of the number of `-v` options (+1 each) an `-q` options
  (-1 each).  -3: fatal, -2: error, -1: warn, 0: info, 1: debug, 2: trace.
- **open**: Specify `""` or `false` to not open a file in the default browser.
- **script**: The opposite of the `--no-script` CLI option.
- **signal**: An abort signal that can be used to shut down the server as
  cleanly as possible.

## API

Full [API documentation](http://hildjj.github.io/hostlocal/) is available.

Example:

```js
import {hostLocal} from 'hostlocal';

const server = await hostLocal({port: 8111});
const url = await server.start();
```

## Unit testing

For unit testing, you usually want to start up the server, wait for it to
start, then start making connections to it.  In order for those connections to
succeed, you need to trust the CA cert that got generated along the way.  This
currently requires a hack, but see
[Node.js Issue #27079](https://github.com/nodejs/node/issues/27079) for
discussion of the right ways for this to be done in the future.  Here is some
code that works as of Node v24.1.0:

```js
import {hostLocal} from 'hostlocal';

const server = await hostLocal({port: 0});
const url = await server.start();

const origCsC = tls.createSecureContext;
// Use mockMethod if you want to reset this later.
tls.createSecureContext = options => {
  const secureContext = origCsC(options);
  secureContext.context.addCACert(server.caCert);
  return secureContext;
};
```

---
[![Tests](https://github.com/hildjj/hostlocal/actions/workflows/node.js.yml/badge.svg)](https://github.com/hildjj/hostlocal/actions/workflows/node.js.yml)
[![codecov](https://codecov.io/gh/hildjj/hostlocal/graph/badge.svg?token=HHS0QQ7NUF)](https://codecov.io/gh/hildjj/hostlocal)
