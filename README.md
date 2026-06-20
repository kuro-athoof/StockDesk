# StockDesk Pro — by KURO

Warehouse inventory management. Vite + React + TypeScript + Tailwind + Firebase.
Light SaaS theme, KURO teal (#00c9a0) accent, DM Sans.

## Project overview

StockDesk Pro tracks what stock exists, where it is, who moved it, current
balances, what to reorder, and what isn't moving — across multiple shops
(Flora, Sindhitha, and future shops). It supports textile inventory (plain &
design fabrics with roll/meter tracking) and general inventory, with a
barcode-first workflow, an immutable audit trail, and role-based access.

It runs in two modes automatically:

- **Live mode** — when Firebase keys are present: Firestore persistence,
  Firebase Auth (roles from user profiles), Firebase Storage for images.
- **Demo mode** — when keys are missing/placeholder: in-memory seeded data so
  the app is fully usable offline. No crashes, no blank screen.

## Tech stack

- Vite + React 19 + TypeScript
- Tailwind CSS v3
- Firebase v12 (Auth, Firestore, Storage)
- React Router v7

## Setup instructions

```bash
git clone <your-repo-url>
cd stockdesk-pro
npm install
cp .env.example .env.local   # then fill with real Firebase values (or leave for Demo Mode)
npm run dev
```

## Environment variables

All six are client-side public config (not secrets — the security boundary is
Firestore Rules). Put them in `.env.local` (git-ignored). If any are missing or
left as `your-...` placeholders, the app runs in Demo Mode.

| Variable | Source (Firebase Console → Project Settings → SDK setup) |
|---|---|
| `VITE_FB_API_KEY` | apiKey |
| `VITE_FB_AUTH_DOMAIN` | authDomain |
| `VITE_FB_PROJECT_ID` | projectId |
| `VITE_FB_STORAGE_BUCKET` | storageBucket |
| `VITE_FB_MSG_SENDER_ID` | messagingSenderId |
| `VITE_FB_APP_ID` | appId |

## Local development

```bash
npm run dev       # start dev server (http://localhost:5173)
npm run build     # type-check (tsc -b) + production build
npm run preview   # preview the production build
```

## Firebase setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Authentication** → Email/Password provider.
3. Create a **Cloud Firestore** database (production mode).
4. Enable **Storage**.
5. Register a Web App; copy the config into `.env.local`.
6. Deploy rules & indexes (see below).
7. Create users:
   - Add each person in Authentication (email/password).
   - Create a matching `users/{uid}` document in Firestore with their
     `role` and `assignedShopIds` (see SCHEMA.md). The UID must match.
8. First load auto-seeds shops/products/demo data **only if `users` is empty**.

### Roles (from Firestore `users` profiles)

| Role | Shop visibility | Key permissions |
|---|---|---|
| Admin | All | Everything incl. settings, users |
| Purchase Manager | All | Receive, transfer, adjust, override, costs |
| Auditor | All (read-only) | View + export reports |
| Shop Manager | Assigned shops only | Request stock, confirm transfers |
| Warehouse Staff | Assigned shop only | Scan, receive, transfer, counts |

## Deployment steps

```bash
npm run build
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage          # storage rules
firebase deploy --only hosting          # optional: host the built app
```

## Source control / GitHub

```bash
git init
git add .
git commit -m "StockDesk Pro: Phase 1.5 — GitHub + Firebase hardening"
git branch -M main
git remote add origin https://github.com/<you>/stockdesk-pro.git
git push -u origin main
```

`.gitignore` excludes `node_modules`, `dist`, `.env*`, and Firebase
service-account keys. Client Firebase config is safe to expose; never commit a
service-account / admin SDK JSON.

## Documentation

- `SCHEMA.md` — full Firestore schema, relationships, movement integrity.
- `firestore.rules` — security rules (UI + DB enforced).
- `storage.rules` — image/PDF upload rules.

## Roadmap

- **Slice 2:** Receiving (CSV import) + Transfers (internal & ownership) + Warehouse Mode
- **Slice 3:** Stock Count (expected snapshot) + variance approval + persisted Notifications
- **Slice 4:** Full report suite with Excel/PDF export + MainDesk integration hooks
