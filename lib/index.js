/**
 * @fileoverview Consolidated API client with error handling
 * @import {
 * ApiOptions,
 * ApiContext,
 * ErrorHandler,
 * FetchClient,
 * RequestConfig,
 * ResponseTransformer,
 * QueryResult
 * } from './types.js'
 */

/**
 * Base HTTP error class
 */
export class HttpError extends Error {
  /**
   * Create a new HTTP error
   * @param {string} message - Error message
   * @param {any} body - Error response body
   */
  constructor (message, body) {
    super(message)
    this.body = body
  }
}

/** 401 Unauthorized error */
class AccessDeniedError extends HttpError {}

/** 402 Payment Required error */
class PaymentRequiredError extends HttpError {}

/** 403 Forbidden error */
class ForbiddenError extends HttpError {}

/** 404 Not Found error */
class NotFoundError extends HttpError {}

/** 406 Not Acceptable error */
class NotAcceptableError extends HttpError {}

/** 409 Conflict error */
class ConflictError extends HttpError {}

/** 410 Gone error */
class GoneError extends HttpError {}

/** 412 Precondition Failed error */
class PreconditionFailedError extends HttpError {}

/** 417 Expectation Failed error */
class ExpectationFailedError extends HttpError {}

/** 422 Unprocessable Entity error */
class BadDataError extends HttpError {}

/** 429 Too Many Requests error */
class TooManyRequestsError extends HttpError {}

/**
 * Map of HTTP status codes to error classes
 * @type {Record<number, typeof HttpError>}
 */
const errorMapping = {
  401: AccessDeniedError,
  402: PaymentRequiredError,
  403: ForbiddenError,
  404: NotFoundError,
  406: NotAcceptableError,
  409: ConflictError,
  410: GoneError,
  412: PreconditionFailedError,
  417: ExpectationFailedError,
  422: BadDataError,
  429: TooManyRequestsError
}

