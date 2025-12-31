import helmet, { type HelmetOptions } from 'helmet';
import type { RequestHandler } from 'express';
import type { SecurityConfig } from '../interfaces';
import type { Environment } from '../types';
import { HSTS_DEFAULT_MAX_AGE } from '../constants';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';
const isProduction = env === 'production';

const DEFAULT_CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  scriptSrc: ["'self'"],
  imgSrc: ["'self'", 'data:', 'https:'],
  connectSrc: ["'self'", 'wss:', 'ws:'],
  fontSrc: ["'self'"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  frameSrc: ["'none'"],
  upgradeInsecureRequests: [],
};

const DEFAULT_HSTS_OPTIONS = {
  maxAge: HSTS_DEFAULT_MAX_AGE,
  includeSubDomains: true,
  preload: true,
};

export function createHelmetMiddleware(config: SecurityConfig = {}): RequestHandler {
  const helmetOptions: HelmetOptions = {
    contentSecurityPolicy:
      config.contentSecurityPolicy ??
      (isProduction ? { directives: DEFAULT_CSP_DIRECTIVES } : false),
    crossOriginEmbedderPolicy: config.crossOriginEmbedderPolicy ?? false,
    crossOriginOpenerPolicy: config.crossOriginOpenerPolicy ?? { policy: 'same-origin' },
    crossOriginResourcePolicy: config.crossOriginResourcePolicy ?? { policy: 'same-origin' },
    dnsPrefetchControl: config.dnsPrefetchControl ?? { allow: false },
    frameguard: config.frameguard ?? { action: 'deny' },
    hsts: config.hsts ?? (isProduction ? DEFAULT_HSTS_OPTIONS : false),
    ieNoOpen: config.ieNoOpen ?? true,
    noSniff: config.noSniff ?? true,
    originAgentCluster: config.originAgentCluster ?? true,
    permittedCrossDomainPolicies: config.permittedCrossDomainPolicies ?? {
      permittedPolicies: 'none',
    },
    referrerPolicy: config.referrerPolicy ?? { policy: 'strict-origin-when-cross-origin' },
    xssFilter: config.xssFilter ?? true,
  };

  return helmet(helmetOptions);
}

export const helmetMiddleware = createHelmetMiddleware();

export default helmetMiddleware;
