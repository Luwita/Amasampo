// Sends a test SMS with the settings in server/.env, to check the Africa's Talking connection.
//   npm run sms:test -- 0977123456
import { normalizePhone } from '../src/utils/format.js';
import { smsFromEnv } from '../server/sms.js';

const phone = normalizePhone(process.argv[2] ?? '');
if (!/^[79]\d{8}$/.test(phone)) {
  console.log('Give a Zambian mobile number: npm run sms:test -- 0977123456');
  process.exit(1);
}
const sms = smsFromEnv();
if (sms.provider === 'console') {
  console.log("No SMS provider set. Add AT_USERNAME and AT_API_KEY to server/.env (see server/.env.example).");
  process.exit(1);
}
try {
  const result = await sms.send(phone, 'Zed Market test message: your SMS connection works.');
  console.log(`Sent with ${sms.provider} to 0${phone}${result?.cost ? ` (cost ${result.cost})` : ''}.`);
} catch (err) {
  console.log(`Not sent: ${err.message} See the reason above.`);
  process.exit(1);
}
