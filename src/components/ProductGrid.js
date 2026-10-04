import ProductCard from './ProductCard';

// A grid of search results with a "Load more" button for the next page.
export default function ProductGrid({ result, columns = 4, empty = null }) {
  const { items, total, loading, error, hasMore, loadMore } = result;
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
        <div className="load-more">
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
