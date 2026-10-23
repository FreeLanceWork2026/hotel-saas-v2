// SERVER-SIDE ONLY — minimal Telegram helpers for payment notifications.
// (The webhook route has its own richer helpers; these are for lib code.)
import { isFeatureOn } from "@/lib/featuresServer";

const token = () => process.env.TELEGRAM_BOT_TOKEN;
const adminChat = () => process.env.TELEGRAM_CHAT_ID;

type Keyboard = { inline_keyboard: { text: string; callback_data: string }[][] };

async function call(method: string, body: Record<string, unknown>) {
  const t = token();
  if (!t || !(await isFeatureOn("telegram"))) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.error(`Telegram ${method} failed:`, err);
    return null;
  }
}

/** Message to the admin/staff chat. Never throws. `silent` = no sound/vibration. */
export async function notifyStaff(text: string, keyboard?: Keyboard, silent = false) {
  const chat_id = adminChat();
  if (!chat_id) return;
  await call("sendMessage", {
    chat_id,
    text,
    parse_mode: "Markdown",
    ...(silent ? { disable_notification: true } : {}),
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

/** Photo (by URL) with caption to the admin/staff chat. Falls back to text. */
export async function notifyStaffPhoto(photoUrl: string, caption: string, keyboard?: Keyboard, silent = false) {
  const chat_id = adminChat();
  if (!chat_id) return;
  const res = await call("sendPhoto", {
    chat_id,
    photo: photoUrl,
    caption,
    parse_mode: "Markdown",
    ...(silent ? { disable_notification: true } : {}),
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
  if (!res) await notifyStaff(caption, keyboard, silent);
}

export function reviewKeyboard(orderNumber: string): Keyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Confirm payment", callback_data: `approve_${orderNumber}` },
        { text: "❌ Reject", callback_data: `reject_${orderNumber}` },
      ],
    ],
  };
}
