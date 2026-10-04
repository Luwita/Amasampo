// Thin client for the Amasampo API. In development, CRA proxies /api to the server on port 4000.
const TOKEN_KEY = 'amasampo.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: the session lasts until the page is closed
  }
}

export class ApiError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.data = data; // e.g. per-row errors from a bulk upload
  }
}

async function request(method, path, body) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach Amasampo. Check your internet connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data);
  }
  return data;
}

export const requestCode = (phone) => request('POST', '/auth/request-code', { phone });
export const verifyCode = (body) => request('POST', '/auth/verify', body);
export const me = () => request('GET', '/auth/me');
export const logout = () => request('POST', '/auth/logout');

export const getShops = () => request('GET', '/shops');
// Search, filter and page products. Empty values are left out of the query string.
export const searchProducts = (params = {}) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false),
  );
  return request('GET', `/products?${query}`);
};
export const getProduct = (id) => request('GET', `/products/${id}`);
export const provinceStats = () => request('GET', '/stats/provinces');
export const createShop = (shop) => request('POST', '/shops', shop);
export const updateShop = (id, shop) => request('PATCH', `/shops/${id}`, shop);
export const createProduct = (product) => request('POST', '/products', product);
export const updateProduct = (id, product) => request('PATCH', `/products/${id}`, product);
export const deleteProduct = (id) => request('DELETE', `/products/${id}`);
export const bulkCreateProducts = (products) => request('POST', '/products/bulk', { products });
export const uploadImage = (dataUrl) => request('POST', '/uploads', { dataUrl });

export const productReviews = (id, page = 1) => request('GET', `/products/${id}/reviews?page=${page}`);
export const shopReviews = (id) => request('GET', `/shops/${id}/reviews`);
export const createReview = (review) => request('POST', '/reviews', review);
export const replyToReview = (id, reply) => request('PATCH', `/reviews/${id}/reply`, { reply });

export const sellerReport = (days = 30) => request('GET', `/seller/report?days=${days}`);
export const sellerReviews = () => request('GET', '/seller/reviews');

export const placeOrder = (order) => request('POST', '/orders', order);
export const myOrders = () => request('GET', '/orders/mine');
export const shopOrders = () => request('GET', '/orders/shop');
export const updateShipment = (orderId, shopId, patch) =>
  request('PATCH', `/orders/${orderId}/shipments/${shopId}`, patch);
export const quoteOrder = (order) => request('POST', '/orders/quote', order);

// ----- Messages -----
export const listConversations = () => request('GET', '/conversations');
export const unreadMessages = () => request('GET', '/conversations/unread');
export const getConversation = (id) => request('GET', `/conversations/${id}`);
export const startConversation = (message) => request('POST', '/conversations', message);
export const sendMessage = (id, body) => request('POST', `/conversations/${id}/messages`, { body });

// ----- Promotions -----
export const sellerCoupons = () => request('GET', '/seller/coupons');
export const createCoupon = (coupon) => request('POST', '/seller/coupons', coupon);
export const setCouponActive = (id, active) => request('PATCH', `/seller/coupons/${id}`, { active });
export const featureProduct = (id) => request('POST', `/products/${id}/feature`);
export const unfeatureProduct = (id) => request('DELETE', `/products/${id}/feature`);

// ----- Wholesale price requests -----
export const requestPrice = (body) => request('POST', '/price-requests', body);
export const myPriceRequests = () => request('GET', '/price-requests/mine');
export const shopPriceRequests = () => request('GET', '/price-requests/shop');
export const respondToPriceRequest = (id, body) => request('PATCH', `/price-requests/${id}/respond`, body);
export const acceptPriceRequest = (id) => request('PATCH', `/price-requests/${id}/accept`);

// ----- Statements and personal data -----
export const sellerStatement = (month) => request('GET', `/seller/statement?month=${month}`);
export const exportMyData = () => request('GET', '/me/export');
export const deleteAccount = () => request('DELETE', '/me');
