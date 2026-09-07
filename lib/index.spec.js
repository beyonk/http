import sinon from 'sinon'
import { expect } from '@hapi/code'
import { Api } from './index.js'

const { stub } = sinon

describe('util/api', () => {
  describe('#get()', () => {
    context('error handling', () => {
      let clientStub

      beforeEach(async () => {
        global.FormData = Map
        clientStub = stub()
      })

      it('with unknown status code', async () => {
        let error
        const expectedError = 'hit default handler'

        const api = new Api({
          baseUrl: 'https://example.com/api/v1'
        })

        clientStub.resolves({
          ok: false,
          statusText: 'No',
          json: stub().resolves({ error: 'no' }),
          status: 419,
          headers: new Map()
        })

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

        const api = new Api({
          baseUrl: 'https://example.com/api/v1'
        })

        clientStub.resolves({
          ok: false,
          statusText: 'No',
          json: stub().resolves({ error: 'no' }),
          status: 401,
          headers: new Map()
        })

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

        const api = new Api({
          baseUrl: 'https://example.com/api/v1',
          handlers: {
            accessDenied: () => {
              error = expectedError
            }
          }
        })

        clientStub.resolves({
          ok: false,
          statusText: 'No',
          json: stub().resolves({ error: 'no' }),
          status: 401,
          headers: new Map()
        })

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get()

        expect(error).to.equal(expectedError)
      })

      it('prefers local error handler to global error handler', async () => {
        let globalCalled = false
        let localCalled = false

        const api = new Api({
          baseUrl: 'https://example.com/api/v1',
          handlers: {
            accessDenied: () => {
              globalCalled = true
            }
          }
        })

        clientStub.resolves({
          ok: false,
          statusText: 'No',
          json: stub().resolves({ error: 'no' }),
          status: 401,
          headers: new Map()
        })

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

        const api = new Api({
          baseUrl: 'https://example.com/api/v1',
          handlers: {
            accessDenied: () => {
              globalCalled = true
            }
          }
        })

        clientStub.resolves({
          ok: false,
          statusText: 'No',
          json: stub().resolves({ error: 'no' }),
          status: 401,
          headers: new Map()
        })

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

        const api = new Api({
          baseUrl: 'https://example.com/api/v1',
          handlers: {
            default: (e) => {
              received = e
              return 'fallback'
            }
          }
        })

        clientStub.resolves({
          ok: false,
          statusText: 'No',
          json: stub().resolves({ error: 'no' }),
          status: 404,
          headers: new Map()
        })

        const result = await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get()

        expect(result).to.equal('fallback')
        expect(received.body).to.equal({ error: 'no' })
      })

      it('prefers request default handler to global default handler', async () => {
        let globalCalled = false

        const api = new Api({
          baseUrl: 'https://example.com/api/v1',
          handlers: {
            default: () => {
              globalCalled = true
            }
          }
        })

        clientStub.resolves({
          ok: false,
          statusText: 'No',
          json: stub().resolves({ error: 'no' }),
          status: 404,
          headers: new Map()
        })

        const result = await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .default(() => 'local')
          .get()

        expect(result).to.equal('local')
        expect(globalCalled).to.be.false()
      })
    })

    context('responds ok', () => {
      let api
      let clientStub

      beforeEach(async () => {
        global.FormData = Map
        clientStub = stub()
        api = new Api({
          baseUrl: 'https://example.com/api/v1'
        })
      })

      it('fetches data from url and passes it to a function', async () => {
        clientStub.resolves({
          status: 200,
          json: stub().resolves({ foo: 'bar' }),
          headers: new Map()
        })
        expect(
          await api
            .context({ fetch: clientStub })
            .endpoint('some/url')
            .get(({ foo }) => foo)
        ).to.equal('bar')
      })

      it('fetches data from url and passes it to an async function', async () => {
        clientStub.resolves({
          status: 200,
          json: stub().resolves({ foo: 'bar' }),
          headers: new Map()
        })
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
        clientStub.resolves({
          status: 200,
          json: stub().resolves({ foo: 'bar' }),
          headers: new Map()
        })
        expect(
          await api
            .context({ fetch: clientStub })
            .endpoint('some/url')
            .get()
        ).to.equal({ foo: 'bar' })
      })

      it('appends baseUrl if endpoint is relative', async () => {
        clientStub.resolves({
          status: 200,
          json: stub(),
          headers: new Map()
        })
        await api.context({ fetch: clientStub }).endpoint('some/url').get()
        expect(clientStub.firstCall.args[0]).to.equal('https://example.com/api/v1/some/url')
      })

      it('fetches data from url with query params', async () => {
        clientStub.resolves({
          status: 200,
          json: stub(),
          headers: new Map()
        })
        await api.context({ fetch: clientStub }).endpoint('some/url').query({ foo: 'bar', baz: 'qux' }).get()
        expect(clientStub.firstCall.args[0]).to.endWith('/some/url?foo=bar&baz=qux')
      })

      it('fetches data from url with query params multiple', async () => {
        clientStub.resolves({
          status: 200,
          json: stub(),
          headers: new Map()
        })
        await api.context({ fetch: clientStub }).endpoint('some/url').query({ foo: [ 'bar', 'qux' ] }).get()
        expect(clientStub.firstCall.args[0]).to.endWith('/some/url?foo=bar&foo=qux')
      })

      it('fetches data from url ignoring undefined query params', async () => {
        clientStub.resolves({
          status: 200,
          json: stub(),
          headers: new Map()
        })
        await api.context({ fetch: clientStub }).endpoint('some/url').query({ foo: 'bar', baz: undefined }).get()
        expect(clientStub.firstCall.args[0]).to.endWith('/some/url?foo=bar')
      })

      it('passes status code as second parameter', async () => {
        const httpStatusCode = 202

        clientStub.resolves({
          status: httpStatusCode,
          json: stub().resolves({ foo: 'bar' }),
          statusText: 'Accepted',
          headers: new Map()
        })

        const code = await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get((json, statusCode) => {
            return statusCode
          })

        expect(code).to.equal(httpStatusCode)
      })

      it('passes the whole response as third parameter', async () => {

        const stubbedResponse = {
          status: 202,
          json: stub().resolves({ foo: 'bar' }),
          statusText: 'Accepted',
          headers: new Map([ ['john', 'doe'] ])
        }
        clientStub.resolves(stubbedResponse)

        const response = await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get((json, statusCode, response) => {
            return response
          })

        expect(response.headers).to.equal(stubbedResponse.headers)
      })

      it('parses 3xx as successful', async () => {
        const httpStatusCode = 304

        clientStub.resolves({
          json: stub().resolves({ foo: 'bar' }),
          statusText: 'Not Modified',
          status: httpStatusCode,
          headers: new Map()
        })

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

        clientStub.resolves({
          json: jsonFunction,
          statusText: 'No Content',
          status: httpStatusCode,
          headers: new Map()
        })

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

        clientStub.resolves({
          json: jsonFunction,
          headers,
          statusText: 'OK',
          status: httpStatusCode
        })

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .get((json, statusCode) => {
            return statusCode
          })

        expect(jsonFunction.callCount).to.equal(0)
      })

      it('with known status code', async () => {
        let error
        const expectedErrorMessage = 'no'

        clientStub.resolves({
          text: stub().resolves('foo'),
          json: stub().resolves({ foo: 'bar' }),
          statusText: expectedErrorMessage,
          status: 401,
          headers: new Map()
        })

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

    context('parses errors', () => {
      let api
      let clientStub

      const jsonPayload = {
        foo: 'bar'
      }

      beforeEach(async () => {
        global.FormData = Map
        clientStub = stub()
        api = new Api({
          baseUrl: 'https://example.com/api/v1',
          parseErrors: true
        })
      })

      it('with known status code', async () => {
        let payload
        const expectedErrorMessage = 'no'

        clientStub.resolves({
          ok: false,
          json: stub().resolves(jsonPayload),
          statusText: expectedErrorMessage,
          status: 401,
          headers: new Map()
        })

        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .accessDenied(e => {
            payload = e.body
          })
          .get()

        expect(payload).to.equal(payload)
      })
    })

    context('retries', () => {
      context('succeeds on third try', () => {
        let api
        let clientStub
        let res

        class MySystemError extends Error {
          constructor () {
            super()
            this.code = 'ECONNRESET'
          }
        }

        beforeEach(async () => {
          global.FormData = Map
          clientStub = stub()
          clientStub.onFirstCall().rejects(new MySystemError())
          clientStub.onSecondCall().rejects(new MySystemError())
          clientStub.onThirdCall().resolves({
            status: 200,
            json: stub().resolves({ foo: 'bar' }),
            headers: new Map()
          })

          api = new Api({
            baseUrl: 'https://example.com/api/v1',
            retry: {
              errors: [ 'ECONNRESET' ],
              attempts: 3
            }
          })

          res = await api
            .context({ fetch: clientStub })
            .endpoint('some/url')
            .get(({ foo }) => foo)
        })

        afterEach(() => {
          clientStub.reset()
        })

        it('retries three times', () => {
          expect(
            clientStub.callCount
          ).to.equal(3)
        })

        it('returns value', () => {
          expect(
            res
          ).to.equal('bar')
        })
      })

      context('never succeeds', () => {
        let api
        let clientStub
        let successStub
        let error

        class MySystemError extends Error {
          constructor () {
            super()
            this.code = 'ECONNRESET'
          }
        }

        beforeEach(async () => {
          global.FormData = Map
          clientStub = stub()
          clientStub.onFirstCall().rejects(new MySystemError())
          clientStub.onSecondCall().rejects(new MySystemError())

          successStub = stub()

          api = new Api({
            baseUrl: 'https://example.com/api/v1',
            retry: {
              errors: [ 'ECONNRESET' ],
              attempts: 2
            }
          })

          await api
            .context({ fetch: clientStub })
            .endpoint('some/url')
            .default(e => {
              error = 'stuff happened'
            })
            .get(successStub)
        })

        afterEach(() => {
          clientStub.reset()
          successStub.reset()
        })

        it('retries three times', () => {
          expect(
            clientStub.callCount
          ).to.equal(2)
        })

        it('catches default error', () => {
          expect(error).to.equal('stuff happened')
        })

        it('does not call success method', () => {
          expect(
            successStub.callCount
          ).to.equal(0)
        })
      })

      context('passes context to error handlers', () => {
        const clientStub = stub()
        const defaultErrorHandler = stub()

        clientStub.resolves({
          ok: true,
          status: 200,
          headers: new Map(),
          json: stub().resolves()
        })

        const ctx = { fetch: clientStub, foo: 'bar' }

        class CustomError extends Error {}

        let api
        let error

        beforeEach(async () => {
          api = new Api({
            baseUrl: 'https://example.com/api/v1'
          })

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

      context('error thrown in success handler is not caught', () => {
        let api
        let clientStub

        const ctx = { fetch: clientStub, foo: 'bar' }

        beforeEach(async () => {
          clientStub = stub()
          clientStub.resolves({
            status: 200,
            json: stub().resolves({ foo: 'bar' }),
            headers: new Map()
          })

          api = new Api({
            baseUrl: 'https://example.com/api/v1'
          })

          await api
            .context({ fetch: clientStub, foo: 'bar' })
            .endpoint('some/url')
            .get(({ foo }) => foo)
        })

        it('has cleared endpoint', () => {
          expect(api.config.endpoint).to.equal(null)
        })

        it('has cleared method', () => {
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
    })

    context('context', () => {
      context('sets context with client', () => {
        let api
        const clientStub = 'bar'

        const ctx = { fetch: clientStub, foo: 'bar' }

        beforeEach(async () => {
          api = new Api({
            baseUrl: 'https://example.com/api/v1'
          })

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
          api = new Api({
            baseUrl: 'https://example.com/api/v1'
          })

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

        clientStub.resolves({
          ok: false,
          statusText: 'No',
          json: stub().resolves({ error: 'no' }),
          status: 406,
          headers: new Map()
        })

        const ctx = { fetch: clientStub, foo: 'bar' }

        beforeEach(async () => {
          api = new Api({
            baseUrl: 'https://example.com/api/v1'
          })

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
      api = new Api({
        baseUrl: 'https://example.com/api/v1'
      }, clientStub)
    })

    it('posts data to url', async () => {
      clientStub.resolves({
        status: 201,
        json: stub(),
        headers: new Map()
      })

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
      clientStub.resolves({
        status: 201,
        json: stub(),
        headers: new Map()
      })

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
      api = new Api({
        baseUrl: 'https://example.com/api/v1'
      }, clientStub)
    })

    it('sends data to url', async () => {
      clientStub.resolves({
        status: 200,
        json: stub(),
        headers: new Map()
      })

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
      clientStub.resolves({
        status: 201,
        json: stub(),
        headers: new Map()
      })

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
      api = new Api({
        baseUrl: 'https://example.com/api/v1'
      }, clientStub)
    })

    it('fetches data from url', async () => {
      clientStub.resolves({
        status: 200,
        json: stub(),
        headers: new Map()
      })

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
      clientStub.resolves({
        status: 200,
        json: stub().rejects('Error'),
        headers: new Map()
      })
      expect(
        await api
          .context({ fetch: clientStub })
          .endpoint('some/url')
          .put(() => true)
      ).to.be.true()
    })

    it('sets an authorization header', async () => {
      clientStub.resolves({
        status: 200,
        json: stub().resolves({ foo: 'bar' }),
        headers: new Map()
      })

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
      api = new Api({
        baseUrl: 'https://example.com/api/v1'
      }, clientStub)
    })

    it('calls url with query params', async () => {
      clientStub.resolves({
        status: 200,
        json: stub().resolves({}),
        headers: new Map()
      })
      await api.context({ fetch: clientStub }).endpoint('some/url').query({ foo: 'bar', baz: 'qux' }).del()
      expect(clientStub.firstCall.args[0]).to.endWith('/some/url?foo=bar&baz=qux')
    })

    it('calls url ignoring undefined query params', async () => {
      clientStub.resolves({
        status: 200,
        json: stub().resolves({}),
        headers: new Map()
      })
      await api.context({ fetch: clientStub }).endpoint('some/url').query({ foo: undefined, baz: 'qux' }).del()
      expect(clientStub.firstCall.args[0]).to.endWith('/some/url?baz=qux')
    })

    it('calls url with delete method', async () => {
      clientStub.resolves({
        status: 200,
        json: stub().resolves({}),
        headers: new Map()
      })
      await api.context({ fetch: clientStub }).endpoint('some/url').del()
      expect(clientStub.firstCall.args[1].method).equals('DELETE')
    })
  })
})
