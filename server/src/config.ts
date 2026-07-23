const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  // App traffic uses the non-privileged, RLS-subject role. Falls back to
  // DATABASE_URL only so first-time local setup fails loudly in one place.
  appDatabaseUrl: process.env.APP_DATABASE_URL ?? required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '2h',
  maxCvBytes: 5 * 1024 * 1024,
  maxPhotoBytes: 2 * 1024 * 1024,
};
