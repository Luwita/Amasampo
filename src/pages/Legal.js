import { Link, NavLink, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import * as api from '../api';
import { COMMISSION_RATE } from '../data/fees';

// The commission rate staff have set (it can change; past orders keep the rate they were placed at).
function CommissionRate() {
  const [rate, setRate] = useState(COMMISSION_RATE);
  useEffect(() => {
    api
      .settings()
      .then((s) => setRate(s.commissionRate))
      .catch(() => {});
  }, []);
  return `${Math.round(rate * 1000) / 10}%`;
}

// Draft policies. They must be reviewed by a Zambian lawyer before launch.
const UPDATED = '4 October 2026';

const docs = {
  terms: {
    title: 'Terms of use',
    body: (
      <>
        <p>
          These terms apply when you use Zed Market, an online marketplace operated by Zed Market Zambia ("we", "us")
          that connects buyers with independent shops in Zambia. By creating an account or placing an order you agree to
          them.
        </p>
        <h2>1. Who sells to you</h2>
        <p>
          Products are sold by the shops listed on each product page, not by Zed Market. The shop is responsible for the
          product, its description and its delivery. We run the platform and help resolve problems. You pay the shop
          directly; Zed Market does not hold your money.
        </p>
        <h2>2. Your account</h2>
        <p>
          You sign in with a Zambian mobile number and a one-time code. Keep your phone secure: anyone with access to
          your number can use your account. You must be 18 or older, or use Zed Market with a parent or guardian.
        </p>
        <h2>3. Prices, payment and delivery</h2>
        <ul>
          <li>Prices are in Zambian Kwacha and are set by each shop. Delivery fees are shown before you pay.</li>
          <li>
            When you pay by Mobile Money, you send the money to the shop's Mobile Money number shown on your order,
            and the shop sends your parcel once the money arrives. Pay on Delivery is paid directly to the shop or its
            courier.
          </li>
          <li>Delivery times are estimates given by the shop and the courier.</li>
          <li>Discount codes and agreed wholesale prices can be used once and only before they expire.</li>
        </ul>
        <h2>4. Returns and problems</h2>
        <p>
          See our <Link to="/legal/returns">returns policy</Link>. Your rights under the Competition and Consumer
          Protection Act are not affected.
        </p>
        <h2>5. Reviews and messages</h2>
        <p>
          Reviews must be honest and about your own purchase. Messages must not be abusive, contain spam or ask for
          payment outside Zed Market. We may remove content and suspend accounts that break these rules.
        </p>
        <h2>6. Liability</h2>
        <p>
          We work to keep Zed Market available and safe but cannot guarantee it will always be uninterrupted. Nothing in
          these terms limits liability that cannot be limited under Zambian law.
        </p>
        <h2>7. Law</h2>
        <p>These terms are governed by the laws of the Republic of Zambia.</p>
      </>
    ),
  },
  privacy: {
    title: 'Privacy policy',
    body: (
      <>
        <p>
          This policy explains how Zed Market Zambia collects and uses personal data, in line with the Data Protection
          Act No. 3 of 2021.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>Your name and mobile number, to create your account and send sign-in codes.</li>
          <li>Delivery details (name, phone, address, town) for each order.</li>
          <li>Your orders, reviews, messages with shops and price requests.</li>
          <li>For shop owners: shop name, location, phone, and TPIN if provided.</li>
          <li>
            On your device only: your cart, saved items, chosen location and low-data setting. These are not sent to us
            except when you place an order.
          </li>
        </ul>
        <h2>How we use it</h2>
        <ul>
          <li>To run your account, process orders and arrange delivery.</li>
          <li>
            To share what a shop needs to fulfil your order (name, phone, delivery address), and to pass parcels to
            couriers.
          </li>
          <li>To prevent fraud and keep the marketplace safe.</li>
        </ul>
        <p>We do not sell your personal data.</p>
        <h2>Your rights</h2>
        <p>You can:</p>
        <ul>
          <li>
            get a copy of your data at any time from <Link to="/account?tab=privacy">My account → Privacy & data</Link>;
          </li>
          <li>ask us to correct it;</li>
          <li>
            delete your account from the same page. Order records are kept without your name or contact details, because
            shops need them for their accounts;
          </li>
          <li>complain to the Office of the Data Protection Commissioner.</li>
        </ul>
        <h2>Keeping data safe</h2>
        <p>
          Sign-in codes and session keys are stored only in hashed form. Access to personal data is limited to the
          people who need it.
        </p>
        <h2>Contact</h2>
        <p>privacy@zedmarket.co.zm · Cairo Road, Lusaka</p>
      </>
    ),
  },
  sellers: {
    title: 'Seller terms',
    body: (
      <>
        <p>These terms apply to shops selling on Zed Market, in addition to the general terms of use.</p>
        <h2>Fees</h2>
        <p>
          Listing products is free. Zed Market charges a commission of <CommissionRate /> on the value
          of goods delivered (after any discount you offer). The rate that applies is the one in force when the order is placed. Delivery fees are passed to you in full, and you pay the
          courier you choose. Your monthly statement in the dashboard shows each order, the commission and your payout.
        </p>
        <h2>Your responsibilities</h2>
        <ul>
          <li>Only list genuine products you have in stock, with honest descriptions, photos and weights.</li>
          <li>Send parcels promptly and enter the courier's tracking or waybill number.</li>
          <li>Honour the prices, discount codes and wholesale prices you offer.</li>
          <li>Keep buyers' personal data private and use it only to fulfil their orders.</li>
          <li>Meet your own tax obligations, including VAT and issuing fiscal invoices where required by ZRA.</li>
        </ul>
        <h2>Prohibited items</h2>
        <p>
          Counterfeit goods, stolen goods, weapons, drugs, prescription medicines without authorisation, and anything
          illegal in Zambia.
        </p>
        <h2>Featured listings</h2>
        <p>
          Featured products are labelled as featured. Featuring is free during launch; we will give notice before
          charging.
        </p>
        <h2>Suspension</h2>
        <p>We may suspend shops that break these terms, receive repeated complaints, or put buyers at risk.</p>
      </>
    ),
  },
  returns: {
    title: 'Returns & refunds',
    body: (
      <>
        <h2>7-day returns</h2>
        <p>
          If an item arrives damaged, faulty, incomplete or different from its description, contact the shop through
          Messages within 7 days of delivery. Keep the item and its packaging.
        </p>
        <h2>How it works</h2>
        <ol>
          <li>Tell the shop what is wrong and add photos if you can.</li>
          <li>The shop offers a replacement, repair or refund, usually within 3 working days.</li>
          <li>If you cannot agree, contact support@zedmarket.co.zm with your order number and we will step in.</li>
        </ol>
        <h2>Refunds</h2>
        <p>
          Refunds for Mobile Money payments go back to the number you paid with. Pay on Delivery orders are refunded
          to a Mobile Money number of your choice.
        </p>
        <h2>Not covered</h2>
        <p>
          Items damaged by misuse, perishable food once opened, and items made or cut to your order (for example fabric
          cut to length), unless they were faulty.
        </p>
      </>
    ),
  },
};

export default function Legal() {
  const { doc } = useParams();
  const page = docs[doc] ?? docs.terms;
  return (
    <div className="container section legal">
      <nav className="legal-nav">
        {Object.entries(docs).map(([id, d]) => (
          <NavLink key={id} to={`/legal/${id}`}>
            {d.title}
          </NavLink>
        ))}
      </nav>
      <article className="card document">
        <p className="draft-note">
          Draft for review: to be checked by a Zambian lawyer before Zed Market launches publicly.
        </p>
        <h1>{page.title}</h1>
        <p className="muted small">Last updated {UPDATED}</p>
        {page.body}
      </article>
    </div>
  );
}
