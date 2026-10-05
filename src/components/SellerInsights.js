import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import { useStore } from '../context/StoreContext';
import { downloadCsv } from '../utils/csv';
import { formatK } from '../utils/format';
import { ProductImage } from './ProductCard';
import Stars from './Stars';

// Sales summary, best sellers and low-stock list for the shop owner.
export function SalesReport({ onEditProduct }) {
  const { shopOrders, catalogVersion } = useStore();
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .sellerReport(days)
      .then((r) => !cancelled && setReport(r))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [days, catalogVersion, shopOrders]);

  const exportOrders = () =>
    downloadCsv(`zed-market-sales-${new Date().toISOString().slice(0, 10)}.csv`, [
      [
        'Order',
        'Date',
        'Buyer',
        'Phone',
        'Town',
        'Product',
        'Options',
        'Qty',
        'Unit price',
        'Line total',
        'Courier',
        'Status',
        'Payment',
      ],
      ...shopOrders.flatMap((o) =>
        o.shipments.flatMap((s) =>
          s.items.map((i) => [
            o.id,
            new Date(o.date).toISOString().slice(0, 10),
            o.buyer.name,
            o.buyer.phone,
            o.shipping.town,
            i.name,
            i.options,
            i.qty,
            i.price,
            i.qty * i.price,
            s.courierName,
            s.status,
            o.paid ? 'Paid' : 'Cash on delivery',
          ]),
        ),
      ),
    ]);

  if (error) return <p className="error">{error}</p>;
  if (!report) return <p className="muted">Loading report…</p>;

  return (
    <div className="report">
      <div className="report-head">
        <div className="scope-bar">
          {[7, 30, 90].map((d) => (
            <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
              Last {d} days
            </button>
          ))}
        </div>
        <button className="btn btn-outline btn-sm" onClick={exportOrders} disabled={!shopOrders.length}>
          ⬇ Download orders (CSV)
        </button>
      </div>

      <div className="tiles">
        <div className="tile">
          <span>Sales</span>
          <strong>{formatK(report.revenue)}</strong>
          <small>{formatK(report.deliveredRevenue)} delivered</small>
        </div>
        <div className="tile">
          <span>Orders</span>
          <strong>{report.orders}</strong>
          <small>{report.units} items sold</small>
        </div>
        <div className="tile">
          <span>To send</span>
          <strong>{report.toDispatch}</strong>
          <small>{report.inTransit} with couriers</small>
        </div>
        <div className="tile">
          <span>Rating</span>
          <strong>{report.reviewCount ? report.rating.toFixed(1) : '—'}</strong>
          <small>{report.reviewCount} reviews</small>
        </div>
      </div>

      <div className="report-grid">
        <section className="card form-card">
          <h3>Best sellers</h3>
          {report.topProducts.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Sold</th>
                  <th className="num">Sales</th>
                </tr>
              </thead>
              <tbody>
                {report.topProducts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/product/${p.id}`}>{p.name}</Link>
                    </td>
                    <td className="num">{p.units}</td>
                    <td className="num">{formatK(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No sales in this period yet.</p>
          )}
        </section>

        <section className="card form-card">
          <h3>Running low ({report.lowStock.length})</h3>
          {report.lowStock.length ? (
            <ul className="low-stock">
              {report.lowStock.map((p) => (
                <li key={p.id}>
                  <ProductImage product={p} size="xs" />
                  <span className="grow">{p.name}</span>
                  <strong className={p.stock ? 'warn' : 'error'}>{p.stock ? `${p.stock} left` : 'Sold out'}</strong>
                  <button className="link-btn" onClick={() => onEditProduct(p.id)}>
                    Restock
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">All products are well stocked.</p>
          )}
        </section>
      </div>
    </div>
  );
}

// Reviews of the shop's products, unanswered first, with a reply box.
export function ShopReviews() {
  const { notify } = useStore();
  const [reviews, setReviews] = useState(null);
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    api
      .sellerReviews()
      .then(setReviews)
      .catch((err) => notify(err.message));
  }, [notify]);

  const reply = async (id) => {
    try {
      const updated = await api.replyToReview(id, drafts[id] ?? '');
      setReviews((list) => list.map((r) => (r.id === id ? { ...r, ...updated } : r)));
      notify('Reply posted');
    } catch (err) {
      notify(err.message);
    }
  };

  if (!reviews) return <p className="muted">Loading reviews…</p>;
  if (!reviews.length) {
    return (
      <div className="card empty">
        <p>No reviews yet. Buyers can review items after you mark their parcel as delivered.</p>
      </div>
    );
  }
  return (
    <ul className="review-list card form-card">
      {reviews.map((r) => (
        <li key={r.id}>
          <div className="review-head">
            <Stars value={r.rating} size="sm" />
            <strong>{r.author}</strong>
            <span className="muted small">
              on <Link to={`/product/${r.productId}`}>{r.productName}</Link> ·{' '}
              {new Date(r.date).toLocaleDateString('en-ZM', { dateStyle: 'medium' })}
            </span>
          </div>
          {r.comment && <p>{r.comment}</p>}
          {r.reply ? (
            <div className="review-reply">
              <strong>Your reply:</strong> {r.reply}
            </div>
          ) : (
            <div className="dispatch-row">
              <input
                placeholder="Thank the buyer or respond to their feedback"
                value={drafts[r.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                aria-label={`Reply to ${r.author}`}
              />
              <button className="btn btn-primary btn-sm" disabled={!drafts[r.id]?.trim()} onClick={() => reply(r.id)}>
                Reply
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
