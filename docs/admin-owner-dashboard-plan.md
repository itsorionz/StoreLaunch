# Admin Owner-Monitoring Plan

> Perspective: the admin user **is the business owner**. The owner's question is never
> "which record do I edit" — it is **"is my business healthy right now, where is the
> money, what is at risk, and what should I do next?"** This plan turns `/admin` from a
> back-office CRUD console into an owner command center.

> **Implementation status — complete.** All seven work packages shipped and verified
> (`tsc --noEmit`, eslint and the report-test suites green; see WP7 — Tests and §7):
>
> - WP1–WP2 · `backend/lib/owner-insights.ts`, `/admin` (Profit & money + license banner),
>   `/admin/settings` (instance & license card).
> - WP3 · `/admin/insights` (growth insights).
> - WP4 · `/admin/activity` (accountability trail).
> - WP5 · `frontend/components/admin/admin-nav.tsx` (owner sidebar re-org).
> - WP6 · `/admin/margin` rebuilt as **Profitability** (design system + auth guard).
> - WP7 · `backend/tests/owner-insights.test.ts` + `test:owner-insights` / `test:ci`.

## 1. Current state (audit findings)

The admin has 49 routes and a strong operational core (orders, dispatch, shipments,
reconciliation, commissions). Gaps from an owner's point of view:

1. **Profit is invisible on the dashboard.** Gross profit / margin % is computed
   (`getMarginKpis`) but only rendered on `/admin/margin` — a hidden, legacy-styled page
   not in the sidebar. The owner sees revenue, never profit.
2. **The money position is fragmented.** Wallet liability (money the store owes
   customers), refunds paid out, and COD cash held by couriers are on three different
   pages (or nowhere). No single "cash the business controls/owes" view.
3. **No growth signals.** Abandoned carts, wishlist demand, and back-in-stock
   notifications are captured in the DB but never surfaced. Campaign/flash-sale
   performance is a label, never numbers.
4. **No accountability console.** Rich audit data exists (OrderEvent with 25 event
   types + actors, AccountStatusEvent, InventoryAdjustment with actors, CodSettlement)
   but there is no "who did what, when" page. Only order-detail-level events.
5. **Instance risk is hidden.** The `License` model gates the whole instance via
   `src/proxy.ts`, but the owner cannot see expiry anywhere in the UI.
6. **9 routable pages are orphaned from the nav** — warehouse (+transfer/rebalance),
   pick, pack, suppliers, purchase orders, margin, delivery hubs, delivery zones.
   The owner cannot discover half the operations suite.
7. **Two visual generations coexist** — legacy `bg-gray-50` pages vs the `card`/
   `badge`/`PageHeader` design system.

## 2. Design principles

- **Dashboard = answers, not links.** `/admin` must answer money, health and risk
  without navigation; drill-down pages exist for depth.
- **Money first.** Profit, cash held, cash owed — always above operational metrics.
- **Risk is loud.** License expiry, stuck shipments and negative variance get banners,
  not footnotes.
- **Nothing hidden.** Every routable page appears in the sidebar.
- **Same design system.** `card`, `StatusBadge`, `PageHeader`, tokens; no gray-50.

## 3. Work packages

### WP1 — Owner money block on the dashboard (`/admin`)

- New lib `backend/lib/owner-insights.ts` (see §4) with period-scoped profit and the
  money-position aggregates.
- Dashboard gains a **"Profit & money"** section right under the period KPIs:
  - **Gross profit (period)** card — delivered orders in period, revenue − cost, with
    margin % as hint (single-currency, same as paid value).
  - **Wallet liability** — total customer wallet balances (money owed back).
  - **COD held by couriers** — collected-but-unremitted cash, per currency.
  - **Refunds paid (30d)** — completed refunds by tender.
- The existing "Warehouse & delivery" and "Cash & reconciliation" sections stay.

### WP2 — License & instance health

- `getLicenseStatus()`: reads the active `License` row, computes `daysToExpiry`,
  `revoked`, `missing`.
- **Dashboard banner** when the license is missing, revoked, or expiring ≤ 30 days
  (accent-bordered, links to settings).
- **Settings page card** (`/admin/settings`): always-visible instance status —
  activated date, expiry, store slug binding.

### WP3 — Growth insights page (`/admin/insights`)

New owner page, grouped under Dashboard in the nav:

- **Abandoned carts** — carts with ≥1 selected item untouched ≥ 30 minutes: count,
  estimated value (current effective prices), age buckets (≤1h, 1–24h, >24h), top
  products by abandoned units; CTA → create a promotion (recovery message).
