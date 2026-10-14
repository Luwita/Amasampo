import { createPublicKey, randomBytes, verify } from 'node:crypto';
import express from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { handleAuthProxyRequest, processAuthMiddleware } from '@neondatabase/auth/server';

// Neon Auth (Managed Better Auth) runs the accounts: sign-up, sign-in, sessions and phone codes.
//
//  - The browser talks to it through this server at /api/auth/*, so its cookies belong to ZedMarket's own
//    address. Browsers that block other sites' cookies (Safari on iPhone) would otherwise sign people out.
//  - Every other API request carries a short-lived token (JWT) from Neon Auth, checked here against Neon
//    Auth's public keys. The user's id in the token links to ZedMarket's own users table (users.auth_id).

// Headers that describe this hop only and must not be copied onto the request to Neon Auth.
const HOP_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade']);

// Express route handler that passes /api/auth/* to Neon Auth and copies its answer back, cookies included.
export function authProxy({ baseUrl, cookieSecret }) {
  const router = express.Router();
  router.use(express.raw({ type: () => true, limit: '1mb' }));
  router.all('/{*path}', async (req, res, next) => {
    try {
      const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (!HOP_HEADERS.has(name) && value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const hasBody = !['GET', 'HEAD'].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length > 0;
      const request = new Request(url, { method: req.method, headers, body: hasBody ? req.body : undefined });
      const path = [req.params.path ?? []].flat().join('/');
      const response = await handleAuthProxyRequest({ request, path, baseUrl, cookieSecret, sameSite: 'lax' });

      res.status(response.status);
      response.headers.forEach((value, name) => {
        if (!['set-cookie', 'content-length', 'content-encoding', 'transfer-encoding'].includes(name)) res.setHeader(name, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('set-cookie', cookies);
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      next(err);
    }
  });
  return router;
}

// Finishes a Google sign-in. Google sends the person back to a ZedMarket page with a one-time
// `neon_auth_session_verifier`; together with the challenge cookie set when they started, it is exchanged here for
// the session cookie, and the page is reloaded without it. This is what Neon's own server middleware does.
export function finishOAuthSignIn({ baseUrl, cookieSecret }) {
  return async (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || !req.query.neon_auth_session_verifier) return next();
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (!HOP_HEADERS.has(name) && value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const request = new Request(new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`), { headers });
      const result = await processAuthMiddleware({
        request,
        pathname: req.path,
        skipRoutes: ['/'], // no page is protected here; the API checks sign-in itself
        loginUrl: '/__not-a-page__',
        baseUrl,
        cookieSecret,
        sameSite: 'lax',
      });
      if (result.action === 'redirect_oauth') {
        if (result.cookies.length) res.setHeader('set-cookie', result.cookies);
        return res.redirect(302, `${result.redirectUrl.pathname}${result.redirectUrl.search}`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Checks a Neon Auth token and returns who it belongs to: { id, email, name }, or null if it isn't valid.
export function neonTokenVerifier(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const jwks = createRemoteJWKSet(new URL(`${baseUrl.replace(/\/+$/, '')}/.well-known/jwks.json`));
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer: origin, audience: origin, algorithms: ['EdDSA'] });
      return {
        id: payload.sub,
        email: payload.email ?? null,
        emailVerified: !!payload.emailVerified,
        name: payload.name ?? null,
      };
    } catch {
      return null;
    }
  };
}

// Checks the signature Neon Auth puts on its webhook calls (an Ed25519 detached JWS over the timestamp and the raw
// body, signed with a key from the Neon Auth JWKS). `getKeys(refresh)` returns the JWKS keys. Calls older than
// 5 minutes are refused, so a captured request can't be replayed later.
export function webhookVerifier(getKeys) {
  return async (raw, headers) => {
    const signature = headers['x-neon-signature'];
    const kid = headers['x-neon-signature-kid'];
    const timestamp = headers['x-neon-timestamp'];
    if (!signature || !kid || !timestamp) return false;
    if (!(Math.abs(Date.now() - Number(timestamp)) <= 5 * 60e3)) return false;
    const [header, middle, sig] = String(signature).split('.');
    if (!header || middle !== '' || !sig) return false;
    const jwk = (await getKeys(false)).find((k) => k.kid === kid) ?? (await getKeys(true)).find((k) => k.kid === kid);
    if (!jwk) return false;
    const signed = Buffer.from(`${timestamp}.${raw.toString('base64url')}`).toString('base64url');
    try {
      return verify(null, Buffer.from(`${header}.${signed}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(sig, 'base64url'));
    } catch {
      return false;
    }
  };
}

// The webhook check for a Neon Auth branch, with its public keys cached (fetched again for an unknown key, at
// most once a minute).
export function neonWebhookVerifier(baseUrl) {
  const url = `${baseUrl.replace(/\/+$/, '')}/.well-known/jwks.json`;
  let keys = null;
  let fetchedAt = 0;
  return webhookVerifier(async (refresh) => {
    if (!keys || (refresh && Date.now() - fetchedAt > 60e3)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      keys = (await res.json()).keys ?? [];
      fetchedAt = Date.now();
    }
    return keys;
  });
}

// A random secret for the session cookie the proxy signs, when none is configured (sessions then last until
// the server restarts, so production sets NEON_AUTH_COOKIE_SECRET).
export const devCookieSecret = () => randomBytes(32).toString('base64');
