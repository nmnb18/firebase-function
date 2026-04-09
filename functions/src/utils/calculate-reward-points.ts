/**
 * Universal reward calculator — shared between QR scan and UPI payment flows.
 * Supports: percentage | flat | slab | default
 *
 * @param amount  Purchase amount in INR (not paise)
 * @param seller  Seller profile document data (must have `.rewards` field)
 * @returns       Integer points to award (always rounded to nearest whole number)
 *
 * Rounding behavior for percentage type:
 * - Uses Math.round() to ensure fair rounding (0.5 rounds up)
 * - Example: 10% of ₹145 = 14.5 → 15 points
 * - Example: 10% of ₹144 = 14.4 → 14 points
 */
export function calculateRewardPoints(amount: number, seller: any): number {
    const config = seller.rewards || {};
    switch (config.reward_type) {
        case "percentage":
            if (!config.percentage_value) return 0;
            // Always round to nearest integer (0.5 rounds up)
            return Math.round((config.percentage_value / 100) * amount);

        case "flat":
            // Flat points should be integer, but ensure it
            return Math.round(config.flat_points || 0);

        case "slab": {
            if (!Array.isArray(config.slab_rules) || config.slab_rules.length === 0) return 0;
            for (const rule of config.slab_rules) {
                if (amount >= rule.min && amount <= rule.max) {
                    return Math.round(rule.points || 0);
                }
            }
            const last = config.slab_rules[config.slab_rules.length - 1];
            if (last && amount > last.max) return Math.round(last.points || 0);
            return 0;
        }

        case "default":
        default:
            return Math.round(config.default_points_value || 1);
    }
}
