import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { OrderStatus } from "@/lib/supabase";
import { reviewPayment, generateTransactionId } from "@/lib/payments";
import { PAYMENT_METHODS } from "@/lib/paymentConfig";
import { isFeatureOn } from "@/lib/featuresServer";

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────

const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

const STATUS_EMOJI: Record<string, string> = {
  payment_pending:  "💳",
  payment_review:   "🔍",
  confirmed:        "✅",
  preparing:        "👨‍🍳",
  packing:          "📦",
  on_route:         "🚗",
  ready_for_pickup: "🏪",
  delivered:        "🎉",
  cancelled:        "❌",
};

const STATUS_LABEL_EN: Record<string, string> = {
  payment_pending:  "Awaiting Payment",
  payment_review:   "Payment Under Review",
  confirmed:        "Confirmed",
  preparing:        "Being Prepared",
  packing:          "Packing",
  on_route:         "On the Way",
  ready_for_pickup: "Ready for Pickup",
  delivered:        "Delivered",
  cancelled:        "Cancelled",
};

// Admin commands → status mapping
const COMMAND_TO_STATUS: Record<string, OrderStatus> = {
  "/review":  "payment_review",
  "/confirm": "confirmed",
  "/prepare": "preparing",
  "/pack":    "packing",
  "/ship":    "on_route",
  "/pickup":  "ready_for_pickup",
  "/deliver": "delivered",
  "/cancel":  "cancelled",
};

// ─────────────────────────────────────────────────────────────
//  TELEGRAM HELPERS
// ─────────────────────────────────────────────────────────────

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN!;

async function sendMessage(chatId: string | number, text: string, keyboard?: object) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  };
  if (keyboard) body.reply_markup = keyboard;

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendPhoto(chatId: string | number, photoUrl: string, caption: string, keyboard?: object) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: "Markdown",
  };
  if (keyboard) body.reply_markup = keyboard;

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function inlineKeyboard(
  buttons: ({ text: string; callback_data: string } | { text: string; url: string })[][]
) {
  return { inline_keyboard: buttons };
}

// ─────────────────────────────────────────────────────────────
//  ADMIN HELPERS
// ─────────────────────────────────────────────────────────────

function isAdmin(chatId: string | number): boolean {
  return String(chatId) === String(ADMIN_CHAT_ID);
}

// ─────────────────────────────────────────────────────────────
//  CUSTOMER STATE (in-memory session — resets on redeploy)
//  For production, consider persisting to Supabase.
// ─────────────────────────────────────────────────────────────

interface CustomerSession {
  step:    "idle" | "browsing" | "cart" | "checkout_name" | "checkout_phone" | "checkout_delivery" | "checkout_address";
  cart:    { productId: string; nameEn: string; price: number; size: string; quantity: number }[];
  name?:   string;
  phone?:  string;
  delivery?: "pickup" | "delivery";
}

const sessions = new Map<string, CustomerSession>();

function getSession(chatId: string): CustomerSession {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { step: "idle", cart: [] });
  }
  return sessions.get(chatId)!;
}

function clearSession(chatId: string) {
  sessions.set(chatId, { step: "idle", cart: [] });
}

// ─────────────────────────────────────────────────────────────
//  CUSTOMER FLOWS
// ─────────────────────────────────────────────────────────────

// Customer ordering via the bot follows the same platform switch as the website cart
const ORDERING_CALLBACKS = ["cart", "checkout", "clear_cart", "delivery_pickup", "delivery_home"];

async function sendOrderingClosed(chatId: string) {
  const kb = inlineKeyboard([[{ text: "📋 View Menu", callback_data: "browse" }], [{ text: "◀️ Main Menu", callback_data: "menu" }]]);
  await sendMessage(chatId, "🛎️ Online ordering is not available. Please order at the front desk or ask our staff.", kb);
}

