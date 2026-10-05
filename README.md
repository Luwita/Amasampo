# Zed Market

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
| POST | `/api/orders/:id/shipments/:shopId/cancel` | buyer or shop, before the parcel is sent |
| POST/GET/PATCH | `/api/cases`, `/mine`, `/shop`, `/:id`, `/:id/respond`, `/:id/escalate`, `/:id/withdraw` | returns and missing parcels |
| GET/POST | `/api/seller/verification`, `/api/seller/removed-products` | shop owner |
| * | `/api/admin/...` | staff only (see Admin panel) |

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

## Cancellations, returns and disputes

- Buyers (or the shop) can cancel a parcel until it is sent. Stock, the discount-code use and any agreed wholesale
  price are given back, and a refund is recorded if the buyer paid.
- Within 7 days of delivery the buyer can report a problem with items (with photos), or a parcel that never arrived
  once it has been sent. The shop accepts (refund, replacement or repair) or rejects with a reason.
- If the shop rejects, or doesn't answer within 3 days, the buyer can escalate to Zed Market staff, who decide.
- Refunds are recorded as "due". Until payouts are automated, staff pay them by Mobile Money or bank and record the
  reference. Return refunds are deducted on the shop's monthly statement, with the commission on those goods given
  back.

## Admin panel

Staff use `/admin` and land there when they sign in. Staff accounts run the marketplace: they can't open or own a
shop (a shop owner who joins the team needs a different phone number).

- **Owners** are the numbers in `ADMIN_PHONES` (in `server/.env`), checked on every request, so removing a number
  takes away access immediately. Owners can't be suspended or removed from inside the app.
- **Staff** are added and removed by owners in the **Staff** tab. They can do everything else in the panel.
- **Settings** (owners only): commission rate, welcome and referral voucher amounts, voucher minimum spend and how
  long vouchers last. Each order keeps the commission rate in force when it was placed, so a change never rewrites
  past statements or payouts. Every change is in the activity log.
- **Acting for a shop**: staff can edit a shop's details or any listing, and mark parcels sent or delivered (e.g. when
  a courier confirms by phone). Each needs a reason, which the shop is told and the log keeps.

- **Overview** of what needs attention: disputes, refunds to pay, shops to verify, parcels not sent after 2 days.
- **Shops**: every new shop waits for approval before buyers can see it. Applicants give their full name, NRC
  number and optional PACRA number. Staff approve (the shop goes live with a ✓ badge) or reject with a note the owner
  sees; the owner can correct their details and resubmit. While waiting, owners can already add products. Staff can
  also suspend a live shop (hides all products and stops orders) or restore it.
- **Listings and reviews**: remove with a reason the seller can see; restore listings.
- **Users**: suspend (signs them out everywhere and blocks sign-in) or restore.
- **Orders**: find by order number, name or phone; cancel parcels, including ones already with a courier.
- **Disputes** and **Refunds** as described above.
- **Analytics**: sales (GMV), commission earned, customers, new shops, vouchers and refunds for the last 7/30/90/365
  days, a sales-per-day chart, and breakdowns by province, shop, category, payment method and courier. Download as CSV.
- **Payouts**: what Zed Market owes each shop. Online payments earn the shop goods + delivery − commission; for cash
  on delivery the shop already holds the cash, so it owes the commission and gets back any Zed Market voucher. Money
  stays on hold for 7 days after delivery and while a return is open. Staff record each Mobile Money or bank payout
  with its reference (never more than is available); the shop is notified and sees its balance and history under
  Report in the seller dashboard.
- **Marketing**: home page banners (shown before the standard slides, with an end date), voucher campaigns paid
  for by Zed Market (everyone, shoppers, shop owners, one province or one phone number; group sends need a second
  click), and announcements to the 🔔 bell.
- **Buying requests**: remove spam or prohibited requests with a reason the buyer sees.
- **Support**: questions sent from the Help page; staff reply (the customer gets a notification) and close them.
- **Activity log**: every staff action with who did it and why.

NRC numbers are personal data: they are only visible to staff and the shop owner, and ID photos are deliberately not
collected (uploaded files are reachable by URL).

## Shopping features

- **Notifications** (🔔 in the header, with red counters): new orders and parcels to send for shops; dispatch,
  ready to collect, delivery, cancellations, returns, refunds, offers and price quotes for buyers; approval
  decisions for shop owners. Messages and My shop show their own counters.
- **Help & support** (`/help`): quick answers plus a chat with Zed Market staff.
- **Buying requests** (`/requests`): a buyer posts what they need (quantity, budget, town); approved shops send a
  price per unit; the buyer accepts one and messages the shop.
- **Invite & vouchers** (My account): every customer has an invite code and share link (`/login?ref=CODE`). A friend
  who joins with it gets a K50 voucher; the inviter gets K50 when the friend's first order is delivered. Vouchers
  are paid for by Zed Market (not the shop), need K300 of products, last 60 days, and come back if the whole order
  is cancelled. Amounts are in [src/data/fees.js](src/data/fees.js).
- **Zed Market Points**: collection points where any shop can send a parcel for the buyer to collect. The list in
  [src/data/pickupPoints.js](src/data/pickupPoints.js) is a **placeholder**; replace it with real partner outlets.
- **Resell in my shop**: a shop owner can list another shop's product in their own shop with a 15% margin to
  start from. They buy it from the supplier (or use their own stock) and send it themselves.
- **Shop pages**: cover photo, about text, opening hours, directions (Google Maps) and share buttons
  (WhatsApp, Facebook, copy link) on shops, products and requests.
- **Batch actions**: tick the cart items to buy now (the rest stay in the cart), save or remove several at once,
  "Buy again" on past orders, and mark several parcels as sent in one go in the seller dashboard.

## Delivery options ([src/data/couriers.js](src/data/couriers.js))

| Option | Same town | Same province | Other province |
| --- | --- | --- | --- |
| Collect from shop | ✓ | ✓ | ✓ |
| Shop's own delivery (shop sets its own fees) | ✓ | ✓ | |
| Yango Delivery (listed towns only) | ✓ | | |
| Platinum Couriers | ✓ | ✓ | ✓ |
| Intercity bus parcel | | ✓ | ✓ |
| Zampost EMS | ✓ | ✓ | ✓ |
| Zed Market Point (towns with a point) | ✓ | ✓ | ✓ |

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
- **SMS/WhatsApp copies of notifications**: notifications are in the app only for now.
- **Legal review:** the pages under `/legal` are drafts and must be reviewed by a Zambian lawyer. Register with the
  Office of the Data Protection Commissioner as required.
- **Tax:** receipts are not ZRA Smart Invoices. Shops that must issue fiscal invoices still need to do so, and
  Zed Market's own commission invoicing needs ZRA integration.
- **Commission rate:** set the real rate in `src/data/fees.js`.
- **Photo storage** in object storage (S3-compatible) for multi-server hosting; photos are currently saved to disk.
- A search index (e.g. a trigram index over product name, description and shop) once the catalogue reaches tens of
  thousands of products. Synonym and town matching currently scan the product table.
