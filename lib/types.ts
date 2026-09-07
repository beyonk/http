import { HttpError } from ".";

/**
 * API Configuration options
 */
export type ApiOptions = {
  /** Base URL for API requests */
  baseUrl?: string;
  /** Mock client for testing */
  mock?: FetchClient;
  /** Fetch client for HTTP requests */
  fetch?: FetchClient;
  /** Whether to retry failed requests */
  retry?: RetryOptions | false;
  /** Whether to parse error responses as JSON */
  parseErrors?: boolean;
  /** Global error handlers */
  handlers?: ErrorHandlers;
};

/**
 * Retry configuration
 */
export type RetryOptions = {
  /** Number of retry attempts */
  attempts: number;
  /** Error codes to retry on */
  errors: string[];
};

/**
 * API configuration for a request
 */
export type RequestConfig = {
  /** API endpoint */
  endpoint: string | null;
  /** HTTP method */
  method:  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Request payload */
  payload: any | null;
  /** Query parameters */
  query: string | null;
  /** HTTP headers */
  headers: Record<string, string>;
  /** Override options */
  overrides: Record<string, any>;
};

/**
 * Context object for API requests
 */
export type ApiContext = {
  /** Fetch client */
  fetch?: FetchClient;
  /** Additional context properties */
  [key: string]: any;
};

/**
 * Handler function for HTTP errors
 */
export type ErrorHandler = (error: HttpError, context?: ApiContext) => any;

/**
 * Map of error handlers
 */
export type ErrorHandlers = {
  accessDenied?: ErrorHandler;
  paymentRequired?: ErrorHandler;
  forbidden?: ErrorHandler;
  notFound?: ErrorHandler;
  notAcceptable?: ErrorHandler;
  conflict?: ErrorHandler;
  gone?: ErrorHandler;
  preconditionFailed?: ErrorHandler;
  expectationFailed?: ErrorHandler;
  badData?: ErrorHandler;
  tooManyRequests?: ErrorHandler;
  /** Called when no request-level or status-specific handler matches */
  default?: ErrorHandler;
  [key: string]: ErrorHandler | undefined;
};

/**
 * Function to transform API response
 */
export type ResponseTransformer<T = any> = (json: any, httpStatus: number, response: Response) => T;

/**
 * Fetch client interface
 */
export type FetchClient = (url: string, options: Record<string, any>) => Promise<Response>;

/**
 * Fetch response interface
 */
export type Response = {
  status: number;
  statusText: string;
  json(): Promise<any>;
  text(): Promise<string>;
  headers: Map<string, string> | {
    get(name: string): string | null;
  };
  ok?: boolean;
};


/**
 * API query response
 */
export type QueryResult = {
  httpStatus: number;
  json?: any;
  response: Response;
};