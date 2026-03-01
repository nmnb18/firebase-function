# Grabbitt Loyalty Platform - Firebase Functions

Complete backend API for the Grabbitt loyalty and rewards platform built with Firebase Cloud Functions.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [Building](#building)
- [Testing](#testing)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v18 or higher ([Download](https://nodejs.org/))
- **npm** v9 or higher (comes with Node.js)
- **Firebase CLI** v12 or higher
- **Git** (for version control)
- **Firebase Project** with Blaze (pay-as-you-go) plan

### Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Verify Installation

```bash
node --version
npm --version
firebase --version
```

---

## Project Structure

```
firebase-function/
├── functions/
│   ├── src/                    # TypeScript source files
│   │   ├── config/             # Firebase configuration
│   │   ├── middleware/         # Authentication middleware
│   │   ├── modules/            # API endpoint modules
│   │   │   ├── auth/           # Authentication endpoints
│   │   │   ├── user/           # User management
│   │   │   ├── seller/         # Seller operations
│   │   │   ├── points/         # Points & transactions
│   │   │   ├── redemption/     # Redemption flow
│   │   │   ├── qr-code/        # QR code operations
│   │   │   ├── payments/       # Payment processing
│   │   │   ├── push-notification/ # Push notifications
│   │   │   ├── dashboard/      # Dashboard analytics
│   │   │   └── cron/           # Scheduled jobs
│   │   ├── services/           # External services (Expo Push)
│   │   ├── types/              # TypeScript types
│   │   ├── utils/              # Helper utilities & cache
│   │   └── index.ts            # Main entry point
│   ├── lib/                    # Compiled JavaScript (build output)
│   ├── package.json            # Dependencies
│   └── tsconfig.json           # TypeScript configuration
├── firebase.json               # Firebase configuration
├── .firebaserc                 # Firebase project aliases
├── API_SPECIFICATION.md        # Complete API documentation
├── PERFORMANCE_AUDIT.md        # Performance optimization docs
└── README.md                   # This file
```

---

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/nmnb18/firebase-function.git
cd firebase-function
```

### 2. Install Dependencies

```bash
cd functions
npm install
```

### 3. Firebase Login

```bash
firebase login
```

### 4. Select Firebase Project

```bash
firebase use --add
```

Select your Firebase project and give it an alias (e.g., `production` or `staging`).

### 5. Configure Environment Variables

Create a `.env` file in the `functions/` directory:

```bash
cd functions
touch .env
```

Add the following environment variables:

```env
# Firebase API Key (for REST authentication)
API_KEY=AIzaSyDeFOLg1_ikeUAa7b4p3pRyvQgSymUh3Vc

# Razorpay Payment Gateway
RAZORPAY_ENV=test
RAZORPAY_KEY_ID_TEST=rzp_test_your_key_here
RAZORPAY_SECRET_TEST=your_secret_here
RAZORPAY_KEY_ID_LIVE=rzp_live_your_key_here
RAZORPAY_SECRET_LIVE=your_secret_here

# Expo Push Notifications
EXPO_ACCESS_TOKEN=your_expo_token_here
```

### 6. Set Firebase Environment Variables

For production deployment, set environment variables using Firebase CLI:

```bash
firebase functions:config:set razorpay.env="test"
firebase functions:config:set razorpay.key_id_test="rzp_test_your_key_here"
firebase functions:config:set razorpay.secret_test="your_secret_here"
firebase functions:config:set expo.access_token="your_expo_token_here"
```

Download config for local emulator:

```bash
firebase functions:config:get > .runtimeconfig.json
```

---

## Local Development

### Start Firebase Emulators

Run the Firebase emulator suite with Functions, Firestore, and Authentication:

```bash
firebase emulators:start
```

**Emulator URLs:**
- Functions: http://localhost:5001
- Firestore: http://localhost:8080
- Authentication: http://localhost:9099
- Emulator UI: http://localhost:4000

### Run Functions Only

If you only need to test functions:

```bash
firebase emulators:start --only functions
```

### Run with Specific Function

```bash
firebase emulators:start --only functions --inspect-functions
```

This enables debugging with Chrome DevTools.

### Watch Mode (Auto-rebuild on changes)

In a separate terminal, run TypeScript in watch mode:

```bash
cd functions
npm run build:watch
```

Or manually rebuild when needed:

```bash
npm run build
```

---

## Building

### Development Build

```bash
cd functions
npm run build
```

This compiles TypeScript files from `src/` to JavaScript in `lib/`.

### Production Build

```bash
npm run build
```

Ensure there are no TypeScript errors:

```bash
npm run build -- --noEmit
```

### Clean Build

Remove old build artifacts and rebuild:

```bash
rm -rf lib
npm run build
```

---

## Testing

### Test Connection Endpoint

Once emulators are running, test the health check endpoint:

```bash
curl http://localhost:5001/grabbitt-app/asia-south1/testConnection
```

Expected response:
```json
{
  "success": true,
  "message": "Firebase Functions emulator is working!",
  "timestamp": "2026-03-01T12:00:00.000Z"
}
```

### Test Authentication

**Register User:**
```bash
curl -X POST http://localhost:5001/grabbitt-app/asia-south1/registerUser \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "phone": "+919876543210",
    "city": "Mumbai"
  }'
```

**Login User:**
```bash
curl -X POST http://localhost:5001/grabbitt-app/asia-south1/loginUser \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "role": "user"
  }'
