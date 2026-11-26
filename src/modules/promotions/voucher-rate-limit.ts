import { Injectable } from '@nestjs/common';
import { PromotionErrors } from './promotions.errors';

export const VOUCHER_LIMIT = 20;
const WINDOW_MS = 60_000;

@Injectable()
export class VoucherRateLimit {
  private readonly hits = new Map<string, number[]>();

  consume(userId: string, now = Date.now()) {
    const recent = (this.hits.get(userId) ?? []).filter((at) => at > now - WINDOW_MS);
    if (recent.length >= VOUCHER_LIMIT) {
      this.hits.set(userId, recent);
      throw PromotionErrors.rateLimited(
        Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000)),
      );
    }
    recent.push(now);
    this.hits.set(userId, recent);
    if (this.hits.size > 10_000) this.prune(now);
  }

  private prune(now: number) {
    for (const [key, list] of this.hits) {
      if (!list.some((at) => at > now - WINDOW_MS)) this.hits.delete(key);
    }
  }
}
