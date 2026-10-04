import { randomBytes } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details; // extra JSON for the client, e.g. per-row errors of a bulk upload
  }
}

// Validates request data against a zod schema, answering 400 with the first problem found.
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, result.error.issues[0].message);
  return result.data;
}

export const newId = (prefix) => `${prefix}_${randomBytes(9).toString('base64url')}`;

// Human-friendly order numbers, e.g. AMS-7K2Q9XHD.
export const newOrderId = () =>
  `AMS-${[...randomBytes(8)].map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')}`;
