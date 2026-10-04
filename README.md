# Amasampo

Zambia's online marketplace for local shops. Buyers shop retail or wholesale from sellers in all 10 provinces,
filter by their province and town, pay in Kwacha, and get orders delivered by Zambian couriers. Shop owners open a
shop, upload products and fulfil orders from a dashboard.

## Run it

```bash
npm install
npm run dev      # React app on http://localhost:3000 + API on http://localhost:4000
```

No database install is needed for development: the API uses [PGlite](https://pglite.dev) (Postgres running inside
Node) and stores data in `server/.data/`. Demo shops and products are added on first start. Delete
`server/.data/` to start over.

Signing in uses a 6-digit code. Until an SMS provider is connected, the code is printed in the API terminal and
shown on the sign-in screen (development only).

```bash
npm test             # React tests (use an in-memory fake API)
npm run test:server  # API tests against a real in-memory Postgres
npm run build        # production build of the React app
```

## How it fits together

```
React app (src/)  ──/api──▶  Express API (server/)  ──SQL──▶  Postgres (PGlite locally, hosted in production)
```

- **src/**: the React app. Cart, saved items and the buyer's location stay in the browser; everything else comes
  from the API (`src/api.js`, `src/context/StoreContext.js`).
- **server/**: Express API. `routes/` (catalogue, orders, reviews, seller tools), `queries.js` (search and shared
  SQL), `schemas.js` (request validation), `auth.js` (phone sign-in codes and sessions), `migrations/` (database
  schema, applied automatically on start), `seed.js` (demo data).
- **src/data/**: shared by both sides: provinces and towns, couriers and weight-based delivery pricing, product
  options, search synonyms (`search.js`), platform fees (`fees.js`: commission, VAT, featured-listing limits), and
  `pricing.js`, which prices an order including discount codes and agreed wholesale prices. The server always
  re-prices orders itself; prices sent by the browser are ignored.
- **public/sw.js**: service worker that makes the app installable and keeps viewed pages working offline.
  `scripts/make-icons.js` regenerates the app icons.

### API

| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/auth/request-code`, `/api/auth/verify`, `/api/auth/logout` | anyone |
| GET | `/api/auth/me` | signed in |
| GET | `/api/shops`, `/api/shops/:id`, `/api/products/:id`, `/api/stats/provinces` | anyone |
| GET | `/api/products?q=&cat=&prov=&town=&shop=&sort=&page=&limit=` | anyone: search, filter, sort, page |
| GET | `/api/products/:id/reviews`, `/api/shops/:id/reviews` | anyone |
| POST | `/api/reviews` | buyer, after the parcel is delivered, once per item per order |
| PATCH | `/api/reviews/:id/reply` | shop owner |
| POST | `/api/products/bulk` | shop owner: up to 200 products; all rows checked, all or nothing |
| GET | `/api/seller/report?days=`, `/api/seller/reviews` | shop owner |
| POST | `/api/shops` | signed in (one shop per account) |
| PATCH | `/api/shops/:id` | shop owner |
| POST/PATCH/DELETE | `/api/products[/:id]` | shop owner, own products only |
| POST | `/api/uploads` | shop owner (JPEG/PNG/WebP, max 1.5 MB) |
| POST | `/api/orders` | signed in: checks stock, prices and courier rules, then reduces stock |
| GET | `/api/orders/mine` | buyer's orders |
| GET | `/api/orders/shop` | parcels for the owner's shop |
| PATCH | `/api/orders/:id/shipments/:shopId` | shop owner: pending → dispatched → delivered |
| POST | `/api/orders/quote` | signed in: exact totals for checkout (codes, agreed prices) without ordering |
| GET/POST | `/api/conversations`, `/api/conversations/:id[/messages]`, `/api/conversations/unread` | buyer or shop in the conversation |
| GET/POST/PATCH | `/api/seller/coupons[/:id]` | shop owner: discount codes |
| POST/DELETE | `/api/products/:id/feature` | shop owner: feature on the home page (3 at a time, 7 days) |
| POST/GET/PATCH | `/api/price-requests`, `/mine`, `/shop`, `/:id/respond`, `/:id/accept` | wholesale price requests |
| GET | `/api/seller/statement?month=YYYY-MM` | shop owner: delivered parcels, commission, payout |
| GET/DELETE | `/api/me/export`, `/api/me` | signed in: download or delete your data |

## Configuration and deployment

Copy `server/.env.example` to `server/.env` to change settings. For production:

1. Create a Postgres database (e.g. Neon, Supabase or Render) and set `DATABASE_URL`.
2. Set `NODE_ENV=production` and `UPLOAD_DIR` to persistent storage.
3. `npm run build`, then `npm run server`. The API serves the built app too, so one process is enough.

The app can be installed on phones ("Add to home screen" / the Install button) once it is served over HTTPS.
The service worker only runs in production builds, so it never serves stale files during development.

## Selling tools

- **Messages:** buyers ask a shop about a product; both sides see unread counts. Messages poll every few seconds;
  there is no live connection yet.
- **Discount codes:** percent or Kwacha off, optional minimum spend, total uses and last day; each customer can use
  a code once. Codes apply only to the issuing shop's products.
- **Featured listings:** up to 3 products per shop, 7 days at a time, shown on the home page with a "Featured"
  label. Free during launch (see `FEATURED_LIMIT` and `FEATURED_DAYS` in `src/data/fees.js`).
- **Wholesale price requests:** a buyer asks for a price on a quantity; the shop answers with a price valid for
  1–14 days; the buyer accepts and can order exactly that quantity at that price, once.
- **Receipts and statements:** printable buyer receipts show each shop's TPIN and the VAT included for
  VAT-registered shops. Monthly seller statements show commission (`COMMISSION_RATE`, a placeholder 5%) and payout.

## Delivery options ([src/data/couriers.js](src/data/couriers.js))

| Option | Same town | Same province | Other province |
| --- | --- | --- | --- |
| Collect from shop | ✓ | ✓ | ✓ |
| Shop's own delivery (shop sets its own fees) | ✓ | ✓ | |
| Yango Delivery (listed towns only) | ✓ | | |
| Platinum Couriers | ✓ | ✓ | ✓ |
| Intercity bus parcel | | ✓ | ✓ |
| Zampost EMS | ✓ | ✓ | ✓ |

Base fees cover a parcel up to 5 kg; heavier parcels pay a per-kg rate, and couriers with a weight limit
(e.g. Yango 20 kg, Zampost 30 kg) are not offered for heavier parcels. Every product has a weight per unit.
Fees, per-kg rates, limits and delivery times are **placeholders**. Replace them with the rates agreed with
each courier.

## Search

Search runs in Postgres with the `pg_trgm` extension: it tolerates typos in what the shopper typed (solr → Solar,
chitenje → Chitenge), understands local words listed in [src/data/search.js](src/data/search.js) (nshima → mealie
meal, tekkies → sneakers), and matches shop names, towns (`kitwe` → products sold in Kitwe) and categories. Add
synonyms to that file as you learn how customers search.

## Bulk upload

Shop owners can upload a CSV (saved from Excel or Google Sheets) from the dashboard. Columns: `name, category,
price, was_price, stock, weight_kg, low_stock_at, made_in_zambia, wholesale, options, description`. Wholesale
looks like `10:90; 50:80` and options like `Size=S|M|L; Colour=Black|Blue`. A template can be downloaded from
the dashboard.

## Still to do before launch

- **SMS provider** for sign-in codes. In production (`NODE_ENV=production`) codes are only written to the server
  log, so nobody can sign in until this is connected (see `consoleSms` in `server/auth.js`).
- **Mobile Money and card payments**: orders paid by MoMo or card are currently recorded as paid without charging
  anyone. Needs a payment provider, held funds until delivery, and seller payouts.
- **Notifications** to sellers about new orders and to buyers about dispatch.
- **Admin panel** for seller verification, moderation and disputes (including returns).
- **Legal review:** the pages under `/legal` are drafts and must be reviewed by a Zambian lawyer. Register with the
  Office of the Data Protection Commissioner as required.
- **Tax:** receipts are not ZRA Smart Invoices. Shops that must issue fiscal invoices still need to do so, and
  Amasampo's own commission invoicing needs ZRA integration.
- **Commission rate:** set the real rate in `src/data/fees.js`.
- **Photo storage** in object storage (S3-compatible) for multi-server hosting; photos are currently saved to disk.
- A search index (e.g. a trigram index over product name, description and shop) once the catalogue reaches tens of
  thousands of products. Synonym and town matching currently scan the product table.