async function handleCustomerStart(chatId: string) {
  const canOrder = await isFeatureOn("online_ordering");
  const keyboard = inlineKeyboard([
    [{ text: canOrder ? "🛍️ Browse Products" : "📋 View Menu", callback_data: "browse" }],
    canOrder
      ? [{ text: "🛒 My Cart", callback_data: "cart" }, { text: "📦 Track Order", callback_data: "track_prompt" }]
      : [{ text: "📦 Track Order", callback_data: "track_prompt" }],
    [{ text: "ℹ️ About Entoto Haven", callback_data: "about" }],
  ]);

  await sendMessage(chatId,
    `🍽️ *Welcome to Entoto Haven!*\n\nFresh food and drinks made to order in Addis Ababa.\n\n_Choose an option below:_`,
    keyboard
  );
  getSession(chatId).step = "idle";
}

async function handleBrowse(chatId: string) {
  const canOrder = await isFeatureOn("online_ordering");
  const supabase = getSupabaseAdmin();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, size, price, image_url, category")
    .eq("is_active", true)
    .order("category")
    .order("price");

  if (!products?.length) {
    await sendMessage(chatId, "😔 No products available right now. Check back soon!");
    return;
  }

  await sendMessage(chatId, canOrder
    ? "🛍️ *Our Products*\n\nTap a product to add it to your cart:"
    : "📋 *Our Menu*\n\nTo order, visit the front desk or ask our staff.");

  for (const p of products) {
    const caption = `*${p.name}*${p.size ? ` — ${p.size}` : ""}\n💰 *${p.price.toLocaleString()} ብር*\n📦 ${p.category}`;
    const keyboard = inlineKeyboard([
      ...(canOrder ? [[{ text: `➕ Add to Cart`, callback_data: `add_${p.id}` }]] : []),
      [{ text: "◀️ Back to Menu", callback_data: "menu" }],
    ]);

    if (p.image_url) {
      await sendPhoto(chatId, p.image_url, caption, keyboard);
    } else {
      await sendMessage(chatId, caption, keyboard);
    }
  }
}

async function handleAddToCart(chatId: string, productId: string) {
  const session = getSession(chatId);
  const supabase = getSupabaseAdmin();

  const { data: product } = await supabase
    .from("products")
    .select("id, name, size, price")
    .eq("id", productId)
    .eq("is_active", true)
    .single();

  if (!product) {
    await sendMessage(chatId, "❌ Product not found or no longer available.");
    return;
  }

  const existing = session.cart.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    session.cart.push({
      productId: product.id,
      nameEn: product.name,
      price: product.price,
      size: product.size ?? "",
      quantity: 1,
    });
  }

  const total = session.cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const keyboard = inlineKeyboard([
    [{ text: "🛒 View Cart", callback_data: "cart" }, { text: "🛍️ Keep Shopping", callback_data: "browse" }],
    [{ text: "◀️ Main Menu", callback_data: "menu" }],
  ]);

  await sendMessage(chatId,
    `✅ *${product.name}* added!\n\n🛒 Cart total: *${total.toLocaleString()} ብር* (${session.cart.length} item${session.cart.length !== 1 ? "s" : ""})`,
    keyboard
  );
}

async function handleCart(chatId: string) {
  const session = getSession(chatId);

  if (session.cart.length === 0) {
    const keyboard = inlineKeyboard([[{ text: "🛍️ Browse Products", callback_data: "browse" }]]);
    await sendMessage(chatId, "🛒 Your cart is empty!\n\nBrowse our products to get started.", keyboard);
    return;
  }

  let msg = "🛒 *Your Cart*\n\n";
  let total = 0;
  for (const item of session.cart) {
    const lineTotal = item.price * item.quantity;
    total += lineTotal;
    msg += `• ${item.nameEn}${item.size ? ` (${item.size})` : ""} × ${item.quantity} = *${lineTotal.toLocaleString()} ብር*\n`;
  }
  msg += `\n💰 *Total: ${total.toLocaleString()} ብር*`;

  const keyboard = inlineKeyboard([
    [{ text: "✅ Checkout", callback_data: "checkout" }],
    [{ text: "🗑️ Clear Cart", callback_data: "clear_cart" }, { text: "🛍️ Keep Shopping", callback_data: "browse" }],
    [{ text: "◀️ Main Menu", callback_data: "menu" }],
  ]);

  await sendMessage(chatId, msg, keyboard);
}

