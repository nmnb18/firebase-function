/**
 * Expo Push Notification Service - Node.js/TypeScript Implementation
 * Use this to send push notifications from your backend server
 * 
 * Prerequisites:
 * - npm install expo-server-sdk
 * 
 * Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/
 */

import { Expo, ExpoPushMessage, ExpoPushTicket, ExpoPushReceipt } from 'expo-server-sdk';

// Notification channels (must match Android channels defined in the app)
export enum NotificationChannel {
    DEFAULT = 'default',
    ORDERS = 'orders',
    PROMOTIONS = 'promotions',
    REMINDERS = 'reminders',
}

// Notification types for deep linking
export enum NotificationType {
    NEW_ORDER = 'new_order',
    ORDER_UPDATE = 'order_update',
    POINTS_EARNED = 'points_earned',
    REDEMPTION = 'redemption',
    OFFER = 'offer',
    REMINDER = 'reminder',
    GENERAL = 'general',
}

export interface NotificationData {
    type: NotificationType;
    screen?: string;
    params?: Record<string, any>;
    [key: string]: any;
}

export interface SendNotificationParams {
    token: string;
    title: string;
    body: string;
    data?: NotificationData;
    channelId?: NotificationChannel;
    sound?: 'default' | null;
    badge?: number;
    subtitle?: string; // iOS only
    priority?: 'default' | 'normal' | 'high';
    ttl?: number; // Time to live in seconds
}

export interface BulkNotificationResult {
    successful: number;
    failed: number;
    tickets: ExpoPushTicket[];
    invalidTokens: string[];
}

/**
 * Expo Push Notification Service
 */
export class ExpoPushService {
    private expo: Expo;

    constructor() {
        this.expo = new Expo();
    }

    /**
     * Validate if a token is a valid Expo push token
     */
    isValidToken(token: string): boolean {
        return Expo.isExpoPushToken(token);
    }

    /**
     * Send a single push notification
     */
    async sendNotification(params: SendNotificationParams): Promise<ExpoPushTicket> {
        const results = await this.sendBulkNotifications([params]);
        return results.tickets[0];
    }

