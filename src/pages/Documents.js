import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import * as api from '../api';
import { useStore } from '../context/StoreContext';
import { vatIncluded } from '../data/fees';
import { formatLocation } from '../data/zambia';
import { formatK } from '../utils/format';

const date = (d) => new Date(d).toLocaleDateString('en-ZM', { dateStyle: 'long' });

function PrintBar({ back }) {
  return (
    <div className="print-bar no-print">
      <Link to={back.to} className="link">
        ← {back.label}
      </Link>
      <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
        🖨 Print or save as PDF
      </button>
    </div>
  );
}

// Buyer's receipt: one section per shop, since each shop sells and sends its own parcel.
export function Receipt() {
  const { id } = useParams();
  const { user, authReady, orders, ordersReady } = useStore();
  if (authReady && !user) return <Navigate to={`/login?next=/order/${id}/receipt`} replace />;
  const order = orders.find((o) => o.id === id);
  if (!order) {
    return <div className="container section muted">{ordersReady ? 'Receipt not found.' : 'Loading…'}</div>;
  }

  return (
    <div className="container section narrow">
      <PrintBar back={{ to: '/account', label: 'My orders' }} />
      <article className="card document">
        <header className="document-head">
          <div>
            <div className="logo">
              <span className="logo-mark">Z</span>
              <span className="logo-text">
                zed<strong>market</strong>
              </span>
            </div>
            <p className="muted small">Cairo Road, Lusaka · support@zedmarket.co.zm</p>
          </div>
          <div className="document-meta">
            <h1>Receipt</h1>
            <div>Order {order.id}</div>
            <div>{date(order.date)}</div>
          </div>
        </header>

        <section className="document-parties">
          <div>
            <h4>Customer</h4>
            <div>{order.buyer.name}</div>
            <div>{order.buyer.phone}</div>
            <div>
              {order.shipping.address}, {formatLocation(order.shipping)}
            </div>
          </div>
          <div>
            <h4>Payment</h4>
            <div>{order.payment}</div>
            <div>{order.paid ? 'Paid' : 'To be paid on delivery'}</div>
          </div>
        </section>

        {order.shipments.map((s) => {
          const goods = s.subtotal - s.discount;
          return (
            <section key={s.shopId} className="document-shop">
              <h3>Sold by {s.shopName}</h3>
              <p className="muted small">
                {s.shopArea ? `${s.shopArea}, ` : ''}
                {s.shopTown} · {s.shopPhone}
                {s.shopTpin ? ` · TPIN ${s.shopTpin}` : ''}
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit price</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {s.items.map((i) => (
                    <tr key={`${i.id}-${i.options}`}>
                      <td>
                        {i.name}
                        {i.options && <span className="muted"> ({i.options})</span>}
                        {i.quoteId && <span className="muted"> · agreed price</span>}
                      </td>
                      <td className="num">{i.qty}</td>
                      <td className="num">{formatK(i.price)}</td>
                      <td className="num">{formatK(i.price * i.qty)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {s.discount > 0 && (
                    <tr>
                      <td colSpan="3">Discount ({s.couponCode})</td>
                      <td className="num">−{formatK(s.discount)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan="3">Delivery: {s.courierName}</td>
                    <td className="num">{s.fee ? formatK(s.fee) : 'Free'}</td>
                  </tr>
                  <tr className="strong">
                    <td colSpan="3">Total from {s.shopName}</td>
                    <td className="num">{formatK(goods + s.fee)}</td>
                  </tr>
                  {s.shopVatRegistered && (
                    <tr className="muted">
                      <td colSpan="3">Includes VAT at 16% on goods</td>
                      <td className="num">{formatK(vatIncluded(goods))}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </section>
          );
        })}

        <div className="summary-row total">
          <span>Order total</span>
          <span>{formatK(order.total)}</span>
        </div>
        <p className="muted small document-note">
          This receipt is issued by Zed Market on behalf of the shops named above. It is not a ZRA Smart Invoice; ask
          the shop if you need a tax invoice for your business.
        </p>
      </article>
    </div>
  );
}

const thisMonth = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 7); // Zambian time

// Seller's monthly statement: delivered parcels, commission and payout.
export function Statement() {
  const { myShop, authReady } = useStore();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? thisMonth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!myShop) return;
    setData(null);
    api
      .sellerStatement(month)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [month, myShop]);

  if (authReady && !myShop) return <Navigate to="/seller" replace />;
  if (error) return <div className="container section error">{error}</div>;
  if (!data) return <div className="container section muted">Loading…</div>;

  const label = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-ZM', { month: 'long', year: 'numeric' });
  return (
    <div className="container section">
      <PrintBar back={{ to: '/seller?tab=report', label: 'Sales report' }} />
      <div className="no-print statement-month">
        <label htmlFor="month">Month</label>
        <input
          id="month"
          type="month"
          value={month}
          max={thisMonth()}
          onChange={(e) => e.target.value && setParams({ month: e.target.value })}
        />
      </div>
      <article className="card document">
        <header className="document-head">
          <div>
            <div className="logo">
              <span className="logo-mark">Z</span>
              <span className="logo-text">
                zed<strong>market</strong>
              </span>
            </div>
            <p className="muted small">Seller statement</p>
          </div>
          <div className="document-meta">
            <h1>{label}</h1>
            <div>{data.shop.name}</div>
            {data.shop.tpin && <div>TPIN {data.shop.tpin}</div>}
          </div>
        </header>

        {data.lines.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Delivered</th>
                  <th>Order</th>
                  <th className="num">Goods</th>
                  <th className="num">Discount</th>
                  <th className="num">Delivery</th>
                  <th className="num">Commission</th>
                  <th className="num">Cash you collected</th>
                  <th className="num">From Zed Market</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <tr key={l.orderId}>
                    <td>{new Date(l.deliveredAt).toLocaleDateString('en-ZM')}</td>
                    <td>{l.orderId}</td>
                    <td className="num">{formatK(l.subtotal)}</td>
                    <td className="num">{l.discount ? `−${formatK(l.discount)}` : '—'}</td>
                    <td className="num">{formatK(l.delivery)}</td>
                    <td className="num">
                      −{formatK(l.commission)}
                      {l.commissionRate !== data.commissionRate && (
                        <span className="block small muted">{Math.round(l.commissionRate * 1000) / 10}%</span>
                      )}
                    </td>
                    <td className="num">{l.cashOnDelivery ? formatK(l.cashCollected) : '—'}</td>
                    <td className={`num ${l.payout < 0 ? 'error' : ''}`}>{formatK(l.payout)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="strong">
                  <td colSpan="2">Total</td>
                  <td className="num">{formatK(data.totals.subtotal)}</td>
                  <td className="num">−{formatK(data.totals.discount)}</td>
                  <td className="num">{formatK(data.totals.delivery)}</td>
                  <td className="num">−{formatK(data.totals.commission)}</td>
                  <td className="num">{data.totals.cashCollected ? formatK(data.totals.cashCollected) : '—'}</td>
                  <td className="num">{formatK(data.totals.payout)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="muted">No parcels were delivered in {label}.</p>
        )}
        <p className="muted small document-note">
          Commission is a percentage of the goods value after your discounts, at the rate in force when the order was
          placed (now {Math.round(data.commissionRate * 1000) / 10}%). Delivery fees are passed to you in full. For
          orders paid online, Zed Market pays you the goods and delivery minus commission. For cash on delivery you
          already collected the cash, so Zed Market pays back any Zed Market voucher the buyer used, minus the
          commission; a negative amount is commission you owe. Return refunds after delivery come off the total. Only
          parcels marked delivered in this month are included.
        </p>
      </article>
    </div>
  );
}