async function handleCheckoutStart(chatId: string) {
  const session = getSession(chatId);
  if (session.cart.length === 0) {
    await handleCart(chatId);
    return;
  }
  session.step = "checkout_name";
  await sendMessage(chatId, "📋 *Checkout*\n\nStep 1/4 — Please enter your *full name*:");
}

async function handleTrackPrompt(chatId: string) {
  const session = getSession(chatId);
  session.step = "idle"; // Will handle next text as order number
  await sendMessage(chatId, "📦 *Track Your Order*\n\nPlease type your order number (e.g. `ORD-ABC123`):");
  // Mark that next message should be treated as order number
  session.step = "idle";
  sessions.set(chatId, { ...session, step: "idle", cart: session.cart, _tracking: true } as CustomerSession & { _tracking?: boolean });
}

async function handleTrackOrder(chatId: string, orderNumber: string) {
  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase
    .from("orders")
    .select("order_number, customer_name, status, total, created_at, delivery_type")
    .eq("order_number", orderNumber.toUpperCase())
    .single();

  if (!order) {
    await sendMessage(chatId, `❌ Order *${orderNumber.toUpperCase()}* not found.\n\nPlease check the order number and try again.`);
    return;
  }

  const emoji = STATUS_EMOJI[order.status] || "⏳";
  const label = STATUS_LABEL_EN[order.status] || order.status;
  const date = new Date(order.created_at).toLocaleDateString("en-ET");

  const keyboard = inlineKeyboard([[{ text: "◀️ Main Menu", callback_data: "menu" }]]);
  await sendMessage(chatId,
    `📦 *Order #${order.order_number}*\n\n` +
    `👤 ${order.customer_name}\n` +
    `${emoji} *Status: ${label}*\n` +
    `💰 Total: ${order.total.toLocaleString()} ብር\n` +
    `📅 Placed: ${date}\n` +
    `🚚 ${order.delivery_type === "pickup" ? "Pickup — In store" : "Home delivery"}`,
    keyboard
  );
}

// ─────────────────────────────────────────────────────────────
//  ADMIN FLOWS
// ─────────────────────────────────────────────────────────────

async function sendAdminHelp(chatId: string) {
  await sendMessage(chatId,
    `👋 *Entoto Haven Admin Bot*\n\n` +
    `*Order Commands:*\n` +
    `/orders — List 10 latest orders\n` +
    `/pending — Pending payment orders\n` +
    `/review [ORDER] — Mark payment under review\n` +
    `/confirm [ORDER] — Confirm payment (notifies staff to pack)\n` +
    `/reject [ORDER] [reason] — Payment not found (customer can re-upload)\n` +
    `/prepare [ORDER] — Start preparing\n` +
    `/pack [ORDER] — Mark as packed\n` +
    `/ship [ORDER] — Mark as on route\n` +
    `/pickup [ORDER] — Ready for pickup\n` +
    `/deliver [ORDER] — Mark as delivered\n` +
    `/cancel [ORDER] — Cancel order\n\n` +
    `*Dashboard:*\n` +
    `/dashboard — View today's stats\n` +
    `/revenue — Revenue summary\n` +
    `/lowstock — Low stock alerts`
  );
}

async function sendAdminDashboard(chatId: string) {
  const supabase = getSupabaseAdmin();
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const [
    { count: totalOrders },
    { data: todayOrders },
    { data: pendingOrders },
    { data: lowStock },
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("total, status").gte("created_at", todayStart),
    supabase.from("orders").select("id").eq("status", "payment_pending"),
    supabase.from("inventory_batches").select("id, quantity, product:products(name)").lt("quantity", 10),
  ]);

  const todaySales = (todayOrders ?? []).reduce((s, o) => s + (o.total ?? 0), 0);
  const todayCount = (todayOrders ?? []).length;
  const pendingCount = (pendingOrders ?? []).length;
  const date = new Date().toLocaleDateString("en-ET", { weekday: "long", month: "long", day: "numeric" });

  let msg = `📊 *Dashboard — ${date}*\n\n`;
  msg += `💰 Today's Revenue: *${todaySales.toLocaleString()} ብር*\n`;
  msg += `🛒 Today's Orders: *${todayCount}*\n`;
  msg += `📦 Total Orders: *${totalOrders ?? 0}*\n`;
  msg += `⏳ Pending Payment: *${pendingCount}*\n`;
  if ((lowStock?.length ?? 0) > 0) {
    msg += `\n⚠️ *Low Stock (${lowStock!.length} batch${lowStock!.length !== 1 ? "es" : ""})*\n`;
    lowStock!.slice(0, 3).forEach((b) => {
      const name = (b.product as unknown as { name: string } | null)?.name ?? "Unknown";
      msg += `  • ${name}: ${b.quantity} units\n`;
    });
  } else {
    msg += `\n✅ All stock levels OK`;
  }

  await sendMessage(chatId, msg);
}

