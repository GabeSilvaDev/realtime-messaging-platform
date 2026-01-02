import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { RequestIdOptions } from '../interfaces';
import { REQUEST_ID_DEFAULT_HEADER_NAME } from '../constants';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

export function createRequestIdMiddleware(options: RequestIdOptions = {}) {
  const {
    headerName = REQUEST_ID_DEFAULT_HEADER_NAME,
    generator = uuidv4,
    setResponseHeader = true,
  } = options;

  return function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const existingId = req.get(headerName);
    const requestId = existingId ?? generator();

    req.id = requestId;

    if (existingId === undefined) {
      req.headers[headerName] = requestId;
    }

    if (setResponseHeader) {
      res.setHeader(headerName, requestId);
    }

    next();
  };
}

let _requestIdMiddleware: ReturnType<typeof createRequestIdMiddleware> | null = null;

export function getRequestIdMiddleware(): ReturnType<typeof createRequestIdMiddleware> {
  _requestIdMiddleware ??= createRequestIdMiddleware();
  return _requestIdMiddleware;
}

export const requestIdMiddleware = getRequestIdMiddleware;

export default createRequestIdMiddleware;
