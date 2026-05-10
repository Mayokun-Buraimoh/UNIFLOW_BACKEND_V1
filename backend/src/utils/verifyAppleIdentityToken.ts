import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const APPLE_ISSUER = 'https://appleid.apple.com';
const jwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/**
 * Verifies Apple `identityToken` (JWT). Tries each audience (native bundle ID, then optional Services ID).
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  audiences: string[],
): Promise<JWTPayload> {
  const uniq = [...new Set(audiences.filter(Boolean))];
  let lastErr: unknown;
  for (const aud of uniq) {
    try {
      const { payload } = await jwtVerify(identityToken, jwks, {
        issuer: APPLE_ISSUER,
        audience: aud,
      });
      return payload;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Apple identity token verification failed');
}
