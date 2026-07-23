import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from './errors.js';

export const AUTH_COOKIE = 'eisavant_token';

export type AppRole = 'ceo' | 'support' | 'admin' | 'client';

export interface AuthUser {
  id: string;
  role: AppRole;
  companyId?: string | null; // client-role users only
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function issueToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, role: user.role, cid: user.companyId ?? null },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
  );
}

/** Session context for withContext(), derived from the verified JWT. */
export function ctxOf(req: Request): { userId: string; role: AppRole; companyId: string | null } {
  return { userId: req.user!.id, role: req.user!.role, companyId: req.user!.companyId ?? null };
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax' as const,
    maxAge: 1000 * 60 * 60 * 8,
    path: '/',
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return next(new HttpError(401, 'Authentication required'));
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
      throw new Error('malformed token');
    }
    req.user = {
      id: payload.sub,
      role: payload.role as AppRole,
      companyId: typeof payload.cid === 'string' ? payload.cid : null,
    };
    return next();
  } catch {
    return next(new HttpError(401, 'Session expired — please sign in again'));
  }
}

export function requireRole(...roles: AppRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have permission to perform this action'));
    }
    return next();
  };
}
