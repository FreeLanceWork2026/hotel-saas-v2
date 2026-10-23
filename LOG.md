# Neil Lewz — Project Handoff Log

> **Last updated:** 2026-10-15  
> **Purpose:** This document captures *everything* about the Neil Lewz codebase so another AI (or developer) can continue the work without guessing.

---

## 1. What Is This Project?

**Neil Lewz** is a full-stack e-commerce + point-of-sale (POS) platform for a peanut-butter and natural-goods business based in **Addis Ababa, Ethiopia**. It includes:

- A **customer-facing online storefront** with product catalog, cart, ordering, and payment proof upload.
- A **kiosk POS terminal** for in-person sales at the physical store (used by employees on a tablet/phone).
- An **admin dashboard** for managing products, inventory, orders, payments, employees, announcements, activity logs, and reports.
- A **staff portal** for employees to view their assigned orders.
- **Telegram bot integration** for real-time payment notifications and admin-approved confirm/reject workflows.
- **Bilingual support** for English (en) and Amharic (am).
- **OCR-powered receipt verification** using Tesseract.js (client-side) to auto-read payment proofs from CBE and Telebirr screenshots.

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Framework** | Next.js (App Router) | 16.3.6 |
| **React** | React + React DOM | 19.2.8 |
| **Language** | TypeScript | ^5 |
| **Database** | Supabase (PostgreSQL) | — |
| **Auth** | Supabase Auth (Google OAuth + PIN sessions) | via `@supabase/ssr` ^0.12.7 |
| **Styling** | Vanilla CSS Modules | — |
| **i18n** | `next-intl` | ^4.14.7 |
| **Barcode/QR** | `jsbarcode`, `qrcode`, `html5-qrcode`, `barcode-detector` | various |
| **OCR** | `tesseract.js` | ^7.0.0 |
| **Icons** | `lucide-react` | ^1.48.0 |
| **Hosting** | Cloudflare Workers (via `@opennextjs/cloudflare`) | — |
| **Bot** | Telegram Bot API (long-poll in dev, webhook in production) | — |

### Key Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL          → Supabase project URL (public, baked into client bundle)
NEXT_PUBLIC_SUPABASE_ANON_KEY     → Supabase anon key (public, respects RLS)
SUPABASE_SERVICE_ROLE_KEY         → Supabase service key (server-only, bypasses RLS)

# Telegram
TELEGRAM_BOT_TOKEN                → Bot token for sending notifications
TELEGRAM_CHAT_ID                  → Admin/staff chat ID for alerts

# Google OAuth
GOOGLE_CLIENT_ID                  → Google OAuth client ID
GOOGLE_CLIENT_SECRET              → Google OAuth client secret

