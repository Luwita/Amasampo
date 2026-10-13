import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ProductCard from './ProductCard';

// A grid of search results with a "Load more" button for the next page.
// With `auto`, the next page loads by itself when the shopper scrolls near the end (the phone home feed).
export default function ProductGrid({ result, columns = 4, empty = null, auto = false }) {
  const { items, total, loading, error, hasMore, loadMore } = result;
  const more = useRef(null);

  useEffect(() => {
    const el = more.current;
    if (!auto || !el || !hasMore || loading || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: '600px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [auto, hasMore, loading, loadMore]);

  if (error) return <div className="card empty error">{error}</div>;
  if (!items.length) return loading ? <div className="grid-loading muted">Loading products…</div> : empty;
  return (
    <>
      <div className={`grid grid-${columns}`}>
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {hasMore && (
        <div className="load-more" ref={more}>
          <span className="muted small">
            Showing {items.length} of {total}
          </span>
          <button className="btn btn-outline" onClick={loadMore} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </>
  );
}

// One or more full rows of products: shows exactly as many cards as fit across the screen.
// The browser decides the column count (CSS auto-fill); this reads it back and renders only those cards,
// so hidden extras are never in the page for keyboards or screen readers.
export function ProductRow({ items, rows = 1 }) {
  const ref = useRef(null);
  const [columns, setColumns] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      if (tracks) setColumns(tracks);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shown = columns ? items.slice(0, columns * rows) : items;
  return (
    <div ref={ref} className="grid grid-6">
      {shown.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
