import { Injectable } from '@nestjs/common';
import { Prisma, type CustomerStatus, type CustomerTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerErrors } from './customers.errors';
import { money, TIER_ORDER } from './customers.utils';
import {
  DEFAULT_MEMBERSHIP,
  earnedPoints,
  type Membership,
  tierSetting,
  validateMembership,
} from './membership.rules';
import { PointLedger } from './point-ledger.service';

type Tx = Prisma.TransactionClient;

const CACHE_MS = 60_000;

export interface OrderPoints {
  customerId: string;
  orderTotal: number;
  orderCode: string;
  userId: string;
}

@Injectable()
export class MembershipService {
  private cache?: { value: Membership; expires: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: PointLedger,
  ) {}

  async settings(): Promise<Membership> {
    if (this.cache && this.cache.expires > Date.now()) return this.cache.value;
    const value = await this.load();
    this.cache = { value, expires: Date.now() + CACHE_MS };
    return value;
  }

  async update(input: Membership, userId: string) {
    const settings = validateMembership(input);
    const changedTiers = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fosales:membership'))`;
      const data = {
        amountPerPoint: settings.amountPerPoint,
        pointValue: settings.pointValue,
        updatedById: userId,
      };
      await tx.membershipSettings.upsert({
        where: { id: 1 },
        update: data,
        create: { id: 1, ...data },
      });
      for (const [sortOrder, tier] of settings.tiers.entries()) {
        const row = {
          label: tier.label,
          minSpent: BigInt(tier.minSpent),
          discountPercent: new Prisma.Decimal(tier.discountPercent),
          pointMultiplier: new Prisma.Decimal(tier.pointMultiplier),
          perks: tier.perks,
          sortOrder,
        };
        await tx.membershipTier.upsert({
          where: { tier: tier.tier },
          update: row,
          create: { tier: tier.tier, ...row },
        });
      }
      return tx.$executeRaw`
        UPDATE customers SET tier = ${tierCase(settings)}, updated_at = now()
        WHERE tier <> ${tierCase(settings)}`;
    });
    this.cache = undefined;
    return { settings: await this.settings(), changedTiers };
  }

  async discountFor(customer: { tier: CustomerTier; status: CustomerStatus }) {
    if (customer.status !== 'active') return 0;
    return tierSetting(await this.settings(), customer.tier).discountPercent;
  }

  async applyOrder(tx: Tx, input: OrderPoints & { at?: Date }) {
    const at = input.at ?? new Date();
    const customer = await this.lockActive(tx, input.customerId);
    const settings = await this.settings();
    const earned = earnedPoints(settings, customer.tier, input.orderTotal);
    if (earned > 0) {
      await this.ledger.apply(tx, {
        customerId: input.customerId,
        type: 'earn',
        points: earned,
        refCode: input.orderCode,
        userId: input.userId,
        at,
      });
    }
    await tx.$executeRaw`
      UPDATE customers SET
        spent = spent + ${BigInt(input.orderTotal)},
        order_count = order_count + 1,
        first_order_at = LEAST(COALESCE(first_order_at, ${at}), ${at}),
        last_order_at = GREATEST(COALESCE(last_order_at, ${at}), ${at}),
        updated_at = now()
      WHERE id = ${input.customerId}::uuid`;
    const tierAfter = await this.refreshTier(tx, input.customerId, settings);
    return { earned, tierBefore: customer.tier, tierAfter };
  }

  async revokeOrder(
    tx: Tx,
    input: OrderPoints & { earnedPoints: number; keepOrderCount?: boolean },
  ) {
    const customer = await this.lock(tx, input.customerId);
    const revoked = Math.max(0, Math.min(input.earnedPoints, customer.points));
    if (revoked > 0) {
      await this.ledger.apply(tx, {
        customerId: input.customerId,
        type: 'revoke',
        points: -revoked,
        refCode: input.orderCode,
        userId: input.userId,
      });
    }
    await tx.$executeRaw`
      UPDATE customers SET
        spent = GREATEST(spent - ${BigInt(input.orderTotal)}, 0),
        order_count = GREATEST(order_count - ${input.keepOrderCount ? 0 : 1}, 0),
        updated_at = now()
      WHERE id = ${input.customerId}::uuid`;
    const tierAfter = await this.refreshTier(tx, input.customerId, await this.settings());
    return { revoked, tierBefore: customer.tier, tierAfter };
  }

  async redeem(
    tx: Tx,
    input: {
      customerId: string;
      points: number;
      orderCode?: string | null;
      reason?: string | null;
      userId: string;
    },
  ) {
    if (!Number.isInteger(input.points) || input.points <= 0) throw CustomerErrors.pointsZero();
    await this.lockActive(tx, input.customerId);
    const result = await this.ledger.apply(tx, {
      customerId: input.customerId,
      type: 'redeem',
      points: -input.points,
      refCode: input.orderCode,
      reason: input.reason,
      userId: input.userId,
    });
    return { ...result, value: input.points * (await this.settings()).pointValue };
  }

  async refreshTier(tx: Tx, customerId: string, settings: Membership) {
    const [row] = await tx.$queryRaw<{ tier: CustomerTier }[]>`
      UPDATE customers SET tier = ${tierCase(settings)}
      WHERE id = ${customerId}::uuid
      RETURNING tier`;
    return row.tier;
  }

  private async lock(tx: Tx, customerId: string) {
    const [customer] = await tx.$queryRaw<
      { tier: CustomerTier; status: CustomerStatus; points: number }[]
    >`
      SELECT tier, status, points FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`;
    if (!customer) throw CustomerErrors.notFound();
    return customer;
  }

  private async lockActive(tx: Tx, customerId: string) {
    const customer = await this.lock(tx, customerId);
    if (customer.status !== 'active') throw CustomerErrors.blocked();
    return customer;
  }

  private async load(): Promise<Membership> {
    const [settings, tiers] = await Promise.all([
      this.prisma.membershipSettings.findUnique({ where: { id: 1 } }),
      this.prisma.membershipTier.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    if (!settings || tiers.length !== TIER_ORDER.length) return this.seedDefaults();
    return {
      amountPerPoint: settings.amountPerPoint,
      pointValue: settings.pointValue,
      tiers: tiers.map((row) => ({
        tier: row.tier,
        label: row.label,
        minSpent: money(row.minSpent),
        discountPercent: row.discountPercent.toNumber(),
        pointMultiplier: row.pointMultiplier.toNumber(),
        perks: row.perks,
      })),
    };
  }

  private async seedDefaults() {
    const { tiers, ...settings } = DEFAULT_MEMBERSHIP;
    await this.prisma.$transaction([
      this.prisma.membershipSettings.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, ...settings },
      }),
      this.prisma.membershipTier.createMany({
        data: tiers.map((tier, sortOrder) => ({
          ...tier,
          minSpent: BigInt(tier.minSpent),
          sortOrder,
        })),
        skipDuplicates: true,
      }),
    ]);
    return this.load();
  }
}

export function tierCase(settings: Membership) {
  const branches = [...settings.tiers]
    .sort((a, b) => b.minSpent - a.minSpent)
    .map(
      (t) =>
        Prisma.sql`WHEN legacy_spent + spent >= ${BigInt(t.minSpent)} THEN ${t.tier}::"CustomerTier"`,
    );
  return Prisma.sql`CASE ${Prisma.join(branches, ' ')} ELSE 'retail'::"CustomerTier" END`;
}
