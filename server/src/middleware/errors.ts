import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  // Postgres unique violation → friendly message without leaking internals.
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  // insufficient_privilege raised by RLS / guard triggers.
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '42501') {
    return res.status(403).json({ error: 'You do not have permission to perform this action' });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
}
