// Dev-only Telegram poller.
// Telegram can only push button taps / messages to a public HTTPS webhook, so on
// localhost nothing arrives. This script long-polls Telegram and forwards each update
// to the local /api/telegram route, so Confirm/Reject buttons work while developing.
//
// Usage:  npm run tg:poll      (keep it running next to `npm run dev`)
// It refuses to run if a production webhook is registered (it would conflict).
import fs from "node:fs";
import path from "node:path";

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const TOKEN = env.TELEGRAM_BOT_TOKEN;
const TARGET = process.env.TARGET || "http://localhost:3000/api/telegram";
if (!TOKEN) { console.error("TELEGRAM_BOT_TOKEN missing in .env.local"); process.exit(1); }

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.json());

const info = await api("getWebhookInfo");
if (info.result?.url) {
  console.error(`A webhook is registered (${info.result.url}). Polling would conflict with it.`);
  console.error("Remove it first (only if you're sure) or just test against the deployed site.");
  process.exit(1);
}

console.log(`Polling Telegram → ${TARGET}  (Ctrl+C to stop)`);
let offset = 0;
for (;;) {
  try {
    const res = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
    if (!res.ok) { console.error("getUpdates error:", res.description); await new Promise((r) => setTimeout(r, 3000)); continue; }
    for (const upd of res.result) {
      offset = upd.update_id + 1;
      const kind = upd.callback_query ? `button ${upd.callback_query.data}` : `message ${upd.message?.text ?? ""}`.trim();
      try {
        const r = await fetch(TARGET, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(env.TELEGRAM_WEBHOOK_SECRET ? { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET } : {}),
          },
          body: JSON.stringify(upd),
        });
        console.log(`[${new Date().toLocaleTimeString()}] ${kind} → ${r.status}`);
      } catch (e) {
        console.error(`forward failed (${kind}):`, e.message);
      }
    }
  } catch (e) {
    console.error("poll error:", e.message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
