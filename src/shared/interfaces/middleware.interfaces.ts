import type { Request } from 'express';
import type { HelmetOptions } from 'helmet';
import type { HttpStatus, ErrorCode } from '../types';

export interface CorsConfig {
  allowedOrigins?: string | string[];
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  keyPrefix?: string;
  skip?: (req: Request) => boolean;
  keyGenerator?: (req: Request) => string;
}

export interface SecurityConfig {
  contentSecurityPolicy?: HelmetOptions['contentSecurityPolicy'];
  crossOriginEmbedderPolicy?: HelmetOptions['crossOriginEmbedderPolicy'];
  crossOriginOpenerPolicy?: HelmetOptions['crossOriginOpenerPolicy'];
  crossOriginResourcePolicy?: HelmetOptions['crossOriginResourcePolicy'];
  dnsPrefetchControl?: HelmetOptions['dnsPrefetchControl'];
  frameguard?: HelmetOptions['frameguard'];
  hsts?: HelmetOptions['hsts'];
  ieNoOpen?: HelmetOptions['ieNoOpen'];
  noSniff?: HelmetOptions['noSniff'];
  originAgentCluster?: HelmetOptions['originAgentCluster'];
  permittedCrossDomainPolicies?: HelmetOptions['permittedCrossDomainPolicies'];
  referrerPolicy?: HelmetOptions['referrerPolicy'];
  xssFilter?: HelmetOptions['xssFilter'];
}

export interface RequestIdOptions {
  headerName?: string;
  generator?: () => string;
  setResponseHeader?: boolean;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    statusCode: HttpStatus;
    details?: unknown;
    timestamp: string;
    requestId?: string;
  };
}

export interface RequestLogMetadata {
  method: string;
  path: string;
  query: Record<string, unknown>;
  ip: string | undefined;
  userAgent: string | undefined;
  requestId: string | undefined;
  contentLength: string | undefined;
  statusCode?: number;
  responseTime?: number;
  contentType?: string;
  [key: string]: unknown;
}