```

### Run Unit Tests (if configured)

```bash
cd functions
npm test
```

---

## Deployment

### Deploy All Functions

```bash
firebase deploy --only functions
```

### Deploy Specific Function

```bash
firebase deploy --only functions:loginUser
```

### Deploy Multiple Specific Functions

```bash
firebase deploy --only functions:loginUser,functions:registerUser,functions:getPointsBalance
```

### Deploy with Environment Config

Ensure environment variables are set before deployment:

```bash
firebase functions:config:get
firebase deploy --only functions
```

### Deploy to Specific Project

```bash
firebase use production
firebase deploy --only functions
```

### Force Deploy (bypass cache)

```bash
firebase deploy --only functions --force
```

### Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### Deploy Everything

```bash
firebase deploy
```

---

## API Documentation

Complete API documentation is available in [`API_SPECIFICATION.md`](./API_SPECIFICATION.md).

### Base URL

**Production:**
```
https://asia-south1-grabbitt-app.cloudfunctions.net
```

**Local Emulator:**
```
http://localhost:5001/grabbitt-app/asia-south1
```

### Quick Reference

| Module | Endpoints | Description |
|--------|-----------|-------------|
| Authentication | 15 | Login, register, password management |
| User | 6 | Profile, perks, today offers |
| Seller | 12 | Profile, analytics, offers |
| Points | 3 | Balance, transactions |
| Redemption | 10 | Create, process, analytics |
| QR Code | 2 | Generate, scan |
| Payments | 4 | Orders, verification |
| Notifications | 5 | Push notifications |
| Dashboard | 1 | Seller statistics |
| Cron | 1 | Scheduled jobs |

**Total:** 59 Cloud Functions

---

## Performance Features

### Caching

In-memory caching implemented on 11 read-heavy endpoints:
- TTL: 30-120 seconds (endpoint-dependent)
- Cache hit/miss statistics tracking
- Automatic expiration and cleanup

### Parallel Query Optimization

Promise.all() used for independent database operations:
- **30-50% faster** response times
- Reduced database round trips
- Optimized on 8+ critical endpoints

### Configuration

All functions configured for optimal performance:
- **Region:** asia-south1
- **Min Instances:** 1 (prevents cold starts)
- **Timeout:** 10-60s (based on complexity)
- **Memory:** 128MiB-512MiB (based on workload)

See [`PERFORMANCE_AUDIT.md`](./PERFORMANCE_AUDIT.md) for detailed optimization documentation.

---

## Useful Commands

### View Logs

**All functions:**
```bash
firebase functions:log
```

**Specific function:**
```bash
firebase functions:log --only loginUser
```

**Live tail:**
```bash
firebase functions:log --follow
```

### List Deployed Functions

```bash
firebase functions:list
```

### Delete Function

```bash
firebase functions:delete functionName
```

### View Configuration

```bash
firebase functions:config:get
```

### Update Configuration

```bash
firebase functions:config:set key="value"
```

### Shell (Interactive REPL)

```bash
cd functions
npm run shell
```

Then invoke functions:
```javascript
loginUser({email: "test@example.com", password: "test123"})
```

---

## Troubleshooting

### Common Issues

#### 1. TypeScript Compilation Errors

**Problem:** Build fails with TypeScript errors

**Solution:**
```bash
cd functions
npm run build
```

Check errors and fix type issues in `src/` files.

#### 2. Firebase CLI Not Found

**Problem:** `firebase: command not found`

**Solution:**
```bash
npm install -g firebase-tools
```

#### 3. Authentication Errors

**Problem:** `Unauthorized` when calling functions

**Solution:**
- Ensure you're passing valid Firebase ID token in Authorization header
- Token format: `Bearer <firebase_id_token>`
- Get fresh token if expired

#### 4. Emulator Connection Issues

**Problem:** Cannot connect to emulators

**Solution:**
```bash
# Stop all emulators
firebase emulators:kill

