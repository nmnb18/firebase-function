import { createCallableFunction } from "../../utils/callable";
import { adminRef, auth as firebaseAuth, db } from "../../config/firebase";

export const verifyEmail = createCallableFunction<
  { token: string },
  { success: boolean; message: string }
>(
  async (data) => {
    const { token } = data;

    if (!token) {
      throw new Error("Invalid token");
    }

    // Find user by verification token
    const userSnap = await db
      .collection("users")
      .where("email_verification_token", "==", token)
      .limit(1)
      .get();

    if (userSnap.empty) {
      throw new Error("Token invalid or expired");
    }

    const userDoc = userSnap.docs[0];
    const userData = userDoc.data();

    // Check if token is expired
    if (userData.email_verification_expires?.toDate() < new Date()) {
      throw new Error("Link expired");
    }

    // Update Firestore + Firebase Auth in parallel
    await Promise.all([
      userDoc.ref.update({
        email_verified: true,
        email_verification_token: adminRef.firestore.FieldValue.delete(),
        email_verification_expires: adminRef.firestore.FieldValue.delete(),
        updatedAt: adminRef.firestore.FieldValue.serverTimestamp(),
      }),
      firebaseAuth.updateUser(userDoc.id, {
        emailVerified: true,
      })
    ]);

    return {
      success: true,
      message: "Email verified successfully",
    };
  },
  { region: "asia-south1", requireAuth: false }
);