async function sendAdminOrders(chatId: string, statusFilter?: string) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("orders")
    .select("order_number, customer_name, status, total, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: orders } = await query;

  if (!orders?.length) {
    await sendMessage(chatId, statusFilter ? `No orders with status "${statusFilter}".` : "No orders yet.");
    return;
  }

  let reply = statusFilter
    ? `📋 *Orders — ${STATUS_LABEL_EN[statusFilter] ?? statusFilter}*\n\n`
    : `📋 *Latest Orders*\n\n`;

  for (const o of orders) {
    const date = new Date(o.created_at).toLocaleDateString("en-ET");
    const emoji = STATUS_EMOJI[o.status] || "⏳";
    reply += `• *#${o.order_number}* — ${o.customer_name}\n  ${emoji} ${STATUS_LABEL_EN[o.status] || o.status} · ${o.total.toLocaleString()} ብር · ${date}\n`;
  }

  await sendMessage(chatId, reply);
}

async function sendRevenueSummary(chatId: string) {
  const supabase = getSupabaseAdmin();
  const now = new Date();

  const todayStart  = new Date(now.setHours(0,0,0,0)).toISOString();
  const weekStart   = new Date(now.getTime() - 7 * 86400000).toISOString();
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { data: today },
    { data: week },
    { data: month },
  ] = await Promise.all([
    supabase.from("orders").select("total").gte("created_at", todayStart).neq("status", "cancelled"),
    supabase.from("orders").select("total").gte("created_at", weekStart).neq("status", "cancelled"),
    supabase.from("orders").select("total").gte("created_at", monthStart).neq("status", "cancelled"),
  ]);

  const sum = (arr: { total: number }[] | null) => (arr ?? []).reduce((s, o) => s + (o.total ?? 0), 0);

  await sendMessage(chatId,
    `💰 *Revenue Summary*\n\n` +
    `📅 Today: *${sum(today).toLocaleString()} ብር* (${today?.length ?? 0} orders)\n` +
    `📆 This week: *${sum(week).toLocaleString()} ብር* (${week?.length ?? 0} orders)\n` +
    `🗓️ This month: *${sum(month).toLocaleString()} ብር* (${month?.length ?? 0} orders)`
  );
}

async function sendLowStockAlert(chatId: string) {
  const supabase = getSupabaseAdmin();
  const { data: lowStock } = await supabase
    .from("inventory_batches")
    .select("id, quantity, expires_at, product:products(name)")
    .lt("quantity", 10)
    .order("quantity", { ascending: true });

  if (!lowStock?.length) {
    await sendMessage(chatId, "✅ All stock levels are healthy! Nothing below 10 units.");
    return;
  }

  let msg = `⚠️ *Low Stock Alert — ${lowStock.length} batch${lowStock.length !== 1 ? "es" : ""}*\n\n`;
  for (const b of lowStock) {
    const name = (b.product as unknown as { name: string } | null)?.name ?? "Unknown";
    const expiry = b.expires_at ? `· expires ${new Date(b.expires_at).toLocaleDateString("en-ET")}` : "";
    const urgency = b.quantity <= 3 ? "🔴" : b.quantity <= 6 ? "🟡" : "🟠";
    msg += `${urgency} *${name}*: ${b.quantity} units ${expiry}\n`;
  }

  await sendMessage(chatId, msg);
}

