import { z } from "zod";

export const clientLogLevelSchema = z.enum(["debug", "info", "warn", "error", "fatal"]);
export const clientLogSourceSchema = z.enum([
    "error_boundary",
    "network",
    "unhandled_rejection",
    "manual",
]);

export const clientLogEntrySchema = z.object({
    level: clientLogLevelSchema,
    source: clientLogSourceSchema,
    message: z.string().max(2000),
    stack: z.string().max(5000).optional(),
    componentStack: z.string().max(5000).optional(),
    endpoint: z.string().max(500).optional(),
    httpStatus: z.number().int().min(100).max(599).optional(),
    appVersion: z.string().max(30),
    platform: z.enum(["ios", "android", "unknown"]),
    appId: z.enum(["user", "seller"]),
    timestamp: z.string().datetime(),
    metadata: z.record(z.unknown()).optional(),
});

export const clientLogBatchSchema = z.object({
    logs: z.array(clientLogEntrySchema).min(1).max(50),
});

export type ClientLogEntry = z.infer<typeof clientLogEntrySchema>;
export type ClientLogBatch = z.infer<typeof clientLogBatchSchema>;