# Misc
SETUP_SECRET                      → Protects /api/setup and /api/migrate endpoints
NEXT_PUBLIC_SITE_URL              → Production URL (used for payment links in Telegram messages)
DATABASE_URL                      → Direct Postgres connection string (rarely used)
```

> **IMPORTANT:** The `.env.local` file contains all secrets. The `.env.production` file only contains `NEXT_PUBLIC_*` values safe for the build.

---

## 3. Project Structure

```
Neil Lewz/
├── database/
│   └── schema.sql              ← Master database schema (idempotent, run in Supabase SQL Editor)
├── messages/
│   ├── en.json                  ← English translation strings
│   └── am.json                  ← Amharic translation strings
├── public/
│   └── payments/
│       └── cbe-qr.png           ← Static CBE bank QR code image
├── reports/
│   └── ui-berry-annotator-feedback-report.md
├── scripts/
│   └── telegram-poll.mjs        ← Dev-only Telegram long-poller (npm run tg:poll)
├── sop/
│   └── ui-evaluation-sop.md     ← UI evaluation standard operating procedure
├── _reference/
│   └── nazareth/                ← Reference files (historical)
├── src/
│   ├── proxy.ts                 ← Next.js middleware (auth, RBAC, i18n, OAuth code-catchall)
│   ├── app/
│   │   ├── layout.tsx           ← Root layout (metadata, SEO, imports globals.css)
│   │   ├── auth/                ← OAuth callback handler
│   │   ├── api/                 ← API route handlers
│   │   │   ├── admin/           ← Product image upload/multi-image management
│   │   │   ├── checkout/        ← Online order checkout endpoint
│   │   │   ├── keep-alive/      ← Cron keep-alive route
│   │   │   ├── kiosk/           ← Kiosk order queue API
│   │   │   ├── me/              ← Current user info API
│   │   │   ├── migrate/         ← Schema migration endpoint (protected by SETUP_SECRET)
│   │   │   ├── payments/        ← Payment proof upload
│   │   │   ├── pos/sale/        ← POS sale submission endpoint
│   │   │   ├── setup/           ← Initial setup endpoint
│   │   │   └── telegram/        ← Telegram webhook handler (receives button callbacks)
│   │   └── [locale]/            ← Locale-wrapped routes (en/am)
│   │       ├── layout.tsx       ← Locale layout (providers: Theme, Cart, Toast, i18n, Announcements)
│   │       ├── page.tsx         ← Homepage (Hero, Trust, Process, Featured, FAQ, CTA)
│   │       ├── not-found.tsx    ← Custom 404 page
│   │       ├── login/           ← Login page (Google OAuth + redirect)
│   │       ├── shop/            ← Product listing + [id] detail page
│   │       ├── cart/            ← Shopping cart page
│   │       ├── order/           ← Order placement flow
│   │       ├── track/           ← Order tracking page
│   │       ├── how-its-made/    ← "How It's Made" content page
│   │       ├── (customer)/      ← Customer route group
│   │       │   ├── account/     ← Customer account/dashboard
│   │       │   └── pay/         ← /pay/[orderNumber] — payment instructions + proof upload
│   │       ├── kiosk/           ← POS kiosk terminal
│   │       │   ├── KioskClient.tsx       ← Main kiosk POS UI
│   │       │   ├── PinPad.tsx            ← PIN entry for kiosk login
│   │       │   ├── PosCheckout.tsx       ← POS checkout with OCR
│   │       │   ├── KioskOrderQueue.tsx   ← Operator's daily order queue
│   │       │   └── pinActions.ts         ← Server action for PIN verification
│   │       ├── staff/           ← Staff dashboard (employee view)
│   │       │   ├── StaffClient.tsx       ← Staff order management UI
│   │       │   └── sign-out/            ← Staff sign-out
│   │       └── admin/           ← Admin dashboard
│   │           ├── page.tsx              ← Admin dashboard home (stats cards)
│   │           ├── AdminShell.tsx        ← Admin layout shell
│   │           ├── AdminSidebar.tsx      ← Sidebar navigation
│   │           ├── products/             ← Product catalog CRUD
│   │           ├── inventory/            ← Stock ledger + labels sub-route
│   │           │   └── labels/           ← Barcode/QR label printing
│   │           ├── orders/               ← Order management
│   │           ├── payments/             ← Payment review queue
│   │           ├── employees/            ← Employee + account management
│   │           ├── announcements/        ← Announcement banner management
│   │           ├── activity/             ← Activity timeline (orders + stock)
│   │           ├── reports/              ← Sales/revenue reports
│   │           └── sign-out/             ← Admin sign-out
│   ├── components/
│   │   ├── AppShell.tsx                  ← Wraps Navbar + Footer around children
│   │   ├── customer/                     ← Customer-facing components
│   │   │   ├── Navbar.tsx / .module.css
│   │   │   ├── Footer.tsx / .module.css
│   │   │   ├── HeroSection.tsx / .module.css
│   │   │   ├── TrustSection.tsx / .module.css
│   │   │   ├── ProcessSnippet.tsx / .module.css
│   │   │   ├── FeaturedProducts.tsx / .module.css
│   │   │   ├── FeaturedProductsClient.tsx
│   │   │   ├── ProductCard.tsx / .module.css
│   │   │   ├── HomeFaq.tsx
│   │   │   ├── FaqAccordion.tsx / .module.css
│   │   │   ├── CtaSection.tsx / .module.css
│   │   │   ├── UserMenu.tsx / .module.css
│   │   │   └── AnnouncementBanner.tsx / .module.css
│   │   ├── scan/                         ← Barcode/QR scanning components
│   │   │   ├── BarcodeScanner.tsx / .module.css  ← Camera-based scanner (html5-qrcode)
│   │   │   └── useScanner.ts             ← USB/Bluetooth keyboard-wedge hook
│   │   ├── ui/                           ← Shared UI primitives
│   │   │   ├── LiveRefresh.tsx           ← Supabase realtime + polling fallback
│   │   │   ├── Modal.tsx / .module.css
│   │   │   ├── PageProgress.tsx / .module.css
│   │   │   ├── Skeleton.tsx / .module.css
│   │   │   ├── ThemeToggle.tsx / .module.css
│   │   │   └── Toast.tsx / .module.css
│   │   └── admin/                        ← (empty — admin components are colocated in routes)
│   ├── context/
│   │   ├── CartContext.tsx               ← Shopping cart state (localStorage-backed)
│   │   └── ThemeContext.tsx              ← Dark/light theme toggle (CSS custom properties)
│   ├── i18n/
│   │   ├── routing.ts                    ← Locale config: ["en", "am"], default "en", prefix "as-needed"
│   │   ├── request.ts                    ← Server-side message resolution
│   │   └── navigation.ts                ← Locale-aware Link, redirect, useRouter exports
│   ├── lib/
│   │   ├── supabase.ts                  ← CLIENT-SIDE Supabase client (anon key only)
│   │   ├── supabaseServer.ts            ← Server-side cookie-aware client + getCurrentUser()
│   │   ├── supabaseAdmin.ts             ← Server-side service-role client (lazy singleton)
│   │   ├── adminAuth.ts                 ← getAdminActor() — resolve admin for server actions
│   │   ├── payments.ts                  ← Payment review logic (confirm/reject, POS & online)
│   │   ├── stock.ts                     ← Stock ledger helpers (recordSale, recordReturn, checkStock)
│   │   ├── receiptParser.ts             ← OCR receipt text → reference/amount (CBE + Telebirr)
│   │   ├── paymentConfig.ts             ← Payment method config (Telebirr phone, CBE account)
│   │   ├── telegram.ts                  ← Telegram notifyStaff(), notifyStaffPhoto(), reviewKeyboard()
│   │   ├── kioskOperator.ts             ← Resolve kiosk operator (PIN or Google session)
│   │   ├── kioskSession.ts              ← HMAC-signed kiosk PIN session cookie
│   │   ├── barcode.ts                   ← Barcode/SKU generation utilities
│   │   ├── clientImage.ts               ← Client-side image resize/compress to WebP
│   │   └── products.ts                  ← Product query helpers
│   ├── styles/
│   │   └── globals.css                  ← Global CSS with design tokens (--a-* prefix)
│   └── types/                           ← (empty — types are colocated in their modules)
├── IMPLEMENTATION_PLAN.md               ← Master roadmap (phases 0–5, client requirements)
├── AGENTS.md                            ← Next.js agent rules (auto-generated by next dev)
├── CLAUDE.md                            ← Points to AGENTS.md
├── package.json
├── next.config.ts
├── tsconfig.json
└── eslint.config.mjs
```

---

## 4. Database Schema

The full schema lives in [`database/schema.sql`](database/schema.sql). It is **idempotent** (uses `IF NOT EXISTS` / `OR REPLACE`). Run the entire file in the Supabase SQL Editor to set up or update.

### Tables

| Table | Purpose |
|---|---|
| `products` | Product catalog (name, name_am, price, category, size, SKU, barcode, image_url, stock_qty, reorder_level, is_active, tag) |
| `product_images` | Multi-image gallery for products (url, storage_path, label, sort_order) |
| `orders` | All orders (online + POS). Contains `items` JSONB, `channel` ("online"/"pos"), `operator_id`, `transaction_id`, full lifecycle status |
| `payments` | Payment proof records per order. Includes OCR fields: `ocr_reference`, `ocr_amount`, `ocr_confidence`, `ocr_text`, `flags` JSONB, `source` ("online"/"pos") |
| `order_status_log` | Append-only audit trail for order status transitions (from_status → to_status, changed_by, note) |
| `profiles` | Extended user info linked to `auth.users`. Fields: `role` (admin/employee/kiosk_operator/customer), `first_name`, `last_name`, `phone`, `pin_hash`, `is_active` |
| `stock_lots` | Inventory lot/batch tracking (product_id, batch_code, qty_received, qty_remaining, unit_cost, expires_at, supplier, produced_by, source) |
| `stock_movements` | Append-only stock movement ledger (product_id, lot_id, order_id, delta, type, channel, actor, note) |
| `announcements` | Site-wide announcement banners (title, body, type, is_active, starts_at, ends_at) |

### Key RPC Functions (Postgres)

| Function | Purpose |
|---|---|
| `stock_receive(...)` | Add stock: creates a lot + movement + updates `products.stock_qty` |
| `stock_sell(...)` | Deduct stock in FEFO order (first-expiry-first-out): deducts from lots, creates movements, updates qty |
| `stock_return(p_order_id, ...)` | Reverse a sale's stock deductions (e.g., on order cancellation) |
| `stock_adjust(...)` | Manual stock correction (+/-) with reason |
| `stock_available(p_products UUID[])` | Returns `(product_id, on_hand)` for an array of product IDs |

### Row Level Security (RLS)

- All tables have RLS enabled
- `products`, `announcements`, `product_images` → public read, service_role write
- `orders` → owner read + service_role write
- `payments`, `stock_lots`, `stock_movements` → service_role only
- `profiles` → owner read + service_role write

---

## 5. Authentication & Authorization

### Auth Flow

1. **Google OAuth** — Primary login method. Supabase Auth handles the OAuth flow via `/auth/callback`.
2. **PIN Pad** — Kiosk operators enter a 4-digit PIN on the kiosk. The PIN is verified against `profiles.pin_hash` (bcrypt). A signed HMAC cookie (`nl_kiosk`) is set for 12 hours.

### Roles

| Role | Access |
|---|---|
| `admin` | Full access. Admin dashboard, all CRUD, payment review, employee management |
| `employee` | Staff dashboard (`/staff`), kiosk access |
| `kiosk_operator` | Kiosk access only (via PIN or Google) |
| `customer` | Customer account, order tracking, payment proof upload |

### Middleware (`src/proxy.ts`)

The middleware (exported as `proxy`) handles:
- **i18n routing** — `next-intl` locale detection and prefix management
- **OAuth stray-code catchall** — If `/?code=...` lands on the homepage, redirect to `/auth/callback`
- **Route protection** — `/admin/*` requires `admin` role; `/staff/*` requires `admin` or `employee`; `/account/*` requires any signed-in user
- **Kiosk bypass** — `/kiosk` is NOT protected in middleware; it handles its own auth (PIN or Google) internally

### Supabase Client Architecture

There are **three** Supabase client patterns:

1. **`supabase.ts`** — Client-side, uses anon key. For browser components that need to query public data.
2. **`supabaseServer.ts`** — Server-side, cookie-aware. Uses anon key but with user's session. For RSC/server actions needing user context.
3. **`supabaseAdmin.ts`** — Server-side, service-role key. Bypasses RLS. Lazy-initialized singleton (prevents build-time crashes). Used by all business logic (payments, stock, admin actions).

---

## 6. API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/checkout` | POST | Online order checkout — creates order + payment records, sends Telegram notification |
| `/api/pos/sale` | POST | POS sale submission — creates order with `channel: "pos"`, handles cash/digital payments, runs OCR, deducts stock |
| `/api/payments/proof` | POST | Payment proof image upload (customer uploads receipt screenshot) |
| `/api/telegram` | POST | Telegram webhook — processes button callbacks (approve/reject payment) and text commands |
| `/api/admin/product-image` | POST | Upload single product image to Supabase Storage |
| `/api/admin/product-images` | POST/DELETE | Multi-image management for products |
| `/api/kiosk/orders` | GET | Fetch kiosk operator's daily order queue |
| `/api/me` | GET | Returns current user info (role, name, email) |
| `/api/keep-alive` | GET | Cron endpoint to prevent cold starts |
| `/api/setup` | POST | Initial database setup (protected by `SETUP_SECRET`) |
| `/api/migrate` | POST | Schema migration endpoint (protected by `SETUP_SECRET`) |

---

## 7. Key Business Logic Files

### `src/lib/payments.ts` — Payment Review Engine
- **`generateTransactionId()`** — Creates `NL-XXXXXXXX` format IDs (CSPRNG, unambiguous alphabet, 32^8 combinations)
- **`reviewPayment()`** — Main confirm/reject handler for both online and POS orders
  - Online confirm: payment → "confirmed" status, stock deducted, Telegram notification
  - Online reject: payment → "payment_pending" (customer re-uploads), Telegram alert
  - POS confirm: only verifies the payment record (goods already handed over)
  - POS reject: flags the payment, loud Telegram alert to follow up with employee
  - Always writes to `order_status_log` audit trail

### `src/lib/stock.ts` — Stock Ledger
- **`recordSale()`** — Deducts stock via `stock_sell` RPC (FEFO), sends low-stock Telegram alerts when crossing reorder level
- **`recordReturn()`** — Reverses a sale's deductions via `stock_return` RPC
- **`checkStock()`** — Pre-flight stock availability check. Returns `outOfStock` and `insufficient` arrays. Never blocks if stock SQL is missing (`setupMissing` flag)
- Gracefully degrades if stock tables/functions aren't set up yet

### `src/lib/receiptParser.ts` — OCR Receipt Parsing
- **`parseReceipt(raw)`** — Extracts transaction reference, amount, and method from OCR text
  - CBE format: `FT{5digits}{5alphanumerics}` (e.g., `FT26278YHRLD`)
  - Telebirr format: labelled "Transaction Number" or 2-letter+2-digit+6-char pattern
  - Handles OCR errors (0↔O, 1↔I/l digit confusion)
- **`evaluateProof()`** — Generates risk flags: `amount_mismatch`, `no_reference`, `low_ocr_confidence`, `edited_by_employee`, `duplicate_reference`, `no_proof`, `method_mismatch`

### `src/lib/kioskSession.ts` — Kiosk PIN Sessions
- HMAC-SHA256 signed, httpOnly cookie (`nl_kiosk`)
- 12-hour expiry
- Timing-safe signature verification

---

## 8. Frontend Architecture

### Provider Stack (in `[locale]/layout.tsx`)

```
<ThemeProvider>
  <CartProvider>
    <NextIntlClientProvider>
      <ToastProvider>
        <PageProgress />
        <AnnouncementBanner />
        <AppShell>
          {children}
        </AppShell>
      </ToastProvider>
    </NextIntlClientProvider>
  </CartProvider>
</ThemeProvider>
```

### Design System

- **CSS Modules** — Every component has a `.module.css` file colocated with it
- **Design tokens** — CSS custom properties with `--a-*` prefix defined in `globals.css`
- **Dark/light mode** — Toggle via `ThemeContext.tsx`, tokens switch between palettes
- **Responsive** — Mobile-first, with mobile drawers for admin sidebar

### Key UI Components

| Component | Purpose |
|---|---|
| `LiveRefresh` | Supabase realtime subscriptions + polling fallback for live data updates |
| `BarcodeScanner` | Camera-based barcode/QR scanner using `html5-qrcode` |
| `useScanner` | USB/Bluetooth keyboard-wedge barcode scanner hook |
| `Modal` | Reusable dialog component |
| `Toast` | Notification toasts (context-based provider pattern) |
| `PageProgress` | Page transition loading bar |
| `Skeleton` | Loading skeleton animations |
| `ThemeToggle` | Dark/light mode switch button |
| `AnnouncementBanner` | Site-wide announcement banners (fetched server-side) |

### Customer Storefront Pages

| Page | Route | Description |
|---|---|---|
| Home | `/` | Hero, trust badges, process snippet, featured products, FAQ, CTA |
| Shop | `/shop` | Product grid with category filtering |
| Product Detail | `/shop/[id]` | Single product view |
| Cart | `/cart` | Shopping cart (localStorage-persisted) |
| Order | `/order` | Order placement form |
| Track | `/track` | Order status tracking |
| Pay | `/pay/[orderNumber]` | Payment instructions page + receipt photo upload with live OCR |
| Account | `/account` | Customer account dashboard |
| How It's Made | `/how-its-made` | Process/story page |

### Kiosk POS Pages

| Component | File | Description |
|---|---|---|
| Kiosk Main | `KioskClient.tsx` | Full POS interface: product grid, barcode scanning, cart, search |
| PIN Pad | `PinPad.tsx` | 4-digit PIN entry for employee login |
| POS Checkout | `PosCheckout.tsx` | Payment flow: cash/Telebirr/CBE, camera capture, OCR verification |
| Order Queue | `KioskOrderQueue.tsx` | Slide-out drawer showing operator's daily orders with status chips |
| PIN Actions | `pinActions.ts` | Server action for PIN verification against bcrypt hash |

### Admin Dashboard Pages

| Page | Route | Description |
|---|---|---|
| Dashboard | `/admin` | Stats cards (orders, revenue, products, low stock) |
| Products | `/admin/products` | Full CRUD: image upload/camera, WebP resize, SKU/barcode generation, archive |
| Inventory | `/admin/inventory` | Stock ledger view, receive/adjust drawers, lot tracking, low-stock/expiry alerts |
| Labels | `/admin/inventory/labels` | Barcode (Code 128) + QR label generation with print CSS |
| Orders | `/admin/orders` | Order list with status management |
| Payments | `/admin/payments` | Payment review queue (approve/reject with reason) |
| Employees | `/admin/employees` | Employee list + `AccountsClient.tsx` for role/account management |
| Announcements | `/admin/announcements` | CRUD for site-wide announcement banners |
| Activity | `/admin/activity` | Unified timeline merging order status logs + stock movements |
| Reports | `/admin/reports` | Sales/revenue reporting |

---

## 9. Internationalization (i18n)

- **Engine:** `next-intl` v4 with App Router integration
- **Locales:** `en` (English, default), `am` (Amharic)
- **Strategy:** Path prefix, `as-needed` mode (English = no prefix, Amharic = `/am/...`)
- **Translation files:** `messages/en.json` (~9KB) and `messages/am.json` (~10.7KB)
- **Products:** Have both `name` and `name_am` columns for bilingual catalog
- **Order statuses:** Defined in `supabase.ts` with `{ en, am, icon }` labels

---

## 10. Telegram Bot Integration

### Architecture

- **Production:** Webhook at `/api/telegram` (registered via Telegram Bot API)
- **Development:** Long-poll script `scripts/telegram-poll.mjs` (run with `npm run tg:poll`)
  - Reads `.env.local` for token
  - Checks that no webhook is registered (prevents conflicts)
  - Forwards updates to `http://localhost:3000/api/telegram`

### Notification Flow

1. New online order → Telegram message with order details + ✅ Confirm / ❌ Reject buttons
2. New POS digital payment → Telegram message with receipt photo + approval buttons
3. Payment confirmed/rejected → Follow-up Telegram message
4. Low stock alert → Triggered when sale crosses reorder level

### Payment Config

- **Telebirr:** Phone number `0920375262`
- **CBE:** Account number `1000496230489`
- **Payee name:** "Neil Lewz"
- **Transaction ID format:** `NL-{8 chars from ABCDEFGHJKMNPQRSTUVWXYZ23456789}`

---

## 11. Deployment

- **Platform:** Cloudflare Workers (via `@opennextjs/cloudflare`)
- **Production URL:** `https://neil-lewz-v1.yt-personalacc2026.workers.dev`
- **Build:** `next build` → deployed to Cloudflare
- **Dev:** `npm run dev` (Next.js dev server, LAN origins allowed for phone testing)
- **Supabase project:** `hcjbyzdbffpjjydkmgog.supabase.co`

---

## 12. Development Conventions

### Code Patterns

1. **Server Actions** — Admin CRUD uses Next.js server actions in `actions.ts` files colocated with their page
2. **Colocated components** — Admin page components (e.g., `ProductsClient.tsx`) live next to their `page.tsx`
3. **Server Components** — Pages are RSC by default; client components are explicitly marked `"use client"`
4. **Error handling** — Stock and payment operations never throw; they return `{ ok, error, setupMissing }` result objects
5. **Graceful degradation** — If stock SQL isn't set up, sales proceed without blocking (the `setupMissing` flag tracks this)
6. **Lazy initialization** — `supabaseAdmin` is lazy to avoid build-time env crashes on Cloudflare

### File Naming

- Components: `PascalCase.tsx` + `PascalCase.module.css`
- Server actions: `actions.ts` (colocated in route directory)
- Lib modules: `camelCase.ts`
- API routes: `route.ts` inside the path directory

### CSS Architecture

- All styling uses CSS Modules (`.module.css`)
- Global design tokens in `src/styles/globals.css` use `--a-*` prefix
- Dark/light themes swap CSS custom property values
- Print-specific CSS for label generation (`@media print`)

---

## 13. Git History (Chronological)

| Commit | Description |
|---|---|
| `c5b1c1e` | **Phase 1 complete** — Shop, cart, order tracking, Telegram bot, Supabase integration, i18n (EN/AM), keepalive cron |
| `aceda18` | Fix: lazy-initialize supabaseAdmin to fix build-time env var crash |
| `45d6d45` | Fix: rename package to `neil-lewz-v1` to match Cloudflare worker name |
| `eee0933` | Feat: add beautiful custom modal and keep-alive route |
| `210f142` | **Feat: Auth & roles** — payment foundation (proof upload + review), POS payment flow with OCR, kiosk PIN/Google entry |
| `c3f799d` | Chore: allow LAN origins for dev server (phone testing) |
| `5d59c92` | Build: commit public Supabase build-time values (.env.production) |
| `3d3fc78` | Build: set public site URL for pay links |
| `60bb520` | **Feat: live updates** — LiveRefresh (realtime + polling) for pay, admin, staff, track; OAuth stray-code safety net |
| `24361ea` | **Feat: admin theme** — tokens + theme switch, reports dark fix, mobile admin drawer, kiosk bottom-sheet cart |
| `60c5fd0` | **Phase 2.5** — Products admin UI, inventory page, labels, kiosk scanning |
| `6903eb9` | Fix: skeleton light mode, category combobox hint, stock enforcement |
| `8b7f7af` | **Feat: OCR on online pay**, kiosk order queue, admin activity log, stock check fix |
| `05c4a4e` | Fix: kiosk queue payment status, product card 404, OCR stale closure |
| `d7ac241` | **Feat: multi-image** product gallery, announcements system, and smart stock deduction |

---

## 14. Completed Phases

### Phase 0 — Auth & Roles ✅
- Supabase Auth with Google OAuth
- PIN pad entry for kiosk operators
- Role-based routing (admin → dashboard, employee → kiosk, customer → account)
- Admin account & role management

### Phase 1 — Payment Foundation ✅
- Transaction ID generator (`NL-XXXXXXXX`)
- Customer payment page (`/pay/[orderNumber]`) with bank details, CBE QR, proof upload
- Admin payment review queue (`/admin/payments`) with approve/reject workflow
- Telegram bot notifications with bidirectional approval buttons

### Phase 2 — POS Payment Flow ✅
- Kiosk POS workflow (`/kiosk`) with cash, Telebirr, CBE options
- Camera capture and client-side OCR for receipt verification
- Non-blocking cashier flow with operator attribution and silent flags for admin review

### Phase 2.5 — Catalog, Stock Ledger, Labels & Scanning ✅
- **Catalog management** — Image drop zone/camera, WebP auto-resize, SKU/barcode generation
- **Stock ledger** — Append-only movements, lot/batch tracking, receive/adjust, low-stock alerts
- **Label generation** — Code 128 barcode and QR printing
- **Kiosk scanning** — Camera scanner + USB/Bluetooth keyboard-wedge support
- **Stock enforcement** — Pre-flight checks, cart quantity capping
- **Live updates** — Supabase realtime + polling fallback
- **Theming** — Dark/light mode with design tokens

### Latest Polish (Oct 2026) ✅
- OCR on online payment page with confidence banners
- Kiosk order queue panel (daily orders, status chips)
- Admin activity timeline (merged orders + stock)
- Multi-image product gallery
- Announcements system (CRUD + banner display)
- Smart stock deduction (FEFO allocation)

---

## 15. What's Next — Phase 3: Supply Chain & Manufacturing

> This is the **immediate next phase** documented in `IMPLEMENTATION_PLAN.md`.

### 3.1 Raw Material Lot Tracking
- Suppliers/farmers register with contact details, sourcing regions, price-per-kg trends
- Raw peanut intake batches: moisture level, grade, total weight (kg), landed cost
- Auto expense association to financial ledger

### 3.2 Production Stage Workflows & Yield Engine
1. **Roasting:** Raw peanuts (kg) → temp/time → roasted output (kg) + weight loss
2. **Peeling/Cleaning:** Roasted → husks/waste → cleaned nuts (kg)
3. **Pressing:** Cleaned nuts → either:
   - **Butter Mill:** nuts + salt/honey → butter batches (kg)
   - **Oil Expeller:** nuts → oil (L) + peanut cake byproduct (kg)
4. **Yield calculations:** `Yield% = (Output kg / Input kg) × 100` with anomaly detection

### 3.3 Product Categorization
- **Manufactured:** Peanut butter (smooth, crunchy, spiced), oil, roasted nuts — internal lot numbers + QR/barcodes
- **Resold:** Packaged honey, jelly, pumpkin seed oil — received with manufacturer EAN-13/UPC barcodes

### 3.4 Multi-Location Stock Tracking
```
SUPPLIER → WAREHOUSE (Raw) → PRODUCTION → SHELF (Kiosk) → SOLD / RETURNED
```
Every transfer creates a signed movement record (operator, timestamp, from, to).

### Open Questions (from IMPLEMENTATION_PLAN.md)
1. Batch granularity: separate steps or simplified daily batch?
2. Stock locations: one facility or separate raw storage vs. retail shelf?
3. Scale input: manual weight entry or barcode batch printing at pressing?

---

## 16. Future Phases (Planned)

### Phase 4 — Advanced Fraud Prevention & Audit Logging
- Immutable audit trail with DB triggers (`actor_id`, `action_type`, `before_state`, `after_state`)
- Soft deletes + recycle bin across all entities
- Automated anomaly detection (paid-then-cancelled, cashier voids after scan, etc.)
- Instant high-priority Telegram alerts for suspicious activity
- Image metadata timestamp analysis

### Phase 5 — Reports & Multi-Tenant
- Custom date-range pickers with presets
- Gross revenue, net margin, COGS, inventory valuation
- Cashier shift closeout and Z-Report
- Export to CSV, Excel, PDF
- Multi-tenant/branch architecture (`tenant_id`, per-tenant settings)

### Backlog
- Offline PWA mode
- Regional multi-store support

---

## 17. Critical Notes for the Next Developer/AI

1. **Next.js 16** — This is NOT the Next.js you know from training data. Read `node_modules/next/dist/docs/` for breaking changes. The `AGENTS.md` file reinforces this.

2. **Middleware is `proxy.ts`** — Not the standard `middleware.ts`. The exported function is named `proxy` and also exports `config`.

3. **Three Supabase clients** — Don't mix them up. `supabase.ts` = browser only. `supabaseServer.ts` = server with user cookies. `supabaseAdmin.ts` = service role (bypasses RLS).

4. **Stock SQL is optional** — The app gracefully handles missing stock functions. `setupMissing` flags let callers decide whether to block.

5. **Payment review is bidirectional** — Admin can approve/reject from the web dashboard OR from Telegram buttons. Both paths call `reviewPayment()`.

6. **OCR is client-side** — Tesseract.js runs in the browser. The server re-validates the parsed results (never trust client OCR).

7. **Kiosk auth is special** — The kiosk route is NOT protected by middleware. It has its own auth flow via `kioskOperator.ts` (PIN cookie or Google session).

8. **ETB currency** — All amounts are in Ethiopian Birr (ETB/ብር). `NUMERIC(12,2)` in DB.

9. **Translation keys** — If you add a new user-facing string, add it to both `messages/en.json` and `messages/am.json`.

10. **Cloudflare deployment** — Uses `@opennextjs/cloudflare`. Build-time env vars must be in `.env.production` (public only). Runtime secrets are set in the Cloudflare dashboard.

11. **Admin components are colocated** — Unlike customer components (in `src/components/customer/`), admin page components live inside their route directories (e.g., `src/app/[locale]/admin/products/ProductsClient.tsx`).

12. **CSS uses `--a-*` tokens** — All design tokens have the `--a-` prefix. Don't use raw color values in CSS.

---

*End of handoff log.*
