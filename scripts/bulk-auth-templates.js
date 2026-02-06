/**
 * 🚀 BULK AUTH MIGRATION - Automated Converter
 * 
 * This script demonstrates patterns for converting remaining auth functions
 * from onRequest to onCall pattern. Use these templates for manual conversion.
 */

// ============================================================
// TEMPLATE 1: Simple Write Functions (changePassword, logout)
// ============================================================

/*
🔧 Pattern: Simple verification + single write

OLD:
export const changePassword = functions.https.onRequest(
  { region: "asia-south1" },
  async (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});
      try {
        const { oldPassword, newPassword } = req.body;
        const user = await authenticateUser(req.headers.authorization);
        // ... validation
        await auth.updateUser(user.uid, { password: newPassword });
        return res.status(200).json({success: true});
      } catch (error) {
        return res.status(500).json({error: error.message});
      }
    });
  }
);

NEW:
export const changePassword = createCallableFunction<
  {oldPassword: string; newPassword: string},
  {success: boolean}
>(
  async (data) => {
    const {oldPassword, newPassword} = data;
    
    if (!oldPassword || !newPassword) {
      throw new Error("Both passwords required");
    }
    
    // Context auth is automatically injected
    await firebaseAuth.updateUser(context.auth.uid, {password: newPassword});
    
    return {success: true};
  },
  {region: "asia-south1", requireAuth: true}
);
*/

// ============================================================
// TEMPLATE 2: Token-based Functions (refreshToken)
// ============================================================

/*
🔧 Pattern: Exchange token for new one

OLD:
export const refreshToken = functions.https.onRequest(
  {secrets: ["API_KEY"], region: "asia-south1"},
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});
    try {
      const {refreshToken} = req.body;
      const response = await fetch(REFRESH_URL, {...});
      const data = await response.json();
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({error: error.message});
    }
  }
);

NEW:
export const refreshToken = createCallableFunction<
  {refreshToken: string},
  {idToken: string; expiresIn: string}
>(
  async (data) => {
    const {refreshToken: token} = data;
    if (!token) throw new Error("Refresh token required");
    
    const response = await fetch(REFRESH_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({refresh_token: token, grant_type: "refresh_token"})
    });
    
    const responseData = await response.json();
    if (responseData.error) throw new Error("Invalid refresh token");
    
    return {
      idToken: responseData.id_token,
      expiresIn: responseData.expires_in
    };
  },
  {region: "asia-south1", requireAuth: false, secrets: ["API_KEY"]}
);
*/

// ============================================================
// TEMPLATE 3: Complex Delete Functions (deleteUser, deleteSeller)
// ============================================================

/*
🔧 Pattern: Delete with transaction + cleanup

OLD:
export const deleteUser = functions.https.onRequest(
  {region: "asia-south1"},
  async (req, res) => {
    if (req.method !== "DELETE") return res.status(405).json({error: "Method not allowed"});
    try {
      const user = await authenticateUser(req.headers.authorization);
      const uid = user.uid;
      
      // Delete auth + firestore + storage
      await Promise.all([
        auth.deleteUser(uid),
        db.collection("users").doc(uid).delete(),
        db.collection("customer_profiles").doc(uid).delete()
      ]);
      
      return res.status(200).json({success: true});
    } catch (error) {
      return res.status(500).json({error: error.message});
    }
  }
);

NEW:
export const deleteUser = createCallableFunction<{}, {success: boolean}>(
  async (data, auth, context) => {
    const uid = context.auth.uid;
    
    // Parallel deletion of all user data
    await Promise.all([
      firebaseAuth.deleteUser(uid),
      db.collection("users").doc(uid).delete(),
      db.collection("customer_profiles").doc(uid).delete(),
      db.collection("push_tokens").doc(uid).delete()
    ]);
    
    return {success: true};
  },
  {region: "asia-south1", requireAuth: true}
);
*/

// ============================================================
// TEMPLATE 4: Password Reset Functions
// ============================================================

