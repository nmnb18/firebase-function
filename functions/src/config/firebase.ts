import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
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
