import { z } from 'zod';
import { PurchaseErrors } from '../purchasing.errors';

const line = z
  .object({
    productId: z.string().uuid(),
    scannedQty: z.number().int().min(0).max(1_000_000),
    damagedQty: z.number().int().min(0).max(1_000_000),
  })
  .passthrough();

export const receivingDraftSchema = z
  .object({
    step: z.enum(['check-in', 'count', 'review']),
    checkIn: z.object({}).passthrough(),
    lines: z.array(line).max(500),
    scans: z.array(z.object({}).passthrough()).max(50),
    note: z.string().max(500).optional(),
    approvedBy: z.string().max(100).optional(),
    startedAt: z.string().max(40).optional(),
  })
  .passthrough();

export type ReceivingDraftData = z.infer<typeof receivingDraftSchema>;

export function parseReceivingDraft(body: unknown): ReceivingDraftData {
  const result = receivingDraftSchema.safeParse(body);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw PurchaseErrors.draftInvalid(
    `Phiên kiểm đếm không hợp lệ: ${issue.path.join('.') || 'body'} ${issue.message}`,
  );
}
