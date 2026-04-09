/**
 * Seed script — populates minimum required master data in the Firebase emulator.
 * Run AFTER emulators are started:
 *
 *   node scripts/seed-emulator.js
 */

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

const admin = require("firebase-admin");

admin.initializeApp({ projectId: "grabbitt-app" });

const db = admin.firestore();
const auth = admin.auth();

async function seed() {
    console.log("Seeding emulator...\n");

    // 1. app_settings/city_config — required by validateCity (register screen)
    await db.collection("app_settings").doc("city_config").set({
        enabled_cities: ["bengaluru", "bangalore", "delhi", "mumbai", "hyderabad", "pune", "chennai"],
        coming_soon_cities: [],
        default_status: "coming_soon",
    });
    console.log("✔  app_settings/city_config");

    // 2. Test user (Auth + customer_profiles doc)
    let testUid;
    try {
        const user = await auth.createUser({
            email: "test@yoperks.dev",
            password: "Test@1234",
            displayName: "Test User",
        });
        testUid = user.uid;
        console.log(`✔  Auth user created: test@yoperks.dev / Test@1234 (uid: ${testUid})`);
    } catch (e) {
        if (e.code === "auth/email-already-exists") {
            const existing = await auth.getUserByEmail("test@yoperks.dev");
            testUid = existing.uid;
            console.log(`ℹ  Auth user already exists (uid: ${testUid})`);
        } else {
            console.error("✘  Auth user creation failed:", e.message);
        }
    }

    if (testUid) {
        await db.collection("customer_profiles").doc(testUid).set({
            uid: testUid,
            user_id: testUid,
            name: "Test User",
            email: "test@yoperks.dev",
            phone: "9999999999",
            location: { street: "MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001", lat: 12.9716, lng: 77.5946 },
            stats: { loyalty_points: 500, total_earned: 500, total_redeemed: 0, total_scans: 2 },
            upi_vpa: "test@upi",
            created_at: new Date(),
            updated_at: new Date(),
        });
        await db.collection("users").doc(testUid).set({
            uid: testUid, role: "user", email: "test@yoperks.dev", email_verified: true, created_at: new Date()
        });
        console.log(`✔  customer_profiles/${testUid}`);
        console.log(`✔  users/${testUid}`);
    }

    // 3. Seller profiles (near Bengaluru MG Road — 12.9716, 77.5946)
    const sellers = [
        {
            id: "seller_001",
            account: { name: "Ravi Kumar", email: "ravi@cafebrew.in", phone: "9876543210", established_year: 2019 },
            business: { shop_name: "Cafe Brew House", business_type: "Cafe", category: "Food & Beverage", description: "Artisan coffee and fresh bakes in the heart of Bengaluru." },
            location: { address: { street: "12, Brigade Road", city: "Bengaluru", state: "Karnataka", pincode: "560025", country: "India" }, lat: 12.9721, lng: 77.5933, radius_meters: 500 },
            rewards: { enabled: true, reward_type: "percentage", percentage_value: 5, default_points_value: 1, flat_points: 0, slab_rules: [], payment_reward_enabled: false, daily_max_points: 200, reward_name: "Brew Points", reward_description: "Earn 5 points for every ₹100 spent.", upi_ids: ["cafebrew@upi"] },
            media: { logo_url: "", banner_url: "" },
            stats: { total_points_distributed: 1200, total_redemptions: 45, total_customers: 120 },
            subscription: { status: "active", plan: "basic", expires_at: new Date("2026-12-31") },
            verification: { status: "verified", is_verified: true },
            user_id: "seller_001",
        },
        {
            id: "seller_002",
            account: { name: "Priya Sharma", email: "priya@booksnook.in", phone: "9123456780", established_year: 2021 },
            business: { shop_name: "Books & Nook", business_type: "Bookstore", category: "Books & Stationery", description: "Curated books, stationery, and cozy reading nooks." },
            location: { address: { street: "45, Church Street", city: "Bengaluru", state: "Karnataka", pincode: "560001", country: "India" }, lat: 12.9698, lng: 77.5972, radius_meters: 300 },
            rewards: { enabled: true, reward_type: "flat", percentage_value: 0, default_points_value: 1, flat_points: 50, slab_rules: [], payment_reward_enabled: false, daily_max_points: 150, reward_name: "Book Points", reward_description: "Earn flat 50 points per visit.", upi_ids: [] },
            media: { logo_url: "", banner_url: "" },
            stats: { total_points_distributed: 850, total_redemptions: 30, total_customers: 80 },
            subscription: { status: "active", plan: "basic", expires_at: new Date("2026-12-31") },
            verification: { status: "verified", is_verified: true },
            user_id: "seller_002",
        },
        {
            id: "seller_003",
            account: { name: "Anil Patil", email: "anil@freshbasket.in", phone: "9988776655", established_year: 2018 },
            business: { shop_name: "Fresh Basket Grocery", business_type: "Grocery", category: "Grocery & Supermarket", description: "Fresh produce, daily essentials, and organic options." },
            location: { address: { street: "78, Residency Road", city: "Bengaluru", state: "Karnataka", pincode: "560025", country: "India" }, lat: 12.9735, lng: 77.5910, radius_meters: 400 },
            rewards: { enabled: true, reward_type: "slab", percentage_value: 0, default_points_value: 1, flat_points: 0, slab_rules: [{ min: 0, max: 499, points: 10 }, { min: 500, max: 999, points: 30 }, { min: 1000, max: null, points: 75 }], payment_reward_enabled: true, daily_max_points: 300, reward_name: "Basket Points", reward_description: "Earn more points on bigger purchases.", upi_ids: ["freshbasket@upi"] },
            media: { logo_url: "", banner_url: "" },
            stats: { total_points_distributed: 3200, total_redemptions: 110, total_customers: 260 },
            subscription: { status: "active", plan: "pro", expires_at: new Date("2026-12-31") },
            verification: { status: "verified", is_verified: true },
            user_id: "seller_003",
        },
    ];

    const today = new Date().toISOString().slice(0, 10);
    for (const seller of sellers) {
        const { id, ...profile } = seller;
        await db.collection('seller_profiles').doc(id).set(profile);

        // users doc required by getSellerDetails
        await db.collection('users').doc(id).set({
            uid: id,
            role: 'seller',
            email: profile.account.email,
            email_verified: true,
            verified: true,
            created_at: new Date(),
        });

        // Daily offers for today
        await db.collection('seller_daily_offers').doc(`${id}_${today}`).set({
            seller_id: id,
            date: today,
            status: 'Active',
            offers: [
                { id: `${id}_offer_1`, title: '10% off on your next purchase', min_spend: 200, terms: 'Valid today only. Max discount ₹100.' },
                { id: `${id}_offer_2`, title: 'Free item on ₹500+ spend', min_spend: 500, terms: 'One free item per visit.' },
            ],
        });
        console.log(`✔  seller_profiles/${id} + daily offers`);
    }

    // 4. Seed initial points (matches customer_profiles.stats.loyalty_points: 500)
    if (testUid) {
        // Seed initial points — use deterministic ID so re-seeding doesn't create duplicates
        await db.collection('points').doc(`${testUid}_seller_001`).set({
            user_id: testUid,
            seller_id: 'seller_001',
            points: 500,
            created_at: new Date(),
            last_updated: new Date(),
        });
        console.log(`✔  points — 500 initial points for seller_001`);

        // Seed a historical transaction so Recent Activity tab is not empty
        await db.collection('transactions').doc(`${testUid}_seed_earn`).set({
            user_id: testUid,
            seller_id: 'seller_001',
            seller_name: 'Cafe Brew House',
            type: 'qr_scan',
            transaction_type: 'earn',
            points: 500,
            points_earned: 500,
            description: 'Earned 500 points on first visit',
            amount: 0,
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
            created_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
        });
        console.log(`✔  transactions — seed earn transaction`);
    }

    // 5. Test seller Auth user (maps to seller_001 — Cafe Brew House)
    let sellerUid = "seller_001"; // use fixed ID so seller_profiles doc matches
    try {
        await auth.createUser({
            uid: sellerUid,
            email: "seller@cafebrew.in",
            password: "Seller@1234",
            displayName: "Ravi Kumar",
        });
        console.log(`✔  Auth seller created: seller@cafebrew.in / Seller@1234 (uid: ${sellerUid})`);
    } catch (e) {
        if (e.code === "auth/email-already-exists" || e.code === "auth/uid-already-exists") {
            console.log(`ℹ  Auth seller already exists (uid: ${sellerUid})`);
        } else {
            console.error("✘  Auth seller creation failed:", e.message);
        }
    }

    // users doc for seller (role check in loginSeller)
    await db.collection("users").doc(sellerUid).set({
        uid: sellerUid,
        role: "seller",
        email: "seller@cafebrew.in",
        email_verified: true,
        verified: true,
        created_at: new Date(),
    });

    console.log("\nDone! Emulator seeded.");
    console.log("Login with: test@yoperks.dev / Test@1234");
    console.log("Seller login: seller@cafebrew.in / Seller@1234");
    console.log("3 seller profiles + today's offers added near MG Road, Bengaluru.");
    process.exit(0);
}

seed().catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
});