# Clear cache
rm -rf ~/.cache/firebase/emulators

# Restart
firebase emulators:start
```

#### 5. Function Deployment Timeout

**Problem:** Deployment hangs or times out

**Solution:**
```bash
# Check network connection
ping google.com

# Use force flag
firebase deploy --only functions --force

# Deploy in smaller batches
firebase deploy --only functions:loginUser,functions:registerUser
```

#### 6. Environment Variables Not Working

**Problem:** Functions can't access environment variables

**Solution:**
```bash
# Check current config
firebase functions:config:get

# Set missing variables
firebase functions:config:set key="value"

# Download for local use
firebase functions:config:get > functions/.runtimeconfig.json

# Redeploy
firebase deploy --only functions
```

#### 7. Out of Memory Errors

**Problem:** Function crashes with OOM error

**Solution:**
- Check function memory allocation in `index.ts`
- Increase memory: change from `128MiB` to `256MiB` or `512MiB`
- Redeploy function

#### 8. Cold Start Issues

**Problem:** First request after inactivity is slow

**Solution:**
- Already configured: `minInstances: 1` on all functions
- This keeps instances warm to prevent cold starts
- No additional action needed

### Debug Mode

Enable verbose logging:

```bash
# Local emulator
export DEBUG=firebase:*
firebase emulators:start

# Functions logs
firebase functions:log --follow
```

### Health Check

Test if functions are running:

```bash
# Production
curl https://asia-south1-grabbitt-app.cloudfunctions.net/testConnection

# Local
curl http://localhost:5001/grabbitt-app/asia-south1/testConnection
```

---

## Project Maintenance

### Update Dependencies

```bash
cd functions
npm outdated
npm update
```

### Security Audit

```bash
npm audit
npm audit fix
```

### Check Firebase CLI Updates

```bash
npm install -g firebase-tools@latest
```

### Backup Firestore Data

```bash
gcloud firestore export gs://your-bucket-name/backups/$(date +%Y%m%d)
```

---

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Firebase

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: cd functions && npm ci
      
      - name: Build functions
        run: cd functions && npm run build
      
      - name: Deploy to Firebase
        uses: w9jds/firebase-action@master
        with:
          args: deploy --only functions
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

Generate Firebase token for CI:
```bash
firebase login:ci
```

---

## Resources

- **Firebase Documentation:** https://firebase.google.com/docs/functions
- **TypeScript Documentation:** https://www.typescriptlang.org/docs/
- **Razorpay API:** https://razorpay.com/docs/api/
- **Expo Push Notifications:** https://docs.expo.dev/push-notifications/overview/

---

## Support

For issues or questions:
- **Email:** tech@grabbitt.com
- **Slack:** #firebase-functions-support
- **Documentation:** See `API_SPECIFICATION.md`

---

## License

Proprietary - Grabbitt Technologies Private Limited

---

**Last Updated:** March 1, 2026  
**Version:** 1.0.0
