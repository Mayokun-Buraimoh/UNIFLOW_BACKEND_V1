import { Request, Response, NextFunction } from 'express';

/**
 * RFC 4122 UUID shape (any version, case-insensitive). The DB columns are typed
 * UUID, so any non-UUID string would crash Postgres with `22P02`.
 */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/**
 * Express middleware factory that rejects requests where any of the given
 * route params are not valid UUIDs. Returns 400 (not 500) with a clear
 * message — important because the client uses local-first temp ids
 * (e.g. `lf-temp-…`) that Postgres' native UUID type cannot accept.
 */
export function requireUuidParams(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const name of paramNames) {
      const v = req.params[name];
      if (!isUuid(v)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[uuid-guard] rejecting ${req.method} ${req.originalUrl}: param "${name}"="${String(
            v
          )}" is not a UUID (probably client local-first temp id)`
        );
        res.status(400).json({
          error:
            'This item is still syncing from this device. Open it again from the list, then try once it has finished syncing.',
          field: name,
        });
        return;
      }
    }
    next();
  };
}
