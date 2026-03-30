/**
 * Universal reward calculator — shared between QR scan and UPI payment flows.
 * Supports: percentage | flat | slab | default
 *
 * @param amount  Purchase amount in INR (not paise)
 * @param seller  Seller profile document data (must have `.rewards` field)
 * @returns       Integer points to award
 */
export function calculateRewardPoints(amount: number, seller: any): number {
    const config = seller.rewards || {};
    switch (config.reward_type) {
        case "percentage":
            if (!config.percentage_value) return 0;
            return Math.round((config.percentage_value / 100) * amount);

        case "flat":
            return config.flat_points || 0;

        case "slab": {
            if (!Array.isArray(config.slab_rules) || config.slab_rules.length === 0) return 0;
            for (const rule of config.slab_rules) {
                if (amount >= rule.min && amount <= rule.max) return rule.points;
            }
            const last = config.slab_rules[config.slab_rules.length - 1];
            if (last && amount > last.max) return last.points;
            return 0;
        }

        case "default":
        default:
            return config.default_points_value || 1;
    }
}
