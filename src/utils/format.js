const kwacha = new Intl.NumberFormat('en-ZM', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const formatK = (amount) => `K${kwacha.format(amount)}`;

export const formatCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

// "097 712 3456", "+260977123456" and "977123456" all become "977123456".
export const normalizePhone = (phone = '') => phone.replace(/\D/g, '').replace(/^(260|0)/, '');

export const discountPct = (price, oldPrice) =>
  oldPrice && oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