- **Demand signals** — most-wishlisted products (all-time) and back-in-stock
  notifications per product with `notifiedAt: null` (unserved demand), each linking to
  the product edit page for restock.
- **Referral program** — signups via referral, qualifying orders, reward cost paid
  (uses `StoreSettings.referralRewardCents` for unit cost).
- **Campaign performance** — per campaign (active or ended ≤ 30d): units + item value
  of its products sold in the last 30 days vs their offer price, discount depth, and
  "sales at offer price" value. Flash-sale campaigns flagged.

### WP4 — Accountability console (`/admin/activity`)

- `getActivityTrail({ limit, actor, type })` merges, newest first:
  - `OrderEvent` (status changes, COD collection/remittance, settlements, refunds,
    deliveries — 25 typed events with actor name/role and order number),
  - `AccountStatusEvent` (suspend/activate users & riders),
  - `InventoryAdjustment` (stock adjustments with actor and delta),
  - `CodSettlement` (cash receipts with variance).
- Page: filter by actor (text) and kind (all/orders/accounts/stock/cash), 50 rows,
  each row links to its order where applicable. Answers "who touched money/stock
  today".

### WP5 — Nav & discoverability (`admin-nav.tsx`)

Owner-centric sidebar re-org; **every routable page appears**:

```
Dashboard            Overview · Growth insights · Activity trail
Sales & fulfillment  Orders · Dispatch · Shipments · Delivery · Returns
Warehouse            Locations · Pick queue · Pack station · Stock transfers ·
                     Rebalance · Reorder report · Suppliers · Purchase orders
Catalog              Products · Categories · Brands
Marketing            Carousel · Campaigns · Promotions
Finance              Profitability · COD reconciliation · Payment recovery ·
                     Wallets · Commissions
People & support     Accounts · Customers · Reviews · Feedback · Careers
Store                Delivery hubs · Delivery zones · Settings
```

### WP6 — Legacy page restyle (`/admin/margin` → "Profitability")

- Rebuild `/admin/margin` on the design system: `PageHeader`, KPI cards, tables in
  `card` containers; add `requireAdminPage()` (it currently has no auth guard); make
  the 90-day window explicit; link from the dashboard profit card and Finance nav.

### WP7 — Tests

- `backend/tests/owner-insights.test.ts` (same harness as other report tests: temp DB,
  migrate, seed, assert) covering:
  - profit snapshot = revenue − cost on delivered in-period orders only,
  - abandoned-cart value ignores carts with no selected items and fresh carts,
  - license status: active / expiring / revoked / missing,
  - activity trail merges sources newest-first and respects the actor filter.
- `npm run test:owner-insights` added to scripts and to `test:ci`.

## 4. New backend surface (`backend/lib/owner-insights.ts`)

| Function                       | Returns                                                                                                                                             | Sources                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `getProfitSnapshot(period)`    | grossProfitCents, revenueCents, marginPercent, byCategory                                                                                           | Delivered orders in period × `Product.costCents`                             |
| `getMoneyPosition()`           | walletLiabilityCents, codHeldByCourier[], refunds30d {wallet,gateway,cash}                                                                          | `Wallet.aggregate`, `CodCollection` (unapplied & unremitted), `RefundRecord` |
| `getLicenseStatus()`           | state: active/expiring/revoked/missing, daysToExpiry, expiresAt, activatedAt                                                                        | `License` (latest non-revoked)                                               |
| `getGrowthSignals()`           | abandonedCarts {count, valueCents, buckets, topProducts}, wishlistDemand[], restockDemand[], referrals {signups, qualifyingOrders, rewardCostCents} | `Cart`+`CartItem`, `Wishlist`, `StockNotification`, `Referral`               |
| `getCampaignPerformance(days)` | per campaign: units, itemValueCents, offerValueCents, discountPercent, flashSale                                                                    | `Campaign`+`CampaignProduct` × `OrderItem` (non-cancelled)                   |
| `getActivityTrail(opts)`       | merged ActivityEntry[] (kind, at, actor, summary, href, amountCents?)                                                                               | `OrderEvent`, `AccountStatusEvent`, `InventoryAdjustment`, `CodSettlement`   |

All functions are read-only, `server-only`, currency-aware where amounts have a
currency, and follow the `ops-intelligence.ts` style (plain objects, cents integers).

## 5. Acceptance criteria

- [x] `/admin` shows gross profit + margin % for the selected period, plus wallet
      liability, COD held by couriers and 30d refunds, without navigating anywhere.
- [x] License expiry is visible on `/admin` (banner when ≤ 30 days / revoked / missing)
      and always on `/admin/settings`.
- [x] `/admin/insights` quantifies abandoned carts (value + top products), wishlist and
      restock demand, referral ROI and campaign performance.
