import sinon from 'sinon'
import { expect } from '@hapi/code'
import { Api } from './index.js'

const { stub } = sinon

const baseUrl = 'https://example.com/api/v1'

function createApi (options = {}) {
  return new Api({ baseUrl, ...options })
}

function response ({ status = 200, statusText, body, headers = new Map(), ...overrides } = {}) {
  return { status, statusText, headers, json: stub().resolves(body), ...overrides }
}

function fetchFailed (code) {
  const cause = new Error(`read ${code}`)
  cause.code = code
  return new TypeError('fetch failed', { cause })
}

function errorWithCode (code) {
  const error = new Error(`read ${code}`)
  error.code = code
  return error
}

describe('util/api', () => {
  describe('#get()', () => {
    context('error handling', () => {
      let clientStub

      beforeEach(async () => {
        clientStub = stub()
      })

      it('with unknown status code', async () => {
        let error
        const expectedError = 'hit default handler'

        const api = createApi()

        clientStub.resolves(response({ status: 419, statusText: 'No', body: { error: 'no' } }))

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .default(e => {
            error = expectedError
          })
          .get()

        expect(error).to.equal(expectedError)
      })

      it('has specific error handler', async () => {
        let error
        const expectedError = 'hit local 401 handler'

        const api = createApi()

        clientStub.resolves(response({ status: 401, statusText: 'No', body: { error: 'no' } }))

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .accessDenied(() => {
            error = expectedError
          })
          .get()

        expect(error).to.equal(expectedError)
      })

      it('has global error handler', async () => {
        let error
        const expectedError = 'hit global 401 handler'

        const api = createApi({
          handlers: {
            accessDenied: () => {
              error = expectedError
            }
          }
        })

        clientStub.resolves(response({ status: 401, statusText: 'No', body: { error: 'no' } }))

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get()

        expect(error).to.equal(expectedError)
      })

      it('prefers local error handler to global error handler', async () => {
        let globalCalled = false
        let localCalled = false

        const api = createApi({
          handlers: {
            accessDenied: () => {
              globalCalled = true
            }
          }
        })

        clientStub.resolves(response({ status: 401, statusText: 'No', body: { error: 'no' } }))

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .accessDenied(() => {
            localCalled = true
          })
          .get()

        expect(globalCalled).to.be.false()
        expect(localCalled).to.be.true()
      })

      it('prefers global error handler to default error handler', async () => {
        let globalCalled = false
        let defaultCalled = false

        const api = createApi({
          handlers: {
            accessDenied: () => {
              globalCalled = true
            }
          }
        })

        clientStub.resolves(response({ status: 401, statusText: 'No', body: { error: 'no' } }))

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .default(() => {
            defaultCalled = true
          })
          .get()

        expect(globalCalled).to.be.true()
        expect(defaultCalled).to.be.false()
      })

      it('falls back to global default handler', async () => {
        let received

        const api = createApi({
          handlers: {
            default: (e) => {
              received = e
              return 'fallback'
            }
          }
        })

        clientStub.resolves(response({ status: 404, statusText: 'No', body: { error: 'no' } }))

        const result = await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get()

        expect(result).to.equal('fallback')
        expect(received.body).to.equal({ error: 'no' })
      })

      it('prefers request default handler to global default handler', async () => {
        let globalCalled = false

        const api = createApi({
          handlers: {
            default: () => {
              globalCalled = true
            }
          }
        })

        clientStub.resolves(response({ status: 404, statusText: 'No', body: { error: 'no' } }))

        const result = await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .default(() => 'local')
          .get()

        expect(result).to.equal('local')
        expect(globalCalled).to.be.false()
      })

      it('attaches the status and request to http errors', async () => {
        let received

        const api = createApi()

        clientStub.resolves(response({ status: 404, statusText: 'No', body: { error: 'no' } }))

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .query({ page: 2 })
          .default(e => {
            received = e
          })
          .get()

        expect(received.status).to.equal(404)
        expect(received.body).to.equal({ error: 'no' })
        expect(received.request).to.equal({ method: 'GET', url: 'https://example.com/api/v1/some/url?page=2' })
      })

      it('attaches the request to errors thrown by fetch', async () => {
        let received

        const api = createApi()

        clientStub.rejects(new TypeError('fetch failed'))

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .payload({ a: 1 })
          .default(e => {
            received = e
          })
          .post()

        expect(received.message).to.equal('fetch failed')
        expect(received.status).to.be.undefined()
        expect(received.request).to.equal({ method: 'POST', url: 'https://example.com/api/v1/some/url' })
      })

      it('logs through the context logger before the default handler runs', async () => {
        const calls = []
        const logger = { error: (details, message) => calls.push(['log', details, message]) }

        const api = createApi()

        clientStub.resolves(response({ status: 404, statusText: 'No', body: { error: 'no' } }))

        await api
          .context({ fetch: clientStub, logger })
          .endpoint('some/url')
          .default(() => calls.push(['handler']))
          .get()

        expect(calls.map(c => c[0])).to.equal([ 'log', 'handler' ])
        const [ , details, message ] = calls[0]
        expect(details.status).to.equal(404)
        expect(details.method).to.equal('GET')
        expect(details.url).to.equal('https://example.com/api/v1/some/url')
        expect(details.body).to.equal({ error: 'no' })
        expect(details.err).to.be.an.error()
        expect(message).to.equal('GET https://example.com/api/v1/some/url failed with 404')
      })

      it('logs to the console when the context has no logger', async () => {
        const consoleError = stub(console, 'error')

        const api = createApi({
          handlers: { default: () => 'handled' }
        })

        clientStub.rejects(new TypeError('fetch failed'))

        try {
          await api.context({ fetch: clientStub }).endpoint('some/url').get()
          expect(consoleError.calledOnce).to.be.true()
          expect(consoleError.firstCall.args[1]).to.equal('GET https://example.com/api/v1/some/url failed (fetch failed)')
        } finally {
          consoleError.restore()
        }
      })

      it('does not log when a status-specific handler handles the error', async () => {
        let logged = false

        const api = createApi()

        clientStub.resolves(response({ status: 404, statusText: 'No', body: { error: 'no' } }))

        await api
          .context({ fetch: clientStub, logger: { error: () => { logged = true } } })
          .endpoint('some/url')
          .notFound(() => null)
          .get()

        expect(logged).to.be.false()
      })
    })

    context('responds ok', () => {
      let api
      let clientStub

      beforeEach(async () => {
        clientStub = stub()
        api = createApi()
      })

      it('fetches data from url and passes it to a function', async () => {
        clientStub.resolves(response({ body: { foo: 'bar' } }))
        expect(
          await api
            .context({ fetch: clientStub })
            .endpoint('some/url')
            .get(({ foo }) => foo)
        ).to.equal('bar')
      })

      it('fetches data from url and passes it to an async function', async () => {
        clientStub.resolves(response({ body: { foo: 'bar' } }))
        expect(
          await api
            .context({ fetch: clientStub })
            .endpoint('some/url')
            .get(async ({ foo }) => {
              await foo
              return foo
            })
        ).to.equal('bar')
      })

      it('fetches data from url and returns it', async () => {
        clientStub.resolves(response({ body: { foo: 'bar' } }))
        expect(
          await api
            .context({ fetch: clientStub })
            .endpoint('some/url')
            .get()
        ).to.equal({ foo: 'bar' })
      })

      it('appends baseUrl if endpoint is relative', async () => {
        clientStub.resolves(response())
        await api.context({ fetch: clientStub }).endpoint('some/url').get()
        expect(clientStub.firstCall.args[0]).to.equal('https://example.com/api/v1/some/url')
      })

      it('fetches data from url with query params', async () => {
        clientStub.resolves(response())
        await api.context({ fetch: clientStub }).endpoint('some/url').query({ foo: 'bar', baz: 'qux' }).get()
        expect(clientStub.firstCall.args[0]).to.endWith('/some/url?foo=bar&baz=qux')
      })

      it('fetches data from url with query params multiple', async () => {
        clientStub.resolves(response())
        await api.context({ fetch: clientStub }).endpoint('some/url').query({ foo: [ 'bar', 'qux' ] }).get()
        expect(clientStub.firstCall.args[0]).to.endWith('/some/url?foo=bar&foo=qux')
      })

      it('fetches data from url ignoring undefined query params', async () => {
        clientStub.resolves(response())
        await api.context({ fetch: clientStub }).endpoint('some/url').query({ foo: 'bar', baz: undefined }).get()
        expect(clientStub.firstCall.args[0]).to.endWith('/some/url?foo=bar')
      })

      it('passes status code as second parameter', async () => {
        const httpStatusCode = 202

        clientStub.resolves(response({ status: httpStatusCode, statusText: 'Accepted', body: { foo: 'bar' } }))

        const code = await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get((json, statusCode) => {
            return statusCode
          })

        expect(code).to.equal(httpStatusCode)
      })

      it('passes the whole response as third parameter', async () => {
        const stubbedResponse = response({ status: 202, statusText: 'Accepted', body: { foo: 'bar' }, headers: new Map([ [ 'john', 'doe' ] ]) })
        clientStub.resolves(stubbedResponse)

        const received = await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get((json, statusCode, fullResponse) => {
            return fullResponse
          })

        expect(received.headers).to.equal(stubbedResponse.headers)
      })

      it('parses 3xx as successful', async () => {
        const httpStatusCode = 304

        clientStub.resolves(response({ status: httpStatusCode, statusText: 'Not Modified', body: { foo: 'bar' } }))

        const code = await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get((json, statusCode) => {
            return statusCode
          })

        expect(code).to.equal(httpStatusCode)
      })

      it('does not parse on 204 (no content)', async () => {
        const httpStatusCode = 204
        const jsonFunction = stub()

        clientStub.resolves(response({ status: httpStatusCode, statusText: 'No Content', json: jsonFunction }))

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get((json, statusCode) => {
            return statusCode
          })

        expect(jsonFunction.callCount).to.equal(0)
      })

      it('does not parse on empty body', async () => {
        const httpStatusCode = 200
        const jsonFunction = stub()

        const headers = new Map()
        headers.set('content-length', '0')

        clientStub.resolves(response({ status: httpStatusCode, statusText: 'OK', headers, json: jsonFunction }))

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get((json, statusCode) => {
            return statusCode
          })

        expect(jsonFunction.callCount).to.equal(0)
      })

      it('passes the status text to a status-specific handler', async () => {
        let error
        const expectedErrorMessage = 'no'

        clientStub.resolves(response({ status: 401, statusText: expectedErrorMessage, body: { foo: 'bar' }, text: stub().resolves('foo') }))

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .accessDenied(e => {
            error = e.message
          })
          .get()

        expect(error).to.equal(expectedErrorMessage)
      })
    })

    context('parses error bodies', () => {
      let api
      let clientStub

      const jsonPayload = {
        foo: 'bar'
      }

      beforeEach(async () => {
        clientStub = stub()
        api = createApi({
          parseErrors: true
        })
      })

      it('passes the parsed body to a status-specific handler', async () => {
        let payload
        const expectedErrorMessage = 'no'

        clientStub.resolves(response({ status: 401, statusText: expectedErrorMessage, body: jsonPayload }))

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .accessDenied(e => {
            payload = e.body
          })
          .get()

        expect(payload).to.equal(jsonPayload)
      })
    })

    context('retries', function () {
      beforeEach(function () {
        this.warn = stub(console, 'warn')
        this.clientStub = stub()
        this.clientStub.onFirstCall().rejects(fetchFailed('ECONNRESET'))
        this.clientStub.onSecondCall().resolves(response({ body: { foo: 'bar' } }))
      })

      afterEach(function () {
        this.warn.restore()
      })

      context('GET with the default retry settings', function () {
        beforeEach(async function () {
          const api = createApi()

          this.res = await api
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .get(({ foo }) => foo)
        })

        it('retries a reset connection once', function () {
          expect(this.clientStub.callCount).to.equal(2)
        })

        it('returns value', function () {
          expect(this.res).to.equal('bar')
        })

        it('logs a warning for the retry', function () {
          expect(this.warn.firstCall.args[0]).to.equal('Got ECONNRESET when calling https://example.com/api/v1/some/url. Retrying request (1/1)')
        })
      })

      context('GET with retry turned off', function () {
        beforeEach(async function () {
          const api = createApi({ retry: false })

          await api
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .default(() => {})
            .get()
        })

        it('does not retry', function () {
          expect(this.clientStub.callCount).to.equal(1)
        })
      })

      context('GET reset every time with one retry', function () {
        beforeEach(async function () {
          this.clientStub.onSecondCall().rejects(fetchFailed('ECONNRESET'))
          this.successHandler = stub()

          const api = createApi({ retry: { attempts: 1 } })

          this.result = await api
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .default((e) => {
              this.error = e
              return 'default handler ran'
            })
            .get(this.successHandler)
        })

        it('retries once then gives up', function () {
          expect(this.clientStub.callCount).to.equal(2)
        })

        it('runs the default handler', function () {
          expect(this.result).to.equal('default handler ran')
        })

        it('does not call the success handler', function () {
          expect(this.successHandler.callCount).to.equal(0)
        })

        it('attaches the request to the error', function () {
          expect(this.error.request).to.equal({ method: 'GET', url: 'https://example.com/api/v1/some/url' })
        })
      })

      context('GET reset every time with three retries', function () {
        beforeEach(async function () {
          this.clientStub.onSecondCall().rejects(fetchFailed('ECONNRESET'))
          this.clientStub.onThirdCall().rejects(fetchFailed('ECONNRESET'))
          this.clientStub.onCall(3).rejects(fetchFailed('ECONNRESET'))
          this.clientStub.onCall(4).resolves(response({ body: { foo: 'bar' } }))

          await createApi({ retry: { attempts: 3 } })
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .default(() => {})
            .get()
        })

        it('stops after three retries', function () {
          expect(this.clientStub.callCount).to.equal(4)
        })
      })

      context('GET with no retries allowed', function () {
        beforeEach(async function () {
          await createApi({ retry: { attempts: 0 } })
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .default(() => {})
            .get()
        })

        it('does not retry', function () {
          expect(this.clientStub.callCount).to.equal(1)
        })
      })

      context('GET that gets an HTTP error response', function () {
        beforeEach(async function () {
          this.clientStub.onFirstCall().resolves(response({ status: 503, statusText: 'Unavailable' }))

          await createApi()
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .default(() => {})
            .get()
        })

        it('does not retry', function () {
          expect(this.clientStub.callCount).to.equal(1)
        })
      })

      for (const method of [ 'put', 'patch', 'del' ]) {
        context(`${method.toUpperCase()} with the default retry settings`, function () {
          beforeEach(async function () {
            await createApi()
              .context({ fetch: this.clientStub })
              .endpoint('some/url')
              .default(() => {})[method]()
          })

          it('does not retry', function () {
            expect(this.clientStub.callCount).to.equal(1)
          })
        })
      }

      context('PUT with only methods configured', function () {
        beforeEach(async function () {
          await createApi({ retry: { methods: [ 'PUT' ] } })
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .put()
        })

        it('retries using the default error codes and attempts', function () {
          expect(this.clientStub.callCount).to.equal(2)
        })
      })

      context('GET reset twice with two retries', function () {
        beforeEach(async function () {
          this.clientStub.onSecondCall().rejects(fetchFailed('ECONNRESET'))
          this.clientStub.onThirdCall().resolves(response({ body: { foo: 'bar' } }))

          this.res = await createApi({ retry: { attempts: 2 } })
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .get(({ foo }) => foo)
        })

        it('retries twice', function () {
          expect(this.clientStub.callCount).to.equal(3)
        })

        it('returns value', function () {
          expect(this.res).to.equal('bar')
        })
      })

      context('GET with the code on the error itself', function () {
        beforeEach(async function () {
          this.clientStub.onFirstCall().rejects(errorWithCode('ECONNRESET'))

          this.res = await createApi()
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .get(({ foo }) => foo)
        })

        it('retries', function () {
          expect(this.clientStub.callCount).to.equal(2)
        })

        it('returns value', function () {
          expect(this.res).to.equal('bar')
        })
      })

      context('GET with custom retry settings', function () {
        beforeEach(async function () {
          const api = createApi({
            retry: { errors: [ 'ECONNRESET' ], attempts: 3 }
          })

          this.res = await api
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .get(({ foo }) => foo)
        })

        it('retries using the code on the error cause', function () {
          expect(this.clientStub.callCount).to.equal(2)
        })

        it('returns value', function () {
          expect(this.res).to.equal('bar')
        })
      })

      context('POST', function () {
        beforeEach(async function () {
          const api = createApi({
            retry: { errors: [ 'ECONNRESET' ], attempts: 3 }
          })

          await api
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .default(() => {})
            .post()
        })

        it('does not retry', function () {
          expect(this.clientStub.callCount).to.equal(1)
        })
      })

      context('GET with an error code that is not listed', function () {
        beforeEach(async function () {
          this.clientStub.onFirstCall().rejects(fetchFailed('ETIMEDOUT'))

          const api = createApi({
            retry: { errors: [ 'ECONNRESET' ], attempts: 3 }
          })

          await api
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .default(() => {})
            .get()
        })

        it('does not retry', function () {
          expect(this.clientStub.callCount).to.equal(1)
        })
      })

      context('POST with methods configured', function () {
        beforeEach(async function () {
          const api = createApi({
            retry: { errors: [ 'ECONNRESET' ], attempts: 3, methods: [ 'POST' ] }
          })

          await api
            .context({ fetch: this.clientStub })
            .endpoint('some/url')
            .post()
        })

        it('retries', function () {
          expect(this.clientStub.callCount).to.equal(2)
        })
      })
    })

    context('error thrown in success handler is not caught', () => {
      const clientStub = stub()
      const defaultErrorHandler = stub()

      clientStub.resolves(response())

      const ctx = { fetch: clientStub, foo: 'bar' }

      class CustomError extends Error {}

      let api
      let error

      beforeEach(async () => {
        api = createApi()

        error = await expect(
          api
            .context(ctx)
            .endpoint('some/url')
            .default(defaultErrorHandler)
            .get(() => {
              throw new CustomError()
            })
        ).to.reject()
      })

      it('throws success handler error externally', () => {
        expect(error).to.be.an.instanceOf(CustomError)
      })

      it('does not call default error handler', () => {
        expect(defaultErrorHandler.callCount).to.equal(0)
      })
    })

    context('resets the request after it completes', () => {
      let api
      let clientStub

      const ctx = { foo: 'bar' }

      beforeEach(async () => {
        clientStub = stub()
        clientStub.resolves(response({ body: { foo: 'bar' } }))

        api = createApi()

        await api
          .context({ fetch: clientStub, foo: 'bar' })
          .endpoint('some/url')
          .get(({ foo }) => foo)
      })

      it('has cleared endpoint', () => {
        expect(api.config.endpoint).to.equal(null)
      })

      it('has reset method to GET', () => {
        expect(api.config.method).to.equal('GET')
      })

      it('has not cleared client', () => {
        expect(api.client).to.equal(clientStub)
      })

      it('has not cleared context', () => {
        expect(api.ctx.foo).to.equal(ctx.foo)
      })

      it('has cleared query', () => {
        expect(api.config.query).to.equal(null)
      })

      it('has cleared payload', () => {
        expect(api.config.payload).to.equal(null)
      })

      it('has cleared overrides', () => {
        expect(api.config.overrides).to.equal({})
      })
    })

    context('context', () => {
      context('sets context with client', () => {
        let api
        const clientStub = 'bar'

        const ctx = { fetch: clientStub, foo: 'bar' }

        beforeEach(async () => {
          api = createApi()

          await api
            .context(ctx)
            .endpoint('some/url')
        })

        it('has set context', () => {
          expect(api.ctx).to.equal(ctx)
        })

        it('has set client', () => {
          expect(api.client).to.equal(ctx.fetch)
        })
      })

      context('sets context without client', () => {
        let api

        const ctx = { foo: 'bar' }

        beforeEach(async () => {
          api = createApi()

          await api
            .context(ctx)
            .endpoint('some/url')
        })

        it('has set context', () => {
          expect(api.ctx).to.equal(ctx)
        })

        it('has not set client', () => {
          expect(api.client).to.be.null()
        })
      })

      context('passes context to error handlers', () => {
        let api
        const clientStub = stub()
        let passed

        clientStub.resolves(response({ status: 406, statusText: 'No', body: { error: 'no' } }))

        const ctx = { fetch: clientStub, foo: 'bar' }

        beforeEach(async () => {
          api = createApi()

          await api
            .context(ctx)
            .endpoint('some/url')
            .notAcceptable((e, ctx) => {
              passed = ctx
            })
            .get()
        })

        it('has passed context to handler', () => {
          expect(passed.foo).to.equal(ctx.foo)
        })
      })
    })
  })

  describe('#post()', () => {
    let api
    let clientStub

    beforeEach(async () => {
      clientStub = stub()
      api = createApi()
    })

    it('posts data to url', async () => {
      clientStub.resolves(response({ status: 201 }))

      const content = { foo: 'bar' }
      await api
        .context({ fetch: clientStub })
        .endpoint('some/url')
        .payload(content)
        .post()

      expect(clientStub.firstCall.args[1]).to.include({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(content)
      })
    })

    it('sets an authorization header', async () => {
      clientStub.resolves(response({ status: 201 }))

      const content = { foo: 'bar' }
      await api
        .context({ fetch: clientStub })
        .endpoint('some/url')
        .headers({
          Authorization: 'Bearer xxx'
        })
        .payload(content)
        .post()

      expect(clientStub.firstCall.args[1]).to.include({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer xxx'
        },
        body: JSON.stringify(content)
      })
    })
  })

  describe('#patch()', () => {
    let api
    let clientStub

    beforeEach(async () => {
      clientStub = stub()
      api = createApi()
    })

    it('sends data to url', async () => {
      clientStub.resolves(response())

      const content = { foo: 'bar' }
      await api
        .context({ fetch: clientStub })
        .endpoint('some/url')
        .payload(content)
        .patch()

      expect(clientStub.firstCall.args[1]).to.include({
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(content)
      })
    })

    it('sets an authorization header', async () => {
      clientStub.resolves(response({ status: 201 }))

      const content = { foo: 'bar' }
      await api
        .context({ fetch: clientStub })
        .endpoint('some/url')
        .headers({
          Authorization: 'Bearer xxx'
        })
        .payload(content)
        .patch()

      expect(clientStub.firstCall.args[1]).to.include({
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer xxx'
        },
        body: JSON.stringify(content)
      })
    })
  })

  describe('#put()', () => {
    let api
    let clientStub

    beforeEach(async () => {
      clientStub = stub()
      api = createApi()
    })

    it('sends data to url', async () => {
      clientStub.resolves(response())

      const content = { foo: 'bar' }
      await api.context({ fetch: clientStub }).endpoint('some/url').payload(content).put()
      expect(clientStub.firstCall.args[1]).to.include({
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(content)
      })
    })

    it('endpoint returns no data', async () => {
      clientStub.resolves(response({ json: stub().rejects('Error') }))
      expect(
        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .put(() => true)
      ).to.be.true()
    })

    it('sets an authorization header', async () => {
      clientStub.resolves(response({ body: { foo: 'bar' } }))

      const content = { foo: 'bar' }
      await api
        .context({ fetch: clientStub })
        .endpoint('some/url')
        .headers({
          Authorization: 'Bearer xxx'
        })
        .payload(content)
        .put()

      expect(clientStub.firstCall.args[1]).to.include({
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer xxx'
        },
        body: JSON.stringify(content)
      })
    })
  })

  describe('#del()', () => {
    let api
    let clientStub

    beforeEach(async () => {
      clientStub = stub()
      api = createApi()
    })

    it('calls url with query params', async () => {
      clientStub.resolves(response({ body: {} }))
      await api.context({ fetch: clientStub }).endpoint('some/url').query({ foo: 'bar', baz: 'qux' }).del()
      expect(clientStub.firstCall.args[0]).to.endWith('/some/url?foo=bar&baz=qux')
    })

    it('calls url ignoring undefined query params', async () => {
      clientStub.resolves(response({ body: {} }))
      await api.context({ fetch: clientStub }).endpoint('some/url').query({ foo: undefined, baz: 'qux' }).del()
      expect(clientStub.firstCall.args[0]).to.endWith('/some/url?baz=qux')
    })

    it('calls url with delete method', async () => {
      clientStub.resolves(response({ body: {} }))
      await api.context({ fetch: clientStub }).endpoint('some/url').del()
      expect(clientStub.firstCall.args[1].method).equals('DELETE')
    })
  })
})
