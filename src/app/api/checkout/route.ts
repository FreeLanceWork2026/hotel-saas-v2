import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { generateTransactionId } from "@/lib/payments";
import { checkStock, recordSale } from "@/lib/stock";
import { isFeatureOn } from "@/lib/featuresServer";

async function sendTelegram(message: string) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || !(await isFeatureOn("telegram"))) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    }),
  });
}

/** Escape Telegram legacy-Markdown specials in user-provided text. */
const md = (s: string) => s.replace(/([_*`\[])/g, "\\$1");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same rule as the cart page, POS and Telegram: free delivery from 500 ብር.
const deliveryFeeFor = (type: "pickup" | "delivery", subtotal: number) =>
  type === "delivery" ? (subtotal >= 500 ? 0 : 50) : 0;

// Columns added by later migrations. If one is missing in the DB we retry
// without it, so checkout can never break because of an un-run migration.
const OPTIONAL_COLUMNS = ["user_id", "transaction_id"] as const;

/**
 * POST /api/checkout — online order from the cart.
 * The client sends only WHAT it wants (product ids + quantities) and who it is.
 * Prices, delivery fee and total are always computed here from the database.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Support both customer storefront and older field names
    const customerName    = String(body.customerName  ?? body.name  ?? "").trim().slice(0, 80);
    const customerPhone   = String(body.customerPhone ?? body.phone ?? "").trim().slice(0, 30);
    const deliveryAddress = String(body.deliveryAddress ?? body.address ?? "").trim().slice(0, 200) || null;
    const deliveryType: "pickup" | "delivery" =
      (body.deliveryType ?? (deliveryAddress ? "delivery" : "pickup")) === "delivery" ? "delivery" : "pickup";
    const paymentMethod   = body.paymentMethod === "cbe" ? "cbe" : "telebirr";

    if (!customerName || !customerPhone) {
      return NextResponse.json(
        { success: false, error: "Customer name and phone are required." },
        { status: 400 }
      );
    }
    if (deliveryType === "delivery" && !deliveryAddress) {
      return NextResponse.json(
        { success: false, error: "Please enter your delivery address." },
        { status: 400 }
      );
    }

    // ── Items: quantities from the client, prices from the database ────
    const wanted = new Map<string, number>();
    for (const i of Array.isArray(body.items) ? body.items : []) {
      const productId = String(i?.productId ?? i?.id ?? "");
      const qty = Math.floor(Number(i?.quantity));
      if (!UUID_RE.test(productId) || !(qty > 0)) continue;
      wanted.set(productId, Math.min(999, (wanted.get(productId) ?? 0) + qty));
    }
    if (wanted.size === 0) {
      return NextResponse.json({ success: false, error: "Your cart is empty." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: products, error: prodErr } = await admin
      .from("products")
      .select("id, name, name_am, size, price, is_active")
      .in("id", [...wanted.keys()]);
    if (prodErr) {
      console.error("Checkout product lookup failed:", prodErr.message);
      return NextResponse.json({ success: false, error: "Could not load products. Please try again." }, { status: 500 });
    }

    const byId = new Map((products ?? []).map((p) => [p.id as string, p]));
    const items: { productId: string; nameEn: string; nameAm: string; size: string; price: number; quantity: number }[] = [];
    for (const [productId, quantity] of wanted) {
      const p = byId.get(productId);
      if (!p || p.is_active === false) {
        return NextResponse.json(
          { success: false, error: "An item in your cart is no longer available. Please refresh your cart." },
          { status: 409 }
        );
      }
      items.push({
        productId,
        nameEn: p.name as string,
        nameAm: (p.name_am as string | null) ?? (p.name as string),
        size: (p.size as string | null) ?? "",
        price: Number(p.price),
        quantity,
      });
    }

    const subtotal    = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const deliveryFee = deliveryFeeFor(deliveryType, subtotal);
    const total       = subtotal + deliveryFee;
    if (!(total > 0)) {
      return NextResponse.json({ success: false, error: "Your cart is empty." }, { status: 400 });
    }

    // ── Stock pre-flight: only enforced when stock tracking is active ──
    const stockLines = items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
    const sc = await checkStock(stockLines);
    if (!sc.ok && !sc.setupMissing) {
      const msgs: string[] = [];
      for (const p of sc.outOfStock) msgs.push(`"${p.name}" is out of stock`);
      for (const p of sc.insufficient)
        msgs.push(`"${p.name}" only has ${p.available} unit(s) left (you requested ${p.requested})`);
      return NextResponse.json(
        { success: false, error: msgs.join("\n"), stockError: true },
        { status: 409 }
      );
    }

    // Link to the signed-in customer when there is one
    let userId: string | null = null;
    try {
      const authClient = await createSupabaseServerClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    const baseRow: Record<string, unknown> = {
      customer_name:    customerName,
      customer_phone:   customerPhone,
      delivery_type:    deliveryType,
      delivery_address: deliveryType === "delivery" ? deliveryAddress : null,
      items,
      subtotal,
      delivery_fee:     deliveryFee,
      coins_applied:    0, // no server-side coin balance exists yet, so never trust a client discount
      total,
      payment_method:   paymentMethod,
      status:           "payment_pending",
    };

    const optional: Record<string, unknown> = {
      ...(userId ? { user_id: userId } : {}),
      transaction_id: generateTransactionId(),
    };

    // Insert with retries: drop unknown optional columns, regenerate on tx-id collision
    let order: { id: string; order_number: string } | null = null;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < 6 && !order; attempt++) {
      const { data, error } = await admin
        .from("orders")
        .insert({ ...baseRow, ...optional })
        .select("id, order_number")
        .single();

      if (!error && data) {
        order = data;
        break;
      }

      lastError = error?.message ?? "Order failed";
      const missing = OPTIONAL_COLUMNS.find(
        (c) => c in optional && new RegExp(`column .*${c}|${c}.* does not exist|'${c}'`, "i").test(lastError!)
      );
      if (missing) {
        delete optional[missing];
        continue;
      }
      // Unique violation on transaction_id → new random id and retry
      if (error?.code === "23505" && "transaction_id" in optional) {
        optional.transaction_id = generateTransactionId();
        continue;
      }
      break;
    }

    if (!order) {
      console.error("Supabase insert error:", lastError);
      return NextResponse.json({ success: false, error: "Could not place the order. Please try again." }, { status: 500 });
    }

    const orderNumber   = order.order_number;
    const transactionId = (optional.transaction_id as string | undefined) ?? null;

    // ── Stock deduction (FEFO) — reserved on order creation ─────────────
    // If the admin rejects the payment, recordReturn() restores it.
    const stockResult = await recordSale(stockLines, {
      orderId:     order.id,
      orderNumber,
      channel:     "online",
      actor:       userId ?? "customer",
    });
    if (stockResult.setupMissing) {
      console.warn("[checkout] stock_sell RPC missing — run phase25_stock.sql");
    } else if (!stockResult.ok) {
      console.error("[checkout] recordSale failed:", stockResult.error);
    }

    // Telegram notification
    let msg = `🆕 *New Order #${orderNumber}*\n`;
    if (transactionId) msg += `🔖 \`${transactionId}\`\n`;
    msg += `\n👤 *Name:* ${md(customerName)}\n`;
    msg += `📞 *Phone:* ${md(customerPhone)}\n`;
    msg += `📍 *${deliveryType === "delivery" ? "Delivery to" : "Pickup"}:* ${deliveryType === "delivery" ? md(deliveryAddress ?? "") : "In-store"}\n`;
    msg += `💳 *Payment:* ${paymentMethod} — _awaiting payment proof_\n\n`;
    msg += `🛒 *Items:*\n`;
    for (const item of items) {
      msg += `  • ${item.quantity}× ${md(item.nameEn)}${item.size ? ` (${md(item.size)})` : ""} = ${(item.price * item.quantity).toLocaleString()} ብር\n`;
    }
    msg += `\n💰 *Subtotal:* ${subtotal.toLocaleString()} ብር\n`;
    msg += `🚚 *Delivery:* ${deliveryFee} ብር\n`;
    msg += `━━━━━━━━━━━━━━━━\n`;
    msg += `*TOTAL: ${total.toLocaleString()} ብር*`;

    // Fire and forget — don't let Telegram failure block the response
    sendTelegram(msg).catch(console.error);

    return NextResponse.json({
      success: true,
      orderId: orderNumber,        // kept for backwards compatibility
      orderNumber,                 // human-readable order number
      orderDbId: order.id,         // UUID for internal use
      transactionId,               // e.g. NL-A8KQ2M7X (null until the migration is run)
      total,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Checkout error:", message);
    return NextResponse.json({ success: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