    /**
     * Send notifications to multiple tokens
     */
    async sendBulkNotifications(
        notifications: SendNotificationParams[]
    ): Promise<BulkNotificationResult> {
        const messages: ExpoPushMessage[] = [];
        const invalidTokens: string[] = [];

        // Build messages and filter invalid tokens
        for (const notif of notifications) {
            if (!this.isValidToken(notif.token)) {
                console.warn(`[ExpoPush] Invalid token: ${notif.token}`);
                invalidTokens.push(notif.token);
                continue;
            }

            const message: ExpoPushMessage = {
                to: notif.token,
                title: notif.title,
                body: notif.body,
                data: notif.data || {},
                sound: notif.sound ?? 'default',
                priority: notif.priority ?? 'high',
                ttl: notif.ttl ?? 86400,
                channelId: notif.channelId ?? NotificationChannel.DEFAULT,
            };

            if (notif.badge !== undefined) {
                message.badge = notif.badge;
            }
            if (notif.subtitle) {
                message.subtitle = notif.subtitle;
            }

            messages.push(message);
        }

        if (messages.length === 0) {
            return {
                successful: 0,
                failed: invalidTokens.length,
                tickets: [],
                invalidTokens,
            };
        }

        // Chunk messages (Expo recommends max 100 per request)
        const chunks = this.expo.chunkPushNotifications(messages);
        const tickets: ExpoPushTicket[] = [];
        let successful = 0;
        let failed = invalidTokens.length;

        // Send each chunk
        for (const chunk of chunks) {
            try {
                const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);

                // Count successes and failures
                for (const ticket of ticketChunk) {
                    if (ticket.status === 'ok') {
                        successful++;
                    } else {
                        failed++;
                        // Check for invalid tokens
                        if (ticket.details?.error === 'DeviceNotRegistered') {
                            // Find the token that failed
                            const index = ticketChunk.indexOf(ticket);
                            if (index >= 0 && chunk[index]) {
                                invalidTokens.push(chunk[index].to as string);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('[ExpoPush] Error sending chunk:', error);
                failed += chunk.length;
            }
        }

        return {
            successful,
            failed,
            tickets,
            invalidTokens,
        };
    }

    /**
     * Send notification to all devices of a user
     */
    async sendToUser(
        userTokens: string[],
        title: string,
        body: string,
        data?: NotificationData,
        channelId?: NotificationChannel
    ): Promise<BulkNotificationResult> {
        const notifications: SendNotificationParams[] = userTokens.map((token) => ({
            token,
            title,
            body,
            data,
            channelId,
        }));

        return this.sendBulkNotifications(notifications);
    }

    /**
     * Check receipts for sent notifications
     * Call this after some time to verify delivery status
     */
    async checkReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
        const receiptIdChunks = this.expo.chunkPushNotificationReceiptIds(ticketIds);
        const receipts: Record<string, ExpoPushReceipt> = {};

        for (const chunk of receiptIdChunks) {
            try {
                const receiptChunk = await this.expo.getPushNotificationReceiptsAsync(chunk);
                Object.assign(receipts, receiptChunk);
            } catch (error) {
                console.error('[ExpoPush] Error fetching receipts:', error);
            }
        }

        return receipts;
    }

    /**
     * Get tokens that should be removed from database
     * Call this with receipts to find invalid/expired tokens
     */
    getTokensToRemove(receipts: Record<string, ExpoPushReceipt>): string[] {
        const tokensToRemove: string[] = [];

        for (const [receiptId, receipt] of Object.entries(receipts)) {
            if (receipt.status === 'error') {
                if (
                    receipt.details?.error === 'DeviceNotRegistered' ||
                    receipt.details?.error === 'InvalidCredentials'
                ) {
                    // This token is no longer valid
                    console.warn(`[ExpoPush] Invalid token for receipt ${receiptId}`);
                    // Note: You'll need to track which token corresponds to which receipt
                }
            }
        }

        return tokensToRemove;
    }
}

// ============================================
// Pre-built notification templates
// ============================================

export const NotificationTemplates = {
    newOrder: (orderId: string, customerName: string): SendNotificationParams => ({
        token: '', // Fill in token
        title: '🎉 New Order!',
        body: `${customerName} placed order #${orderId}`,
        data: {
            type: NotificationType.NEW_ORDER,
            screen: '/(drawer)/redemptions',
            params: { orderId },
        },
        channelId: NotificationChannel.ORDERS,
    }),

    pointsEarned: (points: number, customerName: string): SendNotificationParams => ({
        token: '',
        title: '⭐ Points Awarded',
        body: `${customerName} earned ${points} points`,
        data: {
            type: NotificationType.POINTS_EARNED,
            screen: '/(drawer)/(tabs)/dashboard',
        },
        channelId: NotificationChannel.ORDERS,
    }),

    redemption: (redeemCode: string, offerTitle: string): SendNotificationParams => ({
        token: '',
        title: '🎁 New Redemption',
        body: `Customer wants to redeem: ${offerTitle}`,
        data: {
            type: NotificationType.REDEMPTION,
            screen: '/(drawer)/redemptions',
            params: { code: redeemCode },
        },
        channelId: NotificationChannel.ORDERS,
    }),

    offerReminder: (offerDate: string): SendNotificationParams => ({
        token: '',
        title: '📅 Offer Reminder',
        body: `Your offer goes live tomorrow (${offerDate})`,
        data: {
            type: NotificationType.OFFER,
            screen: '/(drawer)/whats-new/whats-new-home',
        },
        channelId: NotificationChannel.REMINDERS,
    }),

    dailySummary: (
        totalScans: number,
        totalPoints: number,
        totalRedemptions: number
    ): SendNotificationParams => ({
        token: '',
        title: '📊 Daily Summary',
        body: `Today: ${totalScans} scans, ${totalPoints} points, ${totalRedemptions} redemptions`,
        data: {
            type: NotificationType.GENERAL,
            screen: '/(drawer)/(tabs)/dashboard',
        },
        channelId: NotificationChannel.REMINDERS,
    }),

    promotion: (title: string, body: string): SendNotificationParams => ({
        token: '',
        title,
        body,
        data: {
            type: NotificationType.OFFER,
            screen: '/(drawer)/whats-new/whats-new-home',
        },
        channelId: NotificationChannel.PROMOTIONS,
    }),
};


export const pushService = new ExpoPushService();
export default pushService;
