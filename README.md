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
                              startup, before listening
  --notAfterDays <number>     How many days is the certificate valid? (default:
                              7)
  -o, --open <path>           Open this path in the default browser.  Relative
                              to server root and prefix, if specified.  If
                              empty (""), do not open anything. (default: ".")
  -p, --port <number>         Port to serve content from.  Use 0 to get an
                              unused port. (default: 8111)
  -P, --prefix <string>       Make all of the URLs served have paths that start
                              with this prefix, followed by a slash.
  -q, --quiet                 Do not do logging
  --rawMarkdown               Do not process markdown into HTML
  -t, --timeout <number>      Time, in ms, to allow exec to run.
  -V, --version               output the version number
```

## Config files

Instead of using the command line, you can store your configuration in a
file, by default called ".hostlocal.js".  This is an ES6 module with a default
export containing your config.  Its default value is:

```js
export default {
  certDir: '.cert',
  config: '.hostlocal.js',
  exec: 'npm run build',
  glob: [],
  host: 'localhost',
  index: ['index.html', 'index.htm', 'README.md'],
  ipv6: false,
  notAfterDays: 7,
  open: '/',
  port: 8111,
  prefix: '',
  quiet: false,
  rawMarkdown: false,
  timeout: null,
};
```

## API

Full [API documentation](http://hildjj.github.io/hostlocal/) is available.

Example:

```js
import {hostLocal} from 'hostlocal';

await hostLocal({port: 8111});
```

---
[![Tests](https://github.com/hildjj/hostlocal/actions/workflows/node.js.yml/badge.svg)](https://github.com/hildjj/hostlocal/actions/workflows/node.js.yml)
[![codecov](https://codecov.io/gh/hildjj/hostlocal/graph/badge.svg?token=HHS0QQ7NUF)](https://codecov.io/gh/hildjj/hostlocal)
