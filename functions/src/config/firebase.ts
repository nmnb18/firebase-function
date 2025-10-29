import admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp();
}

admin.firestore().settings({ databaseId: 'grabbitt' });
const db = admin.firestore();
const auth = admin.auth();
export { admin as adminRef, db, auth };