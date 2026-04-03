# Local Development Guide

End-to-end steps for running the Grabbitt backend emulator and connecting the user app.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Java | 21 (Temurin) | Required by Firebase CLI 15.12+. Path: `C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot` |
| Node | 20 | System default may be Node 24 (incompatible). Use **fnm** and activate it every terminal session (see below). |
| Firebase CLI | Latest | Installed globally via npm |

### Activate Node 20 (every terminal session)

```powershell
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm use 20
```

---

## One-Time Setup

### 1. Backend secrets — `functions/.secret.local`

Create `functions/.secret.local` (gitignored):

```
API_KEY=<firebase_web_api_key>
RAZORPAY_ENV=test
RAZORPAY_KEY_ID_TEST=<razorpay_test_key_id>
RAZORPAY_SECRET_TEST=<razorpay_test_secret>
```

### 2. App environment — `grabbitt-user/.env.local`

Create `grabbitt-user/.env.local` (gitignored). Replace the IP with your machine's local network IP:

```
EXPO_PUBLIC_BACKEND_URL=http://<your-local-ip>:5001/grabbitt-app/asia-south1/api/api
```

### 3. App environment — `grabbitt-seller/.env.local`

Create `grabbitt-seller/.env.local` (gitignored). Same IP as above:

```
EXPO_PUBLIC_BACKEND_URL=http://<your-local-ip>:5001/grabbitt-app/asia-south1/api/api
```

> **How to find your local IP (Windows):** Run `ipconfig` and use the IPv4 address of your active adapter (e.g. `192.168.0.x`).

---

## Starting the Emulator

Run these commands in a dedicated terminal. Build first so the emulator loads the latest compiled functions.

```powershell
# Activate Node 20
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm use 20

# Set Java 21
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;" + $env:PATH

# Build functions
cd "c:\Ipsit\Code\YP\firebase-function\functions"
npm run build

# Start emulator
cd ..
firebase emulators:start
```

Emulator ports once running:

| Service | Port |
|---|---|
| Auth | 9099 |
| Functions | 5001 |
| Firestore | 8080 |
| Emulator UI | 4000 — http://127.0.0.1:4000 |

---

## Seeding Test Data

**Emulator data is wiped on every restart — seed after every start.**

```powershell
# Activate Node 20
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm use 20

cd "c:\Ipsit\Code\YP\firebase-function"
$env:NODE_PATH = "c:\Ipsit\Code\YP\firebase-function\functions\node_modules"
node scripts/seed-emulator.js
```

What the seed script creates:
- Test user: `test@yoperks.dev / Test@1234`
- `customer_profiles` with `upi_vpa: "test@upi"`
- 3 seller profiles: Cafe Brew House (`cafebrew@upi`), Books & Nook, Fresh Basket Grocery
- Today's daily offers for all 3 sellers

---

## Starting the Mobile Apps

### Customer app (grabbitt-user)

```powershell
cd "c:\Ipsit\Code\YP\grabbitt-user"
npx expo start --clear
```

### Seller app (grabbitt-seller)

```powershell
cd "c:\Ipsit\Code\YP\grabbitt-seller"
npx expo start --clear
```

Scan the QR with **Expo Go** (Android/iOS), or press `a` to open Android emulator.

---

## Test Credentials

| What | Value |
|---|---|
| Customer app login | `test@yoperks.dev` / `Test@1234` |
| Seller app login | `seller@cafebrew.in` / `Seller@1234` |
| Seller UPI VPA (Scan & Pay DEV input) | `cafebrew@upi` |
| Razorpay test UPI (success) | `success@razorpay` |
| Razorpay test UPI (failure) | `failure@razorpay` |

> The Scan & Pay screen has a DEV-only text input at the bottom in debug builds (`__DEV__`). Type the seller VPA there instead of scanning a QR code.

---

## Making Code Changes

After editing any TypeScript file in `functions/src/`, rebuild before the emulator will pick it up:

```powershell
cd "c:\Ipsit\Code\YP\firebase-function\functions"
npm run build
```

The emulator watches the `lib/` output folder — a rebuild is enough; no emulator restart needed for most changes. Restart the emulator if you change `firebase.json` or environment variables.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `JAVA_HOME not set` or emulator fails to start | Wrong Java version active | Set `JAVA_HOME` as shown above |
| `Cannot find module` when running seed | Wrong Node version active | Run `fnm use 20` |
| `401` from Razorpay in functions logs | Emulator started before `.secret.local` was updated | Restart emulator + re-seed |
| Scan & Pay screen blank / user not found | Emulator restarted without re-seeding | Run the seed script again |
| App can't reach emulator | `.env.local` IP is stale (changed network) | Update `EXPO_PUBLIC_BACKEND_URL` with current IP from `ipconfig` |
