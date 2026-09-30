<a href="https://beyonk.com">
  <img src="https://user-images.githubusercontent.com/218949/144224348-1b3a20d5-d68e-4a7a-b6ac-6946f19f4a86.png" width="198" />
</a>

## Http

[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com) ![publish](https://github.com/beyonk-adventures/http/workflows/publish/badge.svg?branch=master)

Isomorphic fetch library.
<br />
Formerly known as `@beyonk/sapper-httpclient`

## Why

In hybrid applications, there are three different ways of fetching data:

* client
* server
* isomorphic (client + server)
* retries (on various network errors)

This library helps you abstract over where you are fetching data, meaning that your code maintains consistency without having to worry about where your data is being fetched.

The way it does this is by trying to use the first available fetch method, and failing over to alternatives if a  method is not available. The methods it tries are, in the following order:

1. Any fetch library you pass to `create()` (for example, `load`'s `fetch`)
1. window.fetch if the library detects it is running clientside
1. `node-fetch`, or whatever you want to pass in, if nothing else is available (pure server-side)

Generally this means that your usage is the same no matter where you call it, with one exception - using this library in the `load` method requires you to pass in SvelteKit's special `fetch` method, as it is not available outside of the load method. Examples of which are below.

## Usage

### To use within an application:

### Install it

```bash
npm i -D @beyonk/http
```

### Configure it (both server-side and client-side as there are two bundles)

```js
// src/client.js && src/server.js
import Api from '@beyonk/http'

Api.configure({ baseUrl: 'https://example.com/your/api/base' })
```

### Use it on the client:

```js
// src/routes/some-route.html
import { create } from '@beyonk/http'

// in a method (client-side)
const api = create()
const json = await api.endpoint('some/endpoint').get()
console.log(json)

// in load (isomorphic)
const api = create()
const json = await api
  .context({ fetch }) // Pass in the "fetch" parameter from load
  .endpoint('some/endpoint')
  .get()
console.log(json)
```

### Use it on the server:

```js
// src/routes/+page.server.js
import fetch from 'node-fetch' // or SvelteKit's built in fetch
import { create } from '@beyonk/http'

const api = create()
const json = await api
  .context({ fetch }) // pass node fetch in here.
  .endpoint('some/endpoint')
  .get()
console.log(json)
```

### Handling the response

```js
import { create } from '@beyonk/http'

const api = create()
const json = await api
  .endpoint('some/endpoint')
  .get((json, httpStatus) => {
    console.log('json response is', json)
    console.log('http status code is', httpStatus)
  })
```

## Methods

```js
const api = create()
const client = api
  .endpoint('some/endpoint')

console.log(await client.get()) // Get endpoint
console.log(await client.payload({ foo: 'bar' }).put()) // Put with body
console.log(await client.payload({ foo: 'bar' }).post()) // Post with body
console.log(await client.query({ foo: 'bar' }).get()) // Get with query
console.log(await client.del()) // Delete
console.log(await client.headers({ foo: 'bar' }).put()) // Put with headers
```

#### client.query

The `query` method accepts an object of params as either a String or Array of Strings.
If any property passed into the query is `undefined` it will be ignored. 

```js
const api = create()
const client = api
  .endpoint('some/endpoint')

console.log(await client.query({ foo: 'bar' }).get()) // will make a GET request to 'some/endpoint?foo=bar'
console.log(await client.query({ foo: 'bar', baz: 'qux' }).get()) // will make a GET request to 'some/endpoint?foo=bar&baz=qux
console.log(await client.query({ foo: ['bar', 'qux' ] }).get()) // will make a GET request to 'some/endpoint?foo=bar&foo=qux
console.log(await client.query({ foo: undefined, baz: 'qux' }).get()) // will make a GET request to 'some/endpoint?baz=qux

```

## Using built in response handling

```js
const api = create()
const profile = await api
  .endpoint('some/endpoint')
  .get(json => {
    return json.profile
  })
console.log(profile)
```

## Catching errors

### Per request

If no local error handler is specified, the fallback handler `default` is called. If this isn't specified, the error is logged to the console.

```js
  await client
    .endpoint('some/url')
    .forbidden(e => {
      console.error('Forbidden', e)
    })
    .gone(e => {
      console.error('Gone', e)
    })
    .notFound(e => {
      console.error('Not found', e)
    })
    .accessDenied(e => {
      console.error('Access denied', e)
    })
    .conflict(e => {
      console.error('Conflict', e)
    })
    .paymentRequired(e => {
      console.error('Payment Required', e)
    })
    .preconditionFailed(e => {
      console.error('Precondition failed', e)
    })
    .badData(e => {
      console.error('Bad data', e)
    })
    .default(e => {
      // Any other error caught here
      console.error('Some error', e)
    })
    .get()
```

#### Handler signature

Handlers have a signature with two items:

```js
.badData((e, ctx) => {
  console.error('Bad data', e)
  throw redirect('/foo/bar')
})
```

Every error carries the request that failed as `e.request` (`{ method, url }`), and HTTP failures also carry `e.status` and the parsed response as `e.body`. Errors thrown by `fetch` itself, such as network failures or aborts, have `e.request` but no `e.status`.

ctx can be whatever you want really - it is whatever you pass in as `context(...)`.

However, if the `context` object you pass in has a `fetch` function, this is used as the `fetch` for XHR requests.

If it has a `logger` with an `error(details, message)` method, such as a pino logger, every failure that reaches a `default` handler (request-level or global) is logged through it before the handler runs, with `err`, `status`, `method`, `url` and `body`. Without one the console is used. Failures caught by a status-specific handler such as `.notFound()` are not logged.

```js
export async function preload () {
  await Api
    .context({ fetch })
    .endpoint('foo/bar')
    ...
}
```

you can also pass in other things to the context:

```js
export async function preload () {
  await Api
    .context({ ...this, baz: 'qux' })
    .endpoint('foo/bar')
    ...
}
```

### At a global level

Request local error handlers override global error handlers, but if a local error handler are not specified, these will be called instead, if it exists.

Names are the same as the local handlers:

```js
  import Api from '@beyonk/http'
  import { redirect } from '@sveltejs/kit'

  Api.configure({
    baseUrl: 'https://example.com/your/api/base',
    handlers: {
      paymentRequired(e => {
        throw redirect(307, '/checkout')
      })
    }
  })

  await client
    .endpoint('some/url')
    .get()
```

A global `default` handler catches anything that no other handler does. A request-level `.default()` takes precedence over it, but global status handlers (such as `notFound`) do not check it.

```js
  Api.configure({
    baseUrl: 'https://example.com/your/api/base',
    handlers: {
      default (e) {
        throw error(500, e.message)
      }
    }
  })
```

## Retries

Retries are on by default (since 13.0.0). Configure them with the `retry` option:

```js
retry: {
  attempts: 1,                          // retries after the first request
  errors: [ 'ECONNRESET' ],             // Node network error codes to retry on
  methods: [ 'GET', 'HEAD', 'OPTIONS' ] // HTTP methods that may be retried
}
```

These are the defaults. Leave `retry` out to use them, pass only the settings you want to change, or pass `false` to never retry:

```js
import Api from '@beyonk/http'

Api.configure({})                                              // defaults: 1 retry on ECONNRESET for GET, HEAD, OPTIONS
Api.configure({ retry: { attempts: 2 } })                      // up to 2 retries, other settings unchanged
Api.configure({ retry: { errors: [ 'ECONNRESET', 'EPIPE' ] } }) // also retry EPIPE
Api.configure({ retry: false })                                // never retry
```

| Setting | Meaning | Default |
| --- | --- | --- |
| `attempts` | Number of retries after the first request. `1` sends at most 2 requests, `0` never retries | `1` |
| `errors` | [Node network error codes](https://nodejs.org/api/errors.html#errors_common_system_errors) to retry on, matched on the error or its `cause` | `[ 'ECONNRESET' ]` |
| `methods` | HTTP methods that may be retried. Only add a method if repeating it is safe for every endpoint | `[ 'GET', 'HEAD', 'OPTIONS' ]` |

Good to know:

- Timeouts and HTTP error responses (4xx, 5xx) aren't retried.
- Retries only apply server-side, as browsers don't expose network error codes.
- Each retry logs a warning, e.g. `Got ECONNRESET when calling https://…/api/v1/apps. Retrying request (1/1)`.

## Parsing error payloads

As of v7.0.0 the library defaults to parsing error payloads as JSON. This means you can use the data returned in your response.

```js
  /** endpoint returns 401 with:
    {
      username: 'Naughty User'
    }
  **/

  await client
    .endpoint('some/url')
    .accessDenied(e => {
      console.error('You are not allowed', e.body.username)
    })
```

To turn this behaviour off, pass the option `parseErrors` with value false:

```js
import Api from '@beyonk/http'

Api.configure({
  parseErrors: false
})
```

## Running Tests

```sh
npm test
```

## Credits

* Original code by [Antony Jones](https://github.com/antony)