/** @param {unknown} obj  */
function simpleClone (obj) {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Get the error class for a status code
 * @param {number} code - HTTP status code
 * @returns {typeof HttpError} Error class
 */
function getErrorByCode (code) {
  return errorMapping[code] || HttpError
}

/** @type {RequestConfig} */
const DEFAULT_CONFIG = {
  endpoint: null,
  method: 'GET',
  payload: null,
  query: null,
  headers: {},
  overrides: {}
}

/**
 * API client with chainable interface for making HTTP requests
 */
class Api {
  config = simpleClone(DEFAULT_CONFIG)

  /** @type {Record<string, ErrorHandler>} */
  handlers = {}

  /** @type {FetchClient|null} */
  client = null

  /** @type {ApiContext|null} */
  ctx = null

  /** @type {ErrorHandler|null} */
  defaultHandler = null

  /**
   * Creates a new API instance
   * @param {ApiOptions} options - API configuration options
   */
  constructor (options) {
    /** @type {ApiOptions} */
    this.options = Object.assign({
      retry: false,
      parseErrors: true,
      handlers: {}
    }, options)
  }

  /**
   * Reset the request configuration to defaults
   */
  resetRequest () {
    /** @type {RequestConfig} */
    this.config = simpleClone(DEFAULT_CONFIG)
  }

  /**
   * Get the HTTP client to use for requests
   * @returns {FetchClient} HTTP client
   * @throws {Error} If no client is available
   */
  getClient () {
    if (this.options.mock) {
      console.warn('@beyonk/http: Using mocked http client')
      return this.options.mock
    }

    if (this.client) {
      return this.client
    }

    if (config?.fetch) {
      return config.fetch
    }

    if ('fetch' in globalThis) {
      return globalThis.fetch
    }

    throw Error("No client provided and can't find one automatically")
  }

  /**
   * Handle an error
   * @param {HttpError} e - Error instance
   * @param {ApiContext} [ctx] - API context
   * @returns {any} Result of error handler
   */
  handle (e, ctx) {
    const constructorName = Object.getPrototypeOf(e).constructor.name
    const globalHandlerName = `${constructorName[0].toLowerCase()}${constructorName.slice(1, -5)}`

    const handler = this.handlers[constructorName] ||
      (this.options.handlers && this.options.handlers[globalHandlerName]) ||
      this.defaultHandler ||
      (this.options.handlers && this.options.handlers.default) ||
      ((e) => {
        console.error(constructorName, e.message, e)
      })

    return handler(e, ctx)
  }

  /**
   * Send the HTTP request
   * @template T
   * @param {ResponseTransformer<T>} [fn] - Function to transform the response
   * @returns {Promise<T>} Response data
   */
  async send (fn) {
    const endpoint = this.config.endpoint?.includes('://')
      ? this.config.endpoint
      : `${this.options.baseUrl}/${this.config.endpoint}`

    const hasPayload = !!this.config.payload

    const options = Object.assign(
      {
        method: this.config.method,
        cors: true,
        credentials: 'include',
        headers: Object.assign(
          { Accept: 'application/json' },
          hasPayload ? { 'Content-Type': 'application/json' } : {},
          this.config.headers
        )
      },
      hasPayload ? { body: JSON.stringify(this.config.payload) } : {},
      this.config.overrides
    )

    const client = this.getClient()
    const ep = this.config.query ? `${endpoint}?${this.config.query}` : `${endpoint}`

    /** @type {QueryResult|undefined} */
    let result
    try {
      result = await this.#doQuery(1, client, ep, options)
    } catch (e) {
      console.log(e)
      // @ts-ignore
      return this.handle(e, this.ctx)
    } finally {
      this.resetRequest()
    }

    const { json, httpStatus, response } = result
    return fn ? fn(json, httpStatus, response) : json
  }

  /**
   * Check if the response has content
   * @param {import('./types.js').Response} response - HTTP response
   * @returns {boolean} Whether the response has content
   */
  #hasContent (response) {
    const contentLength = parseInt(response.headers.get('content-length') ?? '', 10)

    const isNoContentResponse = response.status === 204
    if (isNoContentResponse) {
      return false
    }

    const headerExists = !isNaN(contentLength)
    return !headerExists || contentLength > 0
  }

  /**
   * Perform the HTTP request with retry logic
   * @param {number} attempt - Current attempt number
   * @param {FetchClient} client - HTTP client
   * @param {string} endpoint - API endpoint URL
   * @param {Record<string, any>} options - Request options
   * @returns {Promise<QueryResult>} Response data
   * @throws {HttpError} If the request fails
   */
  async #doQuery (attempt, client, endpoint, options) {
    const retry = this.options.retry || { attempts: 1 }
    try {
      const r = await client(endpoint, options)

      if (r.status >= 200 && r.status < 400) {
        /** @type {any} */
        let json

        if (this.#hasContent(r)) {
          try {
            json = await r.json()
          } catch (e) {
            // @ts-ignore
            console.error('Unable to parse response json', e.message)
          }
        }

        return { httpStatus: r.status, json, response: r }
      }

      let content = ''
      try {
        content = this.options.parseErrors ? await r.json() : await r.text()
      } catch (e) {
        console.log('Failed to parse error body when asked.')
      }

      const ClientError = getErrorByCode(r.status)
      throw new ClientError(r.statusText, content)
    } catch (e) {
      // @ts-ignore
      if (retry.attempts && retry.errors && attempt < retry.attempts && retry.errors.includes(e.code)) {
        // @ts-ignore
        console.warn(`Got ${e.code} when calling ${endpoint}. Retrying request (${attempt}/${retry.attempts})`)
        return this.#doQuery(++attempt, client, endpoint, options)
      }

      throw e
    }
  }

  /**
   * Set the context for the request
   * @param {ApiContext} ctx - Request context
   * @returns {this} Current instance
   */
  context (ctx) {
    if (ctx.fetch) {
      this.client = ctx.fetch
    }
    this.ctx = ctx
    return this
  }

  /**
   * Set request overrides
   * @param {Record<string, any>} override - Request overrides
   * @returns {this} Current instance
   */
  override (override) {
    this.config.overrides = override
    return this
  }

  /**
   * Set request headers
   * @param {Record<string, string>} headers - Request headers
   * @returns {this} Current instance
   */
  headers (headers) {
    this.config.headers = headers
    return this
  }

  /**
   * Perform a GET request
   * @template T
   * @param {ResponseTransformer<T>} [fn] - Function to transform the response
   * @returns {Promise<T>} Response data
   */
  async get (fn) {
    this.config.method = 'GET'
    return this.send(fn)
  }

  /**
   * Perform a POST request
   * @template T
   * @param {ResponseTransformer<T>} [fn] - Function to transform the response
   * @returns {Promise<T>} Response data
   */
  async post (fn) {
    this.config.method = 'POST'
    return this.send(fn)
  }

  /**
   * Perform a PATCH request
   * @template T
   * @param {ResponseTransformer<T>} [fn] - Function to transform the response
   * @returns {Promise<T>} Response data
   */
  async patch (fn) {
    this.config.method = 'PATCH'
    return this.send(fn)
  }

  /**
   * Perform a PUT request
   * @template T
   * @param {ResponseTransformer<T>} [fn] - Function to transform the response
   * @returns {Promise<T>} Response data
   */
  async put (fn) {
    this.config.method = 'PUT'
    return this.send(fn)
  }

  /**
   * Perform a DELETE request
   * @template T
   * @param {ResponseTransformer<T>} [fn] - Function to transform the response
   * @returns {Promise<T>} Response data
   */
  async del (fn) {
    this.config.method = 'DELETE'
    return this.send(fn)
  }

  /**
   * Set the API endpoint
   * @param {string} endpoint - API endpoint
   * @returns {this} Current instance
   */
  endpoint (endpoint) {
    this.config.endpoint = endpoint
    return this
  }

  /**
   * Set query parameters
   * @param {Record<string, any>} query - Query parameters
   * @returns {this} Current instance
   */
  query (query) {
    const q = Object.entries(query).reduce((curr, [ k, v ]) => {
      if (typeof v === 'undefined') {
        return curr
      }
      if (Array.isArray(v)) {
        curr.push(...v.map(n => `${k}=${encodeURIComponent(n)}`))
      } else {
        curr.push(`${k}=${encodeURIComponent(v)}`)
      }
      return curr
    }, /** @type {string[]} */ ([]))

    this.config.query = q.join('&')
    return this
  }

  /**
   * Set request payload
   * @param {any} payload - Request payload
   * @returns {this} Current instance
   */
  payload (payload) {
    this.config.payload = payload
    return this
  }

  /**
   * Register a default error handler
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  default (fn) {
    this.defaultHandler = fn
    return this
  }

  /**
   * Register a handler for AccessDenied (401) errors
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  accessDenied (fn) {
    this.handlers[AccessDeniedError.name] = fn
    return this
  }

  /**
   * Register a handler for PaymentRequired (402) errors
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  paymentRequired (fn) {
    this.handlers[PaymentRequiredError.name] = fn
    return this
  }

  /**
   * Register a handler for Forbidden (403) errors
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  forbidden (fn) {
    this.handlers[ForbiddenError.name] = fn
    return this
  }

  /**
   * Register a handler for NotFound (404) errors
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  notFound (fn) {
    this.handlers[NotFoundError.name] = fn
    return this
  }

  /**
   * Register a handler for NotAcceptable (406) errors
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  notAcceptable (fn) {
    this.handlers[NotAcceptableError.name] = fn
    return this
  }

  /**
   * Register a handler for Conflict (409) errors
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  conflict (fn) {
    this.handlers[ConflictError.name] = fn
    return this
  }

  /**
   * Register a handler for Gone (410) errors
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  gone (fn) {
    this.handlers[GoneError.name] = fn
    return this
  }

  /**
   * Register a handler for PreconditionFailed (412) errors
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  preconditionFailed (fn) {
    this.handlers[PreconditionFailedError.name] = fn
    return this
  }

  /**
   * Register a handler for ExpectationFailed (417) errors
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  expectationFailed (fn) {
    this.handlers[ExpectationFailedError.name] = fn
    return this
  }

  /**
   * Register a handler for BadData (422) errors
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  badData (fn) {
    this.handlers[BadDataError.name] = fn
    return this
  }

  /**
   * Register a handler for TooManyRequests (429) errors
   * @param {ErrorHandler} fn - Error handler function
   * @returns {this} Current instance
   */
  tooManyRequests (fn) {
    this.handlers[TooManyRequestsError.name] = fn
    return this
  }
}

/**
 * @typedef {ApiOptions|undefined} Config
 */
/** @type {Config} */
let config

/**
 * Configure the API client
 * @param {ApiOptions} options - API configuration options
 */
function configure (options) {
  config = options
}

/**
 * Create a new API client instance
 * @returns {Api} API client instance
 * @throws {Error} If API client is not configured
 */
function create () {
  if (!config) { throw new Error('Api client must be configured') }
  return new Api(config)
}

export { Api }

export default {
  create,
  configure
}
