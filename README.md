# Addis Bites � Restaurant POS & Online Ordering

> Cloned and customised from the Neil Lewz codebase.  
> Fresh food and drinks � kiosk POS + online menu ordering.

## Tech Stack
- **Next.js 15** (App Router)  
- **Supabase** (Postgres + Auth + Storage)  
- **next-intl** (English + Amharic)  
- **TypeScript**, Vanilla CSS, Lucide icons

---

## Setup

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com), create a new project, copy your credentials.

### 2. Configure environment
```bash
cp .env.example .env.local
# Fill in your NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

### 3. Run database migrations
Visit `/api/setup` after starting the dev server � this runs the SQL migrations automatically.

### 4. Install & run
```bash
npm install
npm run dev          # starts on http://localhost:3000
```

---

## Product Categories (Restaurant)
Add products via **Admin ? Products**. Suggested categories:
- **Food** � main dishes, snacks, pastries
- **Drinks** � soda, water, juice
- **Coffee** � espresso, macchiato, cappuccino
- **Tea** � chai, herbal, spiced
- **Desserts** � cakes, ice cream

---

## Key Pages
| Page | URL |
|------|-----|
| Home | `/` |
| Online Menu | `/shop` |
| Cart / Checkout | `/cart` |
| Kiosk POS | `/kiosk` |
| Admin Dashboard | `/admin` |
| Staff Portal | `/staff` |
| Order Tracking | `/track/[orderNumber]` |

---

## Kiosk PIN Setup
1. Go to **Admin ? Employees** � create staff accounts
2. Staff use the PIN pad on `/kiosk` to log in
3. Scan barcodes or search products to build orders

---

## Customisation Checklist
- [ ] Update `.env.local` with Supabase credentials
- [ ] Change restaurant name in `messages/en.json` and `messages/am.json`
- [ ] Add your logo to `public/logo.png`
- [ ] Update contact details in `messages/en.json` ? `common.address`, `common.phoneNumber`
- [ ] Add products in Admin ? Products
- [ ] Set business hours in `messages/en.json` ? `common.businessHours`
