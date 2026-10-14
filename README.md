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
Node) and stores data in `server/.data/`. The marketplace starts empty: shop owners sign up and add their
products, and staff approve each shop before buyers can see it. To try it with demo shops and products instead, set
`SEED_DEMO=1` in `server/.env` before the first start.

To remove every shop, product and order (keeping user accounts, staff and settings), stop `npm run dev` and run
`npm run reset:catalog -- --yes`. A backup of the local database is saved in `server/.data/` first. Delete
`server/.data/` to start over completely.

Signing in uses a 6-digit code sent by SMS. While no SMS provider is connected, the code is printed in the API
terminal and shown on the sign-in screen (development only); once one is connected it is only sent by SMS.

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
  schema, applied automatically on start), `seed.js` (demo data, only with `SEED_DEMO=1`).
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
| POST | `/api/orders/:id/shipments/:shopId/payment-sent` | buyer: "I've paid" by Mobile Money, with an optional transaction ID |
| POST | `/api/orders/:id/shipments/:shopId/paid` | shop owner: the Mobile Money arrived; the parcel can now be sent |
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
2. Set `NODE_ENV=production`, `ADMIN_PHONES` and the Africa's Talking settings.
3. `npm run build`, then `npm run server`. The API serves the built app too, so one process is enough.

Product photos are stored in the database, so nothing needs a permanent disk. Node.js 22.9 or newer is needed.

### Render + Neon

[render.yaml](render.yaml) describes the service. In Render choose **New → Blueprint**, pick this repository, and
fill in the settings it asks for: `DATABASE_URL` (Neon's connection string), `ADMIN_PHONES`, `AT_USERNAME` and
`AT_API_KEY`. Every push to `main` deploys again; database changes are applied automatically when the server
starts. On Render's free plan the server sleeps after a while without visitors and takes up to a minute to wake.

The app can be installed on phones ("Add to home screen" / the Install button) once it is served over HTTPS.
The service worker only runs in production builds, so it never serves stale files during development.

## Expo app (iPhone and Android)

`mobile/` is an [Expo](https://expo.dev) app. It shows the phone layout of the web app full-screen from the Zed
Market server and adds the phone-app parts around it ([mobile/App.js](mobile/App.js)): safe areas, a launch screen,
the Android back button, the phone's share sheet, printing receipts, opening WhatsApp/phone/maps links in their own
apps, and a "can't connect" screen.

The phone layout itself is in the web app: [src/pages/HomeApp.js](src/pages/HomeApp.js) (banner, shortcuts,
categories, Retail/Wholesale feed), [src/components/TabBar.js](src/components/TabBar.js) and
[src/mobile.css](src/mobile.css). Going back to a list returns to the same place in it.

Expo Go on an iPhone only opens the project when the terminal (`npx expo login`) and Expo Go are signed in to the
same Expo account. If `npx expo login` crashes on Windows while opening the browser, run
`npx expo login -u your-username` instead.

To run it on your own phone, install **Expo Go** from the App Store or Play Store, connect the phone to the same
Wi-Fi as this computer, then:

```bash
npm run build && npm run server      # terminal 1: the website and API on port 4000
cd mobile && npm install && npx expo start   # terminal 2: shows a QR code
```

Scan the QR code (iPhone: Camera app; Android: inside Expo Go). The app finds the server on this computer by
itself. After changing the web app, run `npm run build` again and reopen the app.

For the App Store and Google Play, set `EXPO_PUBLIC_WEB_URL` to the hosted `https://` address
(see [mobile/.env.example](mobile/.env.example)) and build in Expo's cloud with `npx eas-cli@latest build`; no Mac
is needed for the build, but the App Store needs an Apple Developer account.

## Payments

There is no payment provider yet, so Zed Market never holds a buyer's money. Buyers choose one of two ways to pay:

- **Mobile Money, straight to the shop.** Every shop gives a Mobile Money number (network, number and the name it
  is registered in) when it opens; a shop can't be saved without one. After ordering, the buyer is shown and texted
  that number with the amount for each shop, sends the money, and taps **I've paid** (with the transaction ID if
  they have it). The shop checks its Mobile Money, taps **Payment received** in My shop → Orders, and only then can
  it mark the parcel as sent. An order from several shops is paid shop by shop.
- **Pay on Delivery**, with the couriers that allow it.

A shop's Mobile Money number is shown only to its owner, to staff, and to buyers on their own orders. Shops opened
before this was added see a reminder to add their number; until they do, buyers can only pay them on delivery.

Because shops collect the money themselves, the Payouts tab shows what each shop **owes** Zed Market (the
commission, as a negative balance) minus any Zed Market voucher its buyers used. Commission becomes due 7 days
after delivery, once the return window has passed. Owners save the Mobile Money number or bank account shops pay
it to (Admin → Payouts); each shop sees the amount and that number under My shop → Sales report. When the money
arrives, staff choose **Commission received** and enter the reference (never more than the shop owes), and
**Remind** sends the shop the amount and where to pay, in the app and by text. A shop that doesn't pay can be
suspended from the Shops tab. If a parcel is cancelled after the
shop confirmed the payment, a refund is recorded, the shop is told to send the money back, and staff mark the refund
as paid once it has. When a payment provider is added later, orders it collects use the `paid` status and are paid
out to shops as before.

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
  VAT-registered shops. Monthly seller statements show commission (set in Admin → Settings) and payout.

## Cancellations, returns and disputes

- Buyers (or the shop) can cancel a parcel until it is sent. Stock, the discount-code use and any agreed wholesale
  price are given back, and a refund is recorded if the shop had confirmed the buyer's payment.
- Within 7 days of delivery the buyer can report a problem with items (with photos), or a parcel that never arrived
  once it has been sent. The shop accepts (refund, replacement or repair) or rejects with a reason.
- If the shop rejects, or doesn't answer within 3 days, the buyer can escalate to Zed Market staff, who decide.
- Refunds are recorded as "due". The shop has the buyer's money, so staff ask the shop to send it back (or pay it
  and recover it from the shop) and record the reference. Return refunds are deducted on the shop's monthly
  statement, with the commission on those goods given back.

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
  A **Before you launch** list at the top shows what is still not set up (live SMS, commission rate, where shops
  pay commission, courier rates, Zed Market Points, shops without a Mobile Money number) and disappears when
  everything is done.
