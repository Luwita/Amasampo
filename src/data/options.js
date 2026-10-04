// Product options are buyer choices such as size or colour. They share the product's price and stock.
// product.options: [{ name: 'Size', values: ['S', 'M'] }]; a choice is { Size: 'M' }.

// Stable key for a cart line: the same product with different choices is a different line.
export const lineKey = (productId, choice = {}) =>
  [
    productId,
    ...Object.keys(choice)
      .sort()
      .map((k) => `${k}=${choice[k]}`),
  ].join('|');

export const describeChoice = (choice = {}) =>
  Object.entries(choice)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

// Returns an error message, or null when every option has exactly one valid value chosen.
export function checkChoice(product, choice = {}) {
  const names = (product.options ?? []).map((o) => o.name);
  const extra = Object.keys(choice).find((k) => !names.includes(k));
  if (extra) return `${product.name} has no "${extra}" option`;
  for (const option of product.options ?? []) {
    if (!option.values.includes(choice[option.name]))
      return `Choose a ${option.name.toLowerCase()} for ${product.name}`;
  }
  return null;
}
