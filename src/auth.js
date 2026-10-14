import { createAuthClient } from '@neondatabase/auth';

// Neon Auth, reached through ZedMarket's own server (/api/auth), which passes the requests on to Neon. That keeps
// the sign-in cookies on ZedMarket's address, so browsers that block other sites' cookies keep people signed in.
export const authClient = createAuthClient(`${window.location.origin}/api/auth`);