// ─────────────────────────────────────────────────────────────
//  WEBHOOK HANDLER
// ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // Reject forged webhook calls. Set TELEGRAM_WEBHOOK_SECRET in .env.local and pass the
    // same value as `secret_token` when registering the webhook with Telegram (setWebhook).
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const body = await request.json();

    // ── Callback Query (inline button press) ──────────────────
    if (body.callback_query) {
      const query = body.callback_query;
      const chatId = String(query.message.chat.id);
      const data: string = query.data || "";

      // Acknowledge the callback
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: query.id }),
      });

      const isOrdering = ORDERING_CALLBACKS.includes(data) || data.startsWith("add_");
      if (isOrdering && !(await isFeatureOn("online_ordering"))) {
        await sendOrderingClosed(chatId);
        return NextResponse.json({ ok: true });
      }

      if (data === "menu")          { await handleCustomerStart(chatId); }
      else if (data === "browse")   { await handleBrowse(chatId); }
      else if (data === "cart")     { await handleCart(chatId); }
      else if (data === "checkout") { await handleCheckoutStart(chatId); }
      else if (data === "track_prompt") { await handleTrackPrompt(chatId); }
      else if (data === "about") {
        const kb = inlineKeyboard([[{ text: "◀️ Main Menu", callback_data: "menu" }]]);
        await sendMessage(chatId,
          `🥜 *About Entoto Haven*\n\nWe serve fresh food, made to order, in *Addis Ababa, Ethiopia*.\n\nEvery dish prepared fresh. No reheating. No shortcuts.\n\n📞 Contact us: /start\n🌐 Website: https://addisbites.com`,
          kb
        );
      }
      else if (data === "clear_cart") {
        const session = getSession(chatId);
        session.cart = [];
        session.step = "idle";
        const kb = inlineKeyboard([[{ text: "🛍️ Browse Products", callback_data: "browse" }]]);
        await sendMessage(chatId, "🗑️ Cart cleared.", kb);
      }
      else if (data.startsWith("add_")) {
        const productId = data.replace("add_", "");
        await handleAddToCart(chatId, productId);
      }
      // Admin callback: confirm / reject payment (admin chat only)
      else if (data.startsWith("approve_") || data.startsWith("reject_")) {
        if (!isAdmin(chatId)) return NextResponse.json({ ok: true });
        const confirming = data.startsWith("approve_");
        const orderNum = data.replace(/^(approve|reject)_/, "");
        const res = await reviewPayment({
          orderNumber: orderNum,
          decision: confirming ? "confirm" : "reject",
          actor: "telegram",
          reason: confirming ? undefined : "Payment not found",
        });
        // On success reviewPayment already posts the staff notification
        if (!res.ok) await sendMessage(chatId, `⚠️ ${res.error}`);
      }


      else if (data === "delivery_pickup") {
        const session = getSession(chatId);
        session.delivery = "pickup";
        session.step = "idle";
        await placeCustomerOrder(chatId, session, undefined);
      }
      else if (data === "delivery_home") {
        const session = getSession(chatId);
        session.delivery = "delivery";
        session.step = "checkout_address";
        await sendMessage(chatId, "📍 Step 4/4 — Enter your *delivery address*:\n\n_Example: Bole, near Edna Mall, building X_");
      }
      return NextResponse.json({ ok: true });
    }

    // ── Regular Message ───────────────────────────────────────
    const message = body?.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId  = String(message.chat.id);
    const text: string = (message.text || "").trim();
    const parts   = text.split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const arg     = parts[1]?.toUpperCase();

    // ── ADMIN COMMANDS ────────────────────────────────────────
    if (isAdmin(chatId)) {
      if (command === "/start" || command === "/help") {
        await sendAdminHelp(chatId);
        return NextResponse.json({ ok: true });
      }
      if (command === "/dashboard") {
        await sendAdminDashboard(chatId);
        return NextResponse.json({ ok: true });
      }
      if (command === "/revenue") {
        await sendRevenueSummary(chatId);
        return NextResponse.json({ ok: true });
      }
      if (command === "/lowstock") {
        await sendLowStockAlert(chatId);
        return NextResponse.json({ ok: true });
      }
      if (command === "/orders") {
        await sendAdminOrders(chatId);
        return NextResponse.json({ ok: true });
      }
      if (command === "/pending") {
        await sendAdminOrders(chatId, "payment_pending");
        return NextResponse.json({ ok: true });
      }

      // Payment review commands (go through the shared payment logic)
      if ((command === "/confirm" || command === "/approve_payment") && arg) {
        const res = await reviewPayment({ orderNumber: arg, decision: "confirm", actor: "telegram" });
        if (!res.ok) await sendMessage(chatId, `⚠️ ${res.error}`);
        return NextResponse.json({ ok: true });
      }
      if (command === "/reject" && arg) {
        const why = parts.slice(2).join(" ").trim() || "Payment not found";
        const res = await reviewPayment({ orderNumber: arg, decision: "reject", actor: "telegram", reason: why });
        if (!res.ok) await sendMessage(chatId, `⚠️ ${res.error}`);
        return NextResponse.json({ ok: true });
      }

      // Status update commands
      const newStatus = COMMAND_TO_STATUS[command];
      if (newStatus && arg) {
        const supabase = getSupabaseAdmin();
        const { data: order, error } = await supabase
          .from("orders")
          .select("id, order_number, customer_name, customer_phone, status")
          .eq("order_number", arg)
          .single();

        if (error || !order) {
          await sendMessage(chatId, `❌ Order *${arg}* not found.`);
          return NextResponse.json({ ok: true });
        }

        await supabase.from("orders").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", order.id);
        await supabase.from("order_status_log").insert({
          order_id: order.id,
          from_status: order.status,
          to_status: newStatus,
          changed_by: "admin_bot",
          note: `Updated via Telegram bot`,
        });

        const emoji = STATUS_EMOJI[newStatus] || "✅";
        await sendMessage(chatId,
          `${emoji} Order *#${arg}* → *${STATUS_LABEL_EN[newStatus]}*\n` +
          `👤 ${order.customer_name} (${order.customer_phone})`
        );
        return NextResponse.json({ ok: true });
      }

      if (text.startsWith("/")) {
        await sendMessage(chatId, "❓ Unknown command. Send /help for available commands.");
      }
      return NextResponse.json({ ok: true });
    }

    // ── CUSTOMER FLOWS ────────────────────────────────────────
    const session = getSession(chatId);

    // Handle /start or /menu
    if (command === "/start" || command === "/menu") {
      clearSession(chatId);
      await handleCustomerStart(chatId);
      return NextResponse.json({ ok: true });
    }

    // Handle multi-step checkout conversation
    if (session.step === "checkout_name") {
      session.name = text;
      session.step = "checkout_phone";
      await sendMessage(chatId, "📞 Step 2/4 — Enter your *phone number*:\n\n_Example: 0911234567_");
      return NextResponse.json({ ok: true });
    }

    if (session.step === "checkout_phone") {
      session.phone = text;
      session.step = "checkout_delivery";
      const keyboard = inlineKeyboard([
        [{ text: "🏪 Pickup (Free)", callback_data: "delivery_pickup" }],
        [{ text: "🚗 Home Delivery (+50 ብር)", callback_data: "delivery_home" }],
      ]);
      await sendMessage(chatId, "🚗 Step 3/4 — How would you like to receive your order?", keyboard);
      return NextResponse.json({ ok: true });
    }

    if (session.step === "checkout_address") {
      // Address entered, place order
      await placeCustomerOrder(chatId, session, text);
      return NextResponse.json({ ok: true });
    }

    // Handle delivery choice callback
    if ((session as CustomerSession & { _tracking?: boolean })._tracking && !text.startsWith("/")) {
      // User is tracking an order
      (session as CustomerSession & { _tracking?: boolean })._tracking = false;
      await handleTrackOrder(chatId, text);
      return NextResponse.json({ ok: true });
    }

    // Handle inline button presses that come as callbacks
    // (e.g. delivery type selection — handled via callback_query above normally)
    if (command === "/track") {
      if (arg) {
        await handleTrackOrder(chatId, arg);
      } else {
        await handleTrackPrompt(chatId);
      }
      return NextResponse.json({ ok: true });
    }

    // Default: show main menu
    await handleCustomerStart(chatId);
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true }); // Always 200 to Telegram
  }
}

