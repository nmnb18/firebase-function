import admin from "firebase-admin";

if (!admin.apps.length) {
  // In Cloud Functions, FIREBASE_CONFIG is auto-set; locally use env vars
  if (process.env.FIREBASE_CONFIG) {
    admin.initializeApp();
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    // Running against local Firebase emulator (tests / local dev) — no real credentials needed
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-grabbitt-test",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? "demo-grabbitt-test.appspot.com",
    });
  } else {
    admin.initializeApp({
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? admin.credential.applicationDefault()
        : admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          }),
    });
  }
}

const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const firestore = admin.firestore();

if (!isEmulator) {
  // production only
  firestore.settings({ databaseId: "grabbitt" });
}

const db = firestore;
const auth = admin.auth();

export { admin as adminRef, db, auth };