/*
🔧 Pattern: Verify user + send email + create token

OLD:
export const requestPasswordReset = functions.https.onRequest(
  {secrets: ["API_KEY"], region: "asia-south1"},
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});
    try {
      const {email} = req.body;
      
      if (!validators.isEmail(email)) {
        return res.status(400).json({error: "Invalid email"});
      }
      
      const user = await auth.getUserByEmail(email).catch(() => null);
      if (!user) return res.status(404).json({error: "User not found"});
      
      const token = crypto.randomBytes(32).toString("hex");
      await db.collection("password_resets").doc(user.uid).set({token, ...});
      
      await sendResetEmail(email, token);
      return res.status(200).json({success: true});
    } catch (error) {
      return res.status(500).json({error: error.message});
    }
  }
);

NEW:
export const requestPasswordReset = createCallableFunction<
  {email: string},
  {success: boolean}
>(
  async (data) => {
    const {email} = data;
    
    if (!validators.isEmail(email)) throw new Error("Invalid email");
    
    const user = await firebaseAuth.getUserByEmail(email).catch(() => null);
    if (!user) throw new Error("User not found");
    
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = adminRef.firestore.Timestamp.fromDate(
      new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    );
    
    await Promise.all([
      db.collection("password_resets").doc(user.uid).set({
        token,
        email,
        expires_at: expiry,
        created_at: adminRef.firestore.FieldValue.serverTimestamp()
      }),
      sendResetEmail(email, token)
    ]);
    
    return {success: true};
  },
  {region: "asia-south1", requireAuth: false}
);
*/

// ============================================================
// REMAINING FUNCTIONS TO MIGRATE:
// ============================================================

const remainingAuthFunctions = [
  {
    name: "verifyEmail",
    file: "src/modules/auth/verifyEmail.ts",
    type: "Template 2 (Email verification with token)",
    priority: "HIGH"
  },
  {
    name: "validateCity",
    file: "src/modules/auth/validateCity.ts",
    type: "Template 1 (Simple read)",
    priority: "MEDIUM"
  },
  {
    name: "requestPasswordReset",
    file: "src/modules/auth/requestPasswordReset.ts",
    type: "Template 4 (Email + token)",
    priority: "HIGH"
  },
  {
    name: "refreshToken",
    file: "src/modules/auth/refreshToken.ts",
    type: "Template 2 (Token exchange)",
    priority: "HIGH"
  },
  {
    name: "reauthenticate",
    file: "src/modules/auth/reauthenticate.ts",
    type: "Template 1 (Credential verification)",
    priority: "MEDIUM"
  },
  {
    name: "phoneLogin",
    file: "src/modules/auth/phoneLogin.ts",
    type: "Template 2 (Phone auth)",
    priority: "MEDIUM"
  },
  {
    name: "deleteUser",
    file: "src/modules/auth/deleteUser.ts",
    type: "Template 3 (Complex delete)",
    priority: "HIGH"
  },
  {
    name: "deleteSeller",
    file: "src/modules/auth/deleteSeller.ts",
    type: "Template 3 (Complex delete)",
    priority: "HIGH"
  },
  {
    name: "confirmPasswordReset",
    file: "src/modules/auth/confirmPasswordReset.ts",
    type: "Template 1 (Token verification + update)",
    priority: "HIGH"
  },
  {
    name: "changePassword",
    file: "src/modules/auth/changePassword.ts",
    type: "Template 1 (Simple write)",
    priority: "MEDIUM"
  }
];

console.log("📋 Remaining Auth Functions to Migrate");
console.log("=====================================\n");

remainingAuthFunctions.forEach((fn, idx) => {
  console.log(`${idx + 1}. ${fn.name.padEnd(25)} | ${fn.priority.padEnd(7)} | ${fn.type}`);
});

console.log("\n✅ Already Migrated (5 functions):");
console.log("   - loginUser");
console.log("   - loginSeller");
console.log("   - registerUser");
console.log("   - registerSeller");
console.log("   - logout");

console.log("\n📊 Summary:");
console.log(`Total Remaining: ${remainingAuthFunctions.length}`);
console.log("High Priority: 5 functions");
console.log("Medium Priority: 5 functions");
console.log("\n⏱️  Estimated Time: 4-6 hours for all functions");

module.exports = {remainingAuthFunctions};
