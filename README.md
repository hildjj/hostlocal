# hostlocal

Serve files from a directory.

## Run

```sh
# Serve the docs directory, and open index.html in your default browser.
npx hostlocal docs
```

## CLI

```txt
Usage: hostlocal [options] [directory]

Arguments:
  directory                Directory to serve (default: cwd)

Options:
  -V, --version            output the version number
  --certDir <directory>    Directory, relative to cwd, to cache cert info
                           (default: ".cert")
  --notAfterDays <number>  How many days is the certificate valid? (default: 7)
  -o, --open <path>        Open this path in the default browser.  Relative to
                           server root.  If empty, do not open anything.
                           (default: "/")
  -p, --port <number>      Port to serve content from. (default: 8111)
  -q, --quiet              Do not do logging
  -h, --help               display help for command
```

## API

Full [API documentation](http://hildjj.github.io/hostlocal/) is available.

Example:

```js
import {hostLocal} from 'hostlocal';

await hostLocal({port: 8111});
```

---
[![Build Status](https://github.com/hildjj/hostlocal/workflows/Tests/badge.svg)](https://github.com/hildjj/hostlocal/actions?query=workflow%3ATests)
[![codecov](https://codecov.io/gh/hildjj/hostlocal/branch/main/graph/badge.svg?token=N7B7YLIDM4)](https://codecov.io/gh/hildjj/hostlocal)
