import { HttpError } from './http.js';

// Sends text messages. Phones are stored as 9 digits (e.g. 977123456); Zambia's country code is added here.
//
// With AT_USERNAME and AT_API_KEY set, messages go through Africa's Talking (https://africastalking.com).
// Use AT_USERNAME=sandbox to test with the Africa's Talking simulator before going live.
// Without them, messages are printed in the server window (development).

const LIVE_URL = 'https://api.africastalking.com/version1/messaging';
const SANDBOX_URL = 'https://api.sandbox.africastalking.com/version1/messaging';
// Africa's Talking status codes that mean the message was accepted: Processed, Sent, Queued.
const ACCEPTED = new Set([100, 101, 102]);

export const consoleSms = {
  provider: 'console',
  async send(phone, message) {
    console.log(`[sms] to 0${phone}: ${message}`);
  },
};

export function africasTalkingSms({ username, apiKey, senderId = '', fetchImpl = fetch }) {
  const url = username === 'sandbox' ? SANDBOX_URL : LIVE_URL;
  return {
    provider: username === 'sandbox' ? "Africa's Talking (sandbox)" : "Africa's Talking",
    async send(phone, message) {
      const body = new URLSearchParams({ username, to: `+260${phone}`, message });
      if (senderId) body.set('from', senderId);
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(15000),
        });
      } catch (err) {
        console.error(`[sms] Africa's Talking unreachable: ${err.message}`);
        throw new HttpError(502, "We couldn't send the SMS just now. Please try again in a minute.");
      }
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        // Errors such as a wrong API key come back as plain text.
      }
      const recipient = data?.SMSMessageData?.Recipients?.[0];
      if (!res.ok || !recipient || !ACCEPTED.has(Number(recipient.statusCode))) {
        console.error(
          `[sms] Africa's Talking refused the message to 0${phone}: HTTP ${res.status} ${recipient?.status ?? data?.SMSMessageData?.Message ?? text}`,
        );
        throw new HttpError(502, "We couldn't send the SMS just now. Please try again in a minute.");
      }
      return { id: recipient.messageId, cost: recipient.cost };
    },
  };
}

// Picks the SMS provider from the environment (server/.env).
export function smsFromEnv(env = process.env) {
  if (env.AT_USERNAME && env.AT_API_KEY) {
    return africasTalkingSms({ username: env.AT_USERNAME.trim(), apiKey: env.AT_API_KEY.trim(), senderId: env.AT_SENDER_ID?.trim() });
  }
  return consoleSms;
}
