import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { authRoutes, authenticate } from './auth.js';
import { HttpError } from './http.js';
import { catalogRoutes } from './routes/catalog.js';
import { accountRoutes } from './routes/account.js';
import { messageRoutes } from './routes/messages.js';
import { orderRoutes } from './routes/orders.js';
import { priceRequestRoutes } from './routes/priceRequests.js';
import { promotionRoutes } from './routes/promotions.js';
import { reviewRoutes } from './routes/reviews.js';
import { sellerRoutes } from './routes/seller.js';

export function createApp(db, { uploadDir, buildDir, sms, exposeCodes = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '3mb' })); // room for one base64 photo

  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ ok: true, db: db.kind });
  });

  app.use('/api', authenticate(db));
  app.use('/api/auth', authRoutes(db, { sms, exposeCodes }));
  app.use('/api', catalogRoutes(db, { uploadDir }));
  app.use('/api', reviewRoutes(db));
  app.use('/api/orders', orderRoutes(db));
  app.use('/api/seller', sellerRoutes(db));
  app.use('/api', promotionRoutes(db));
  app.use('/api/conversations', messageRoutes(db));
  app.use('/api/price-requests', priceRequestRoutes(db));
  app.use('/api/me', accountRoutes(db));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  app.use('/uploads', express.static(uploadDir, { maxAge: '30d', immutable: true }));

  // In production the same server also serves the built React app.
  if (buildDir && existsSync(buildDir)) {
    app.use(express.static(buildDir));
    app.get(/^(?!\/(api|uploads)\/).*/, (_req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Upload is too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (!(err instanceof HttpError)) console.error(err);
    const status = err instanceof HttpError ? err.status : 500;
    res
      .status(status)
      .json({ error: status === 500 ? 'Something went wrong on our side' : err.message, ...(err.details ?? {}) });
  });

  return app;
}
