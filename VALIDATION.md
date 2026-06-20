# StockDesk Pro — Live Firebase Validation Checklist

Run these on your machine (network reaches Firebase). Each maps to a task item.

## 0. One-time setup (in order)

1. `cp .env.example .env.local` is already done — `.env.local` holds your keys.
2. Deploy rules + indexes:
   ```bash
   npm i -g firebase-tools
   firebase login
   ./scripts/deploy-firebase.sh        # or the three deploy commands manually
   ```
3. Enable **Email/Password** in Firebase Console → Authentication → Sign-in method.
4. Create the 6 users + profiles:
   ```bash
   cd scripts
   # download serviceAccountKey.json into /scripts first (see seedUsers.mjs header)
   npm init -y && npm i firebase-admin
   node seedUsers.mjs
   ```
5. `npm run dev`. The login screen should show **email/password** (Live), not the
   demo role picker. If it shows the role picker, the env didn't load — restart dev.

## Validation

### 3. Demo → Live switch
- [ ] Login screen shows email/password and a teal **Live** chip (not amber Demo Mode).

### 6. Authentication
- [ ] Sign in as `admin@kuro.mv`. **Admin must sign in first** — this triggers the
      one-time reference-data seed (shops, products, balances, rates, settings).
- [ ] Sign out, sign back in — session works.
- [ ] Wrong password shows an error, not a crash.

### 7. Firestore persistence + refresh
- [ ] After admin's first login, open Firebase Console → Firestore. Confirm
      collections appear: `shops`, `products`, `variants`, `stock_balances`,
      `suppliers`, `locations`, `country_rates`, `settings`, `units`.
- [ ] Refresh the app (F5). Data still present (not reset). ← key persistence test.

### 9. Product CRUD
- [ ] Add a product with a variant → appears in `products`/`variants` in Console.
- [ ] Edit it → change reflects after refresh.

### 10. Supplier CRUD
- [ ] Add a supplier → persists in `suppliers`, survives refresh.

### 11. Country Rates
- [ ] Add/edit a rate → persists in `country_rates`, formula recomputes.

### 12. Settings
- [ ] Toggle "allow negative override" / change low-stock threshold →
      persists in `settings/app`, survives refresh.

### 13 + 14. Audit logs + stock adjustments
- [ ] As Purchase Manager, use the Adjust Stock tool (under any Slice 2/3 tab) to
      reduce a balance. Balance updates in `stock_balances`; a row appears in
      `audit_logs`. Refresh — both persist.

### 15. Manager override
- [ ] Sign in as **Warehouse Staff** (`warehouse@kuro.mv`). Try to adjust a balance
      below zero → **blocked** ("a manager can override").
- [ ] Sign in as **Purchase Manager**. Same adjustment below zero → **succeeds**,
      and `audit_logs` gets both the movement row AND a `NEGATIVE_OVERRIDE` row
      naming the authorizer. (Requires settings.allowNegativeOverride = true.)

### 8. Storage
- [ ] (When image upload UI is wired in Slice 2) upload a product image →
      appears under Storage `products/`. The helper + rules are in place now.

## Scoping matrix (critical)

Sign in as each and confirm shop visibility on Stock, Dashboard, Reports, Audit Log:

| User | Expected |
|---|---|
| `admin@kuro.mv` | All shops |
| `purchase@kuro.mv` | All shops |
| `audit@kuro.mv` | All shops, read-only (no Add/Edit buttons) |
| `flora@kuro.mv` | **Flora only** — no Sindhitha rows anywhere |
| `sindhitha@kuro.mv` | **Sindhitha only** — no Flora rows anywhere |
| `warehouse@kuro.mv` | Flora only (assigned shop) |

Double-check at the **rules** level: while signed in as Flora Manager, the
Firestore reads for `stock_balances`/`audit_logs` are server-side filtered to
`shop_flora` — a Sindhitha doc request is denied even if the UI is bypassed.

## If something fails
- Login shows demo picker → env not loaded; restart `npm run dev`.
- "Missing or insufficient permissions" → rules not deployed, or signed-in user
  has no `users/{uid}` profile. Re-run `seedUsers.mjs` / redeploy rules.
- Empty data as a shop manager → an admin hasn't signed in yet to seed shops.
- Index error in console → run `firebase deploy --only firestore:indexes`.