// ─────────────────────────────────────────────────────────────
//  PLACE ORDER
// ─────────────────────────────────────────────────────────────

async function placeCustomerOrder(chatId: string, session: CustomerSession, address?: string) {
  if (!(await isFeatureOn("online_ordering"))) {
    clearSession(chatId);
    await sendOrderingClosed(chatId);
    return;
  }
  const supabase = getSupabaseAdmin();
  const subtotal = session.cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee = session.delivery === "delivery" ? (subtotal >= 500 ? 0 : 50) : 0;
  const total = subtotal + deliveryFee;

  const items = session.cart.map((i) => ({
    productId: i.productId,
    nameEn: i.nameEn,
    nameAm: i.nameEn, // fallback
    size: i.size,
    price: i.price,
    quantity: i.quantity,
  }));

  // Same optional-column / unique-id retry pattern as /api/checkout
  let transactionId: string | null = generateTransactionId();
  type NewOrder = { id: string; order_number: string };
  let order: NewOrder | null = null;
  let error: { message: string; code?: string } | null = null;

  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    const res = await supabase
      .from("orders")
      .insert({
        customer_name: session.name!,
        customer_phone: session.phone!,
        delivery_type: session.delivery ?? "pickup",
        delivery_address: address || null,
        items,
        subtotal,
        delivery_fee: deliveryFee,
        coins_applied: 0,
        total,
        payment_method: "telebirr",
        status: "payment_pending",
        ...(transactionId ? { transaction_id: transactionId } : {}),
      })
      .select("id, order_number")
      .single();

    if (!res.error && res.data) { order = res.data as NewOrder; break; }
    error = res.error;
    if (res.error?.code === "23505") { transactionId = generateTransactionId(); continue; }
    if (/transaction_id/i.test(res.error?.message ?? "")) { transactionId = null; continue; }
    break;
  }

  if (error || !order) {
    await sendMessage(chatId, "❌ Sorry, we couldn't place your order. Please try again or visit our website.");
    return;
  }

  // Notify admin (no Approve button yet — it arrives with the customer's payment proof)
  const adminMsg =
    `🆕 *New Order #${order.order_number}* (via Telegram)\n` +
    (transactionId ? `🔖 \`${transactionId}\`\n` : "") +
    `\n👤 ${session.name} · 📞 ${session.phone}\n` +
    `📍 ${session.delivery === "delivery" ? `Delivery to: ${address}` : "In-store Pickup"}\n\n` +
    `🛒 *Items:*\n` +
    items.map((i) => `  • ${i.quantity}× ${i.nameEn} (${i.size}) = ${(i.price * i.quantity).toLocaleString()} ብር`).join("\n") +
    `\n\n💰 Subtotal: ${subtotal.toLocaleString()} ብር\n` +
    `🚚 Delivery: ${deliveryFee} ብር\n` +
    `*TOTAL: ${total.toLocaleString()} ብር*\n_awaiting payment proof_`;

  await sendMessage(ADMIN_CHAT_ID, adminMsg);

  // Confirm to customer — payment proof is uploaded on the website pay page
  clearSession(chatId);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const payUrl = siteUrl ? `${siteUrl}/pay/${order.order_number}` : null;
  const kb = inlineKeyboard([
    ...(payUrl ? [[{ text: "💳 Pay & upload receipt", url: payUrl }]] : []),
    [{ text: "📦 Track Order", callback_data: "track_prompt" }],
    [{ text: "◀️ Main Menu", callback_data: "menu" }],
  ]);
  await sendMessage(chatId,
    `🎉 *Order Placed!*\n\n` +
    `Your order *#${order.order_number}* has been received.\n` +
    (transactionId ? `🔖 Payment reference: \`${transactionId}\`\n` : "") +
    `\n💳 Send *${total.toLocaleString()} ብር* by Telebirr (${PAYMENT_METHODS.telebirr.account}) or CBE (${PAYMENT_METHODS.cbe.account}) and put the reference in the remark.\n` +
    (payUrl ? `Then upload your receipt with the button below.` : `Then upload your receipt on our website: open *Track order* and enter #${order.order_number}.`),
    kb
  );
}

// Handle delivery type callback (needs to be in the callback_query handler above but also handle text fallback)
// This is triggered from inline keyboard "delivery_pickup" / "delivery_home"
// We add this in the callback_query section below — already included above

