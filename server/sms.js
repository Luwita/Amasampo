import { HttpError } from './http.js';

// Sends text messages. Phones are stored as 9 digits (e.g. 977123456); Zambia's country code is added here.
//
// With AT_USERNAME and AT_API_KEY set, messages go through Africa's Talking (https://africastalking.com).
// Use AT_USERNAME=sandbox to test with the Africa's Talking simulator before going live.
// With SMS_GATEWAY_USER and SMS_GATEWAY_PASS set, messages are sent by your own Android phone through the free
// "SMS Gateway for Android" app (https://sms-gate.app), using the phone's SIM. This is for testing only.
// Without any of them, messages are printed in the server window (development).

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

const GATEWAY_CLOUD_URL = 'https://api.sms-gate.app/3rdparty/v1/messages';

// Sends through an Android phone running SMS Gateway for Android. `url` is the app's cloud address, or the
// phone's own address (http://<phone ip>:8080/message) when the app runs in Local Server mode.
export function androidGatewaySms({ username, password, url = GATEWAY_CLOUD_URL, fetchImpl = fetch }) {
  return {
    provider: 'Android phone gateway',
    async send(phone, message) {
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ textMessage: { text: message }, phoneNumbers: [`+260${phone}`] }),
          signal: AbortSignal.timeout(15000),
        });
      } catch (err) {
        console.error(`[sms] Android gateway unreachable at ${url}: ${err.message}`);
        throw new HttpError(502, "We couldn't send the SMS just now. Please try again in a minute.");
      }
      const text = await res.text();
      if (!res.ok) {
        console.error(`[sms] Android gateway refused the message to 0${phone}: HTTP ${res.status} ${text.slice(0, 200)}`);
        throw new HttpError(502, "We couldn't send the SMS just now. Please try again in a minute.");
      }
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        // Accepted without details.
      }
      // The phone sends the text a moment later; `state` is usually Pending here.
      return { id: data?.id, state: data?.state };
    },
  };
}

// Picks the SMS provider from the environment (server/.env). The Android gateway wins when both are set,
// so it can be tried without removing the Africa's Talking keys.
export function smsFromEnv(env = process.env) {
  if (env.SMS_GATEWAY_USER && env.SMS_GATEWAY_PASS) {
    return androidGatewaySms({
      username: env.SMS_GATEWAY_USER.trim(),
      password: env.SMS_GATEWAY_PASS.trim(),
      url: env.SMS_GATEWAY_URL?.trim() || undefined,
    });
  }
  if (env.AT_USERNAME && env.AT_API_KEY) {
    return africasTalkingSms({ username: env.AT_USERNAME.trim(), apiKey: env.AT_API_KEY.trim(), senderId: env.AT_SENDER_ID?.trim() });
  }
  return consoleSms;
}
