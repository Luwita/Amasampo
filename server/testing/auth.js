// Stands in for Neon Auth in tests. The token "test:977123456" belongs to a person who signed up as
// 977123456@example.test and verified the phone number 0977123456.
const deleted = new Set();
export const testAuth = {
  async verifyToken(token) {
    const digits = token.match(/^test:(\d{9})$/)?.[1];
    if (deleted.has(`auth-${digits}`)) return null;
    return digits ? { id: `auth-${digits}`, email: `${digits}@example.test`, emailVerified: true, name: null } : null;
  },
  async lookupPhone(authId) {
    return authId.match(/^auth-(\d{9})$/)?.[1] ?? null;
  },
  async verifyWebhook() {
    return false;
  },
  async deleteIdentity(authId) {
    deleted.add(authId);
  },
};

// Signs in as the person with this phone number (any format) and, the first time, fills in the sign-up details
// (name, accountType, referralCode). `details` may also be just a name. Returns { token, user, status }.
export async function testSignIn(api, phone, details = {}) {
  const digits = phone.replace(/\D/g, '').replace(/^(260|0)/, '');
  const token = `test:${digits}`;
  const extra = typeof details === 'string' ? { name: details } : details;
  let res = await api('GET', '/api/session/me', undefined, token);
  if (res.status === 200 && Object.keys(extra).length) {
    await api('POST', '/api/session/welcome', extra, token);
    res = await api('GET', '/api/session/me', undefined, token);
  }
  return { token, user: res.body, status: res.status };
}