- [x] `/admin/activity` answers "who did what when" across orders, accounts, stock and
      cash, with actor + kind filters.
- [x] Every routable admin page is reachable from the sidebar; no `bg-gray-50` legacy
      styling on Finance pages.
- [x] `tsc --noEmit` and eslint clean; new + existing report tests pass.

## 6. Out of scope (candidates for a later pass)

- Admin UI translation (admin chrome is English-only today; a full `admin.*`
  dictionary is a separate project).
- Coupon/discount-code system (no model exists).
- Scheduled jobs (license-expiry email, cart cleanup) — needs the cron/worker story
  beyond the existing HTTP job endpoints.
- Per-rider rating aggregation on the Delivery page (rider-side ratings exist; small
  add-on later).
- Interactive chart period comparisons beyond the existing `DashboardChart`.

## 7. Completion record

The owner-monitoring plan is **complete** as of this pass:

- WP1–WP7 implemented; backend surface in `backend/lib/owner-insights.ts`, pages under
  `src/app/admin/{page,insights,activity,margin,settings}`, nav in
  `frontend/components/admin/admin-nav.tsx`, tests in `backend/tests/owner-insights.test.ts`.
- Acceptance criteria verified: dashboard money/profit + license banner, insights, activity
  trail, full sidebar coverage, design-system restyle of `/admin/margin` → **Profitability**,
  `tsc --noEmit` / eslint / report tests green.

### Problem found during completion — and fixed

**Legacy `bg-gray-50` admin styling survived the design-system restyle.** The plan's design
principle ("no gray-50") and audit finding #7 ("two visual generations coexist") were only
partially resolved: `/admin/margin` was migrated to the design system, but the remaining
admin pages kept the legacy palette:

- `src/app/admin/{delivery-hubs,pack,pack/[id],pick,pick/[id],purchase-orders,reorder,suppliers,warehouse,warehouse/[id],warehouse/rebalance,warehouse/transfer}/page.tsx`
- `frontend/components/admin/{hub-manager,rebalance-suggestions,transfer-queue,warehouse-manager,warehouse-transfer-form}.tsx`
- `frontend/components/auth/logout-button.tsx` (`hover:bg-gray-50`)

**Fix applied:** replaced legacy gray surfaces/borders/text and raw status colors
(`bg-gray-*`, `text-gray-*`, `border-gray-*`, `bg-blue-100/green-100/red-100/yellow-100`,
`text-green/red/amber-600/800`, `bg-amber-50`) with the design-system tokens
(`bg-background`, `bg-surface`, `bg-surface-2`, `border-border`, `text-muted`,
`text-accent`, `bg-primary/15 text-primary`, emerald/amber accent badges).

### Second pass — money-correctness bugs found and fixed

A dedicated bug-hunt over the shipped work packages surfaced seven defects
(mostly currency handling — the plan's "currency-aware where amounts have a
currency" rule was not applied everywhere). All fixed and test-locked:

1. **Refund totals mixed currencies** — `getMoneyPosition` grouped refunds by
   tender only, so a USD payout was summed into the BDT "Refunds paid (30d)"
   figure. Now grouped by tender **and** currency: store-currency totals only,
   with other currencies reported separately (`refunds.otherCurrencies`) and
   footnoted on the dashboard.
2. **Activity-trail amounts ignored currency** — `OrderEvent` amounts follow
   the order's currency and `CodSettlement` carries its own `currencyCode`, but
   both rendered with the store symbol. `ActivityEntry` now carries a
   `currencyLabel`; the page formats each row with it.
3. **COD variance shown as raw cents** — the settlement detail printed
   `variance -300` (= −৳3.00). Now formatted as money.
4. **Profitability page summed all currencies** — `getMarginKpis` had no
   currency filter while the dashboard's gross-profit card did, so multi-currency
   stores showed two different profits. It now takes the store currency (its
   only caller passes `settings.currencyCode`).
5. **Growth stats presented top-8 sums as totals** — "Waiting for restock" and
   "Wishlist saves" summed only the eight listed products. Both tiles now use
   catalog-wide counts (`signals.totals`); the lists stay top-8.
6. **Settings showed "Expires: Never" for a missing/revoked license** — now "—"
   ("Never" only for an active license that genuinely has no expiry).
7. **Abandoned-cart value bypassed the price helper** — replaced
   `salePriceCents ?? priceCents` with the house `effectivePriceCents` (wrong
   when `salePriceCents` was 0 or ≥ the list price).

Also fixed en route: one missed legacy-styling file
(`warehouse-transfer-form.tsx`, see above) and the `/admin/margin` footnote's
"placed-ish" wording.
