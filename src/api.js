// Thin client for the Zed Market API. In development, CRA proxies /api to the server on port 4000.
const TOKEN_KEY = 'zedmarket.token';

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
    throw new ApiError(0, "Can't reach Zed Market. Check your internet connection.");
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
// Mobile Money goes straight to the shop: the buyer says it was sent, the shop confirms it arrived.
export const paymentSent = (orderId, shopId, reference) =>
  request('POST', `/orders/${orderId}/shipments/${shopId}/payment-sent`, { reference: reference || undefined });
export const confirmPayment = (orderId, shopId) => request('POST', `/orders/${orderId}/shipments/${shopId}/paid`, {});

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

// ----- Cancellations, returns and disputes -----
export const cancelShipment = (orderId, shopId, reason) =>
  request('POST', `/orders/${orderId}/shipments/${shopId}/cancel`, { reason });
export const openCase = (body) => request('POST', '/cases', body);
export const myCases = () => request('GET', '/cases/mine');
export const shopCases = () => request('GET', '/cases/shop');
export const getCase = (id) => request('GET', `/cases/${id}`);
export const respondToCase = (id, body) => request('PATCH', `/cases/${id}/respond`, body);
export const escalateCase = (id, note) => request('PATCH', `/cases/${id}/escalate`, { note });
export const withdrawCase = (id) => request('PATCH', `/cases/${id}/withdraw`);

// ----- Shop verification -----
export const sellerVerification = () => request('GET', '/seller/verification');
export const submitVerification = (body) => request('POST', '/seller/verification', body);
export const removedProducts = () => request('GET', '/seller/removed-products');

// ----- Staff (admin) -----
const qs = (params = {}) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
export const admin = {
  stats: () => request('GET', '/admin/stats'),
  shops: (params) => request('GET', `/admin/shops?${qs(params)}`),
  verifyShop: (id, status, note) => request('PATCH', `/admin/shops/${id}/verification`, { status, note }),
  suspendShop: (id, suspended, reason) => request('PATCH', `/admin/shops/${id}/suspension`, { suspended, reason }),
  deleteShop: (id, reason) => request('POST', `/admin/shops/${id}/delete`, { reason }),
  products: (params) => request('GET', `/admin/products?${qs(params)}`),
  removeProduct: (id, reason) => request('POST', `/admin/products/${id}/remove`, { reason }),
  restoreProduct: (id) => request('POST', `/admin/products/${id}/restore`),
  reviews: (params) => request('GET', `/admin/reviews?${qs(params)}`),
  removeReview: (id, reason) => request('DELETE', `/admin/reviews/${id}`, { reason }),
  users: (params) => request('GET', `/admin/users?${qs(params)}`),
  suspendUser: (id, suspended, reason) => request('PATCH', `/admin/users/${id}/suspension`, { suspended, reason }),
  orders: (params) => request('GET', `/admin/orders?${qs(params)}`),
  cancelShipment: (orderId, shopId, reason) =>
    request('POST', `/admin/orders/${orderId}/shipments/${shopId}/cancel`, { reason }),
  cases: (params) => request('GET', `/admin/cases?${qs(params)}`),
  decideCase: (id, body) => request('PATCH', `/admin/cases/${id}/decide`, body),
  refunds: (params) => request('GET', `/admin/refunds?${qs(params)}`),
  markRefundPaid: (id, reference) => request('PATCH', `/admin/refunds/${id}/paid`, { reference }),
  actions: () => request('GET', '/admin/actions'),
  analytics: (days) => request('GET', `/admin/analytics?days=${days}`),
  payouts: () => request('GET', '/admin/payouts'),
  payoutHistory: (shopId) => request('GET', `/admin/payouts/history?${qs({ shopId })}`),
  pay: (body) => request('POST', '/admin/payouts', body),
  commissionAccount: () => request('GET', '/admin/commission-account'),
  saveCommissionAccount: (body) => request('PUT', '/admin/commission-account', body),
  receiveCommission: (body) => request('POST', '/admin/commission', body),
  remindCommission: (shopId) => request('POST', '/admin/commission/remind', { shopId }),
  banners: () => request('GET', '/admin/banners'),
  createBanner: (body) => request('POST', '/admin/banners', body),
  updateBanner: (id, body) => request('PATCH', `/admin/banners/${id}`, body),
  deleteBanner: (id) => request('DELETE', `/admin/banners/${id}`),
  campaigns: () => request('GET', '/admin/campaigns'),
  createCampaign: (body) => request('POST', '/admin/campaigns', body),
  announcements: () => request('GET', '/admin/announcements'),
  announce: (body) => request('POST', '/admin/announcements', body),
  requests: (params) => request('GET', `/admin/requests?${qs(params)}`),
  delivery: () => request('GET', '/admin/delivery'),
  saveCourier: (id, body) => request('PUT', `/admin/delivery/couriers/${id}`, body),
  savePoints: (points) => request('PUT', '/admin/delivery/points', { points }),
  staff: () => request('GET', '/admin/staff'),
  addStaff: (body) => request('POST', '/admin/staff', body),
  removeStaff: (id) => request('DELETE', `/admin/staff/${id}`),
  settings: () => request('GET', '/admin/settings'),
  saveSettings: (body) => request('PATCH', '/admin/settings', body),
  shop: (id) => request('GET', `/admin/shops/${id}`),
  editShop: (id, body) => request('PUT', `/admin/shops/${id}`, body),
  editProduct: (id, body) => request('PUT', `/admin/products/${id}`, body),
  setParcelStatus: (orderId, shopId, body) => request('PATCH', `/admin/orders/${orderId}/shipments/${shopId}/status`, body),
  removeRequest: (id, reason) => request('POST', `/admin/requests/${id}/remove`, { reason }),
};