- **Shops**: every new shop waits for approval before buyers can see it. Applicants give their full name, NRC
  number and optional PACRA number. Staff approve (the shop goes live with a ✓ badge) or reject with a note the owner
  sees; the owner can correct their details and resubmit. While waiting, owners can already add products. Staff can
  also suspend a live shop (hides all products and stops orders) or restore it. Owners can **delete** a shop for
  good, with a reason: its parcels not yet delivered are cancelled and the buyers told, a shop that never sold
  anything is removed completely, and one with past orders is hidden but kept on record so buyers keep their order
  history and any commission it owes stays on the books. Either way the owner can open a new shop afterwards.
- **Listings and reviews**: remove with a reason the seller can see; restore listings.
- **Users**: suspend (signs them out everywhere and blocks sign-in) or restore.
- **Orders**: find by order number, name or phone; cancel parcels, including ones already with a courier.
- **Disputes** and **Refunds** as described above.
- **Analytics**: sales (GMV), commission earned, customers, new shops, vouchers and refunds for the last 7/30/90/365
  days, a sales-per-day chart, and breakdowns by province, shop, category, payment method and courier. Download as CSV.
- **Payouts**: the balance between Zed Market and each shop. Buyers pay shops directly (Mobile Money or on
  delivery), so the shop already holds the money: it owes the commission and gets back any Zed Market voucher. Money
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
  is cancelled. Owners change the amounts in Admin → Settings.
- **Zed Market Points**: collection points where any shop can send a parcel for the buyer to collect. Owners add the
  real partner outlets in Admin → Delivery. Until then the live site offers no points; the example points only show
  while developing on your own computer.
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
The values in [src/data/couriers.js](src/data/couriers.js) are only **starting values**. Owners enter the rates
agreed with each courier in **Admin → Delivery**: fee per distance, extra-kg rate, heaviest parcel, delivery times,
Yango towns, pay on delivery, or switch a courier off. Blank fees mean the courier doesn't cover that distance.
Saved rates are stored in the database and used by checkout and the server straight away; past orders keep the fee
they were charged. Each courier shows "⚠ not confirmed" until it has been saved.

## SMS (Africa's Talking)

Sign-in codes are sent by SMS through [Africa's Talking](https://africastalking.com). Set these in `server/.env`
(see `server/.env.example`) and restart the API:

| Setting | Testing | Live |
| --- | --- | --- |
| `AT_USERNAME` | `sandbox` | your app's username |
| `AT_API_KEY` | the sandbox API key | the live app's API key |
| `AT_SENDER_ID` | leave out | your approved sender ID (optional) |

**Testing with your own Android phone (free):** install [SMS Gateway for Android](https://sms-gate.app), turn on
**Cloud Server**, tap **Offline** so it says **Online**, and put the username and password it shows in `server/.env`
as `SMS_GATEWAY_USER` and `SMS_GATEWAY_PASS`. Texts are then sent from that phone's SIM at its normal SMS rate or
bundle. The phone must stay on and online, so use this for testing only; it takes priority over Africa's Talking
while the two lines are set.

The same connection also sends a text copy of the notifications people must not miss: new orders, Mobile Money
payment details and confirmations, parcels sent or ready to collect, cancellations, returns, refunds, payouts, price
quotes and offers, and decisions about a shop. Each is one plain SMS (160 characters). Vouchers, announcements,
listing changes and support replies stay in the app only, so a campaign to everyone never sends thousands of texts.
A text that can't be sent never blocks the order; the notification is still in the app.

Check the connection with `npm run sms:test -- 0977123456`. The API window shows which SMS provider is in use when it
starts. Without these settings, codes are printed in the API window instead. If a message can't be sent, the
person sees "We couldn't send the SMS" and can try again straight away; the reason is written in the API window.

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

- **SMS provider:** connected through Africa's Talking (see above); add your live `AT_USERNAME` and `AT_API_KEY`
  to `server/.env` before launch. Without them no sign-in code or order text is sent.
- **A payment provider** (Mobile Money collections and cards), so Zed Market can hold the money until delivery and
  pay shops out. Until then buyers pay shops directly (see Payments) and Zed Market cannot protect a payment.
- **Commission account:** save the Mobile Money number shops send their commission to in Admin → Payouts.
- **WhatsApp copies of notifications**: important notifications go by SMS; WhatsApp needs a WhatsApp Business account.
- **Legal review:** the pages under `/legal` are drafts and must be reviewed by a Zambian lawyer. Register with the
  Office of the Data Protection Commissioner as required.
- **Tax:** receipts are not ZRA Smart Invoices. Shops that must issue fiscal invoices still need to do so, and
  Zed Market's own commission invoicing needs ZRA integration.
- **Real delivery data:** enter courier rates and Zed Market Points in Admin → Delivery, and the commission rate in
  Admin → Settings. The admin Overview lists whichever of these are still missing.
- **Photo storage** in object storage (S3-compatible) for multi-server hosting; photos are currently saved to disk.
- A search index (e.g. a trigram index over product name, description and shop) once the catalogue reaches tens of
  thousands of products. Synonym and town matching currently scan the product table.
