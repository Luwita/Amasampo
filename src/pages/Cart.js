import { Link } from 'react-router-dom';
import { ProductImage } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import { formatLocation } from '../data/zambia';
import { formatK } from '../utils/format';

export const groupByShop = (items) =>
  Object.values(
    items.reduce((groups, item) => {
      const key = item.product.shopId;
      groups[key] = groups[key] ?? { shop: item.shop, items: [] };
      groups[key].items.push(item);
      return groups;
    }, {}),
  );

export default function Cart() {
  const { items, subtotal, wholesaleSavings, setQty, removeFromCart, catalogStatus, cartStatus } = useStore();

  if (catalogStatus === 'loading' || cartStatus === 'loading') return null;

  if (!items.length) {
    return (
      <div className="container section">
        <div className="card empty">
          <div className="empty-icon">🛒</div>
          <h2>Your cart is empty</h2>
          <p className="muted">Browse products from local shops across Zambia.</p>
          <Link to="/shop" className="btn btn-primary">
            Start shopping
          </Link>
        </div>
      </div>
    );
  }

  const groups = groupByShop(items);

  return (
    <div className="container section">
      <h1>Cart ({items.length})</h1>
      <div className="cart-layout">
        <div className="cart-groups">
          {groups.map(({ shop, items: lines }) => (
            <div key={shop?.id ?? 'unknown'} className="card cart-items">
              {shop && (
                <Link to={`/store/${shop.id}`} className="cart-shop">
                  <span>{shop.logo ?? '🏪'}</span> <strong>{shop.name}</strong>
                  <span className="muted small">📍 {formatLocation(shop)}</span>
                </Link>
              )}
              {lines.map(({ key, product, choice, qty, price, total, quoteId }) => {
                const nextTier = !quoteId && product.tiers.find((t) => t.min > qty);
                return (
                  <div key={key} className="cart-line">
                    <Link to={`/product/${product.id}`}>
                      <ProductImage product={product} size="sm" />
                    </Link>
                    <div className="cart-line-info">
                      <Link to={`/product/${product.id}`} className="cart-line-name">
                        {product.name}
                      </Link>
                      {choice && <div className="small muted">{choice}</div>}
                      <div className="small">
                        {formatK(price)} each
                        {quoteId ? (
                          <span className="tag tag-green static">Agreed price</span>
                        ) : (
                          price < product.price && <span className="tag tag-green static">Wholesale</span>
                        )}
                      </div>
                      {nextTier && (
                        <div className="tier-nudge">
                          Add {nextTier.min - qty} more to pay {formatK(nextTier.price)} each
                        </div>
                      )}
                    </div>
                    {quoteId ? (
                      <div className="qty-fixed" title="The agreed price is for this exact quantity">
                        {qty} units
                      </div>
                    ) : (
                      <div className="qty">
                        <button onClick={() => setQty(key, qty - 1)} aria-label="Decrease">
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={qty}
                          onChange={(e) => setQty(key, Math.max(1, Number(e.target.value) || 1))}
                          aria-label="Quantity"
                        />
                        <button onClick={() => setQty(key, qty + 1)} aria-label="Increase">
                          +
                        </button>
                      </div>
                    )}
                    <div className="cart-line-total">
                      <strong>{formatK(total)}</strong>
                      <button className="link-btn" onClick={() => removeFromCart(key)}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <aside className="card summary">
          <h3>Order summary</h3>
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatK(subtotal)}</span>
          </div>
          {wholesaleSavings > 0 && (
            <div className="summary-row green">
              <span>Wholesale savings</span>
              <span>−{formatK(wholesaleSavings)}</span>
            </div>
          )}
          <div className="summary-row muted">
            <span>Delivery</span>
            <span>Choose at checkout</span>
          </div>
          {groups.length > 1 && (
            <p className="muted small">Your items come from {groups.length} shops. Each shop sends its own parcel.</p>
          )}
          <Link to="/checkout" className="btn btn-primary btn-lg btn-block">
            Checkout
          </Link>
        </aside>
      </div>
    </div>
  );
}
