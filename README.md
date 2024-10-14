# hostlocal

Serve files from a directory over HTTP/1.1 and HTTP/2, with live reload
notifications over a websocket.  It will automatically create self-signed
certificates.

This server is quite opinionated about its defaults to make setup as easy
as possible... if you have a problem shaped like mine.

## Run

```sh
# Serve the docs directory, and open index.html in your default browser.
npx hostlocal docs
```

## CLI

```text
Usage: hostlocal [options] [directory]

Arguments:
  directory                   Directory to serve (default: cwd)

Options:
  -V, --version               output the version number
  -c, --config <file>         If the given file exists, import it as a module
                              and use its default export as the options.  Name
                              is relative to cwd. Command line parameters
                              overwrite options from the config file. (default:
                              ".hostlocal.js")
  --certDir <directory>       Directory, relative to cwd, to cache cert info.
                              (default: ".cert")
  -g, --glob <pattern>        Set of files to watch.  If one of these changes,
                              execute the command in the --exec option
  -e, --exec <shell command>  Execute this command when the glob changes.
                              (default: "npm run build")
  --notAfterDays <number>     How many days is the certificate valid? (default:
                              7)
  -o, --open <path>           Open this path in the default browser.  Relative
                              to server root.  If empty, do not open anything.
                              (default: "/")
  -p, --port <number>         Port to serve content from. (default: 8111)
  -q, --quiet                 Do not do logging
  -h, --help                  display help for command
```

## Config files

Instead of using the command line, you can store your configuration in a
file, by default called ".hostlocal.js".  This is an ES6 module with a default
export containing your config.  Its default value is:

```js
export default {
  certDir: '.cert',
  exec: 'npm run build',
  glob: null,
  index: ['index.html', 'index.htm', 'README.md'],
  notAfterDays: 7,
  open: '/',
  port: 8111,
  quiet: false,
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