// ----- Home page banners and seller payouts -----
export const banners = () => request('GET', '/banners');
export const settings = () => request('GET', '/settings');
export const delivery = () => request('GET', '/delivery');
export const sellerPayouts = () => request('GET', '/seller/payouts');

// ----- Notifications (the bell and red dots) -----
export const notifications = () => request('GET', '/notifications');
export const counts = () => request('GET', '/notifications/counts');
export const markNotificationsRead = (ids) => request('POST', '/notifications/read', ids ? { ids } : {});

// ----- Customer support -----
export const supportTickets = () => request('GET', '/support');
export const supportTicket = (id) => request('GET', `/support/${id}`);
export const openSupportTicket = (body) => request('POST', '/support', body);
export const replySupport = (id, body) => request('POST', `/support/${id}/messages`, { body });

// ----- Buying requests -----
export const buyingRequests = (params = {}) =>
  request('GET', `/buying-requests?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}`);
export const myBuyingRequests = () => request('GET', '/buying-requests/mine');
export const buyingRequest = (id) => request('GET', `/buying-requests/${id}`);
export const postBuyingRequest = (body) => request('POST', '/buying-requests', body);
export const sendOffer = (id, body) => request('POST', `/buying-requests/${id}/offers`, body);
export const acceptOffer = (id, offerId) => request('PATCH', `/buying-requests/${id}/offers/${offerId}/accept`);
export const closeBuyingRequest = (id) => request('PATCH', `/buying-requests/${id}/close`);

// ----- Invite codes and vouchers -----
export const myVouchers = () => request('GET', '/me/vouchers');
export const myReferral = () => request('GET', '/me/referral');

// ----- Staff: customer support -----
export const adminSupport = {
  list: (status) => request('GET', `/admin/support${status ? `?status=${status}` : ''}`),
  get: (id) => request('GET', `/admin/support/${id}`),
  reply: (id, body) => request('POST', `/admin/support/${id}/messages`, { body }),
  setStatus: (id, status) => request('PATCH', `/admin/support/${id}`, { status }),
};
