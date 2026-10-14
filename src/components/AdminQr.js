import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useStore } from '../context/StoreContext';

// Sign-up links to print or share. The address is wherever this page is open, so a custom domain just works.
const CODES = [
  {
    id: 'shop-owners',
    title: 'Open your shop on Zed Market',
    who: 'For shop owners',
    path: '/login?join=seller',
    text: 'Scan to create your account and set up your shop. Zed Market reviews it before buyers see it.',
  },
  {
    id: 'customers',
    title: 'Shop local on Zed Market',
    who: 'For customers',
    path: '/login?join=buyer',
    text: 'Scan to create your account and shop from local sellers across Zambia.',
  },
];

// A printable poster: title, QR code, link and a line of text, as a PNG.
async function posterPng(code, url) {
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, url, { width: 640, margin: 2, errorCorrectionLevel: 'M' });
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(code.title, 400, 90);
  ctx.drawImage(qr, 80, 130, 640, 640);
  ctx.font = '26px system-ui, sans-serif';
  ctx.fillText(url.replace(/^https?:\/\//, ''), 400, 820);
  ctx.fillStyle = '#4b5563';
  ctx.font = '24px system-ui, sans-serif';
  const words = code.text.split(' ');
  let line = '';
  let y = 880;
  for (const w of words) {
    if (ctx.measureText(`${line} ${w}`).width > 680) {
      ctx.fillText(line, 400, y);
      line = w;
      y += 34;
    } else line = line ? `${line} ${w}` : w;
  }
  ctx.fillText(line, 400, y);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function QrCard({ code }) {
  const { notify } = useStore();
  const url = `${window.location.origin}${code.path}`;
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' })
      .then(setSvg)
      .catch(() => setSvg(''));
  }, [url]);

  const download = async () => {
    try {
      const blob = await posterPng(code, url);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `zed-market-${code.id}-qr.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      notify(`Couldn't make the picture: ${err.message}`);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copied');
    } catch {
      notify(url);
    }
  };

  return (
    <section className="card form-card qr-card">
      <span className="muted small">{code.who}</span>
      <h3>{code.title}</h3>
      {svg ? (
        <div className="qr-image" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="muted">Making the QR code…</p>
      )}
      <p className="small">
        <a href={url} className="link">
          {url}
        </a>
      </p>
      <p className="muted small">{code.text}</p>
      <div className="pdp-buttons">
        <button className="btn btn-primary btn-sm" onClick={download}>
          Download poster (PNG)
        </button>
        <button className="btn btn-outline btn-sm" onClick={copy}>
          Copy link
        </button>
        <a
          className="btn btn-outline btn-sm"
          href={`https://wa.me/?text=${encodeURIComponent(`${code.title}: ${url}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          Share on WhatsApp
        </a>
      </div>
    </section>
  );
}

// Admin → QR codes: sign-up codes for shop owners and customers, to print or share.
export function QrCodes() {
  return (
    <>
      <p className="muted small">
        Print these or share them on WhatsApp and Facebook. Scanning opens Zed Market on the sign-up screen: shop owners
        go on to set up their shop, customers can start shopping.
      </p>
      <div className="qr-grid">
        {CODES.map((c) => (
          <QrCard key={c.id} code={c} />
        ))}
      </div>
    </>
  );
}
