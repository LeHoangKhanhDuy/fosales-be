import { ApiProperty } from '@nestjs/swagger';
import { PROMOTION_STATUSES } from '../promotions.utils';
import { DISCOUNT_TYPES, PROMOTION_KINDS, SCOPE_TYPES } from './promotion.dto';

class ScopeViewDto {
  @ApiProperty({ enum: SCOPE_TYPES }) type!: string;
  @ApiProperty({ type: [String] }) categoryIds!: string[];
  @ApiProperty({ type: [String] }) productIds!: string[];
}

class UsageDto {
  @ApiProperty({ example: 12 }) count!: number;
  @ApiProperty({ example: 480000 }) discount!: number;
  @ApiProperty({ example: 4500000 }) revenue!: number;
  @ApiProperty({ example: 5 }) last30Count!: number;
  @ApiProperty({ example: 200000 }) last30Discount!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastUsedAt!: Date | null;
}

export class PromotionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'FOSALE10' }) code!: string;
  @ApiProperty({ example: 'Giảm 10% toàn đơn' }) name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: PROMOTION_KINDS }) kind!: string;
  @ApiProperty({ enum: DISCOUNT_TYPES }) discountType!: string;
  @ApiProperty({ example: 10 }) discountValue!: number;
  @ApiProperty({ type: Number, nullable: true }) maxDiscount!: number | null;
  @ApiProperty({ type: Number, nullable: true }) minOrder!: number | null;
  @ApiProperty({ type: ScopeViewDto }) scope!: ScopeViewDto;
  @ApiProperty({ type: Number, nullable: true }) usageLimit!: number | null;
  @ApiProperty({ type: Number, nullable: true }) perCustomerLimit!: number | null;
  @ApiProperty() stackable!: boolean;
  @ApiProperty({ enum: ['draft', 'active', 'paused', 'ended'] }) state!: string;
  @ApiProperty({ enum: PROMOTION_STATUSES, description: 'Trạng thái hiển thị tính sẵn' })
  status!: string;
  @ApiProperty() startAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) endAt!: Date | null;
  @ApiProperty({ example: 12 }) usedCount!: number;
  @ApiProperty() createdBy!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: UsageDto }) usage!: UsageDto;
}

class StatusCountsDto {
  @ApiProperty() all!: number;
  @ApiProperty() draft!: number;
  @ApiProperty() scheduled!: number;
  @ApiProperty() running!: number;
  @ApiProperty() paused!: number;
  @ApiProperty() ended!: number;
}

export class PromotionPageDto {
  @ApiProperty({ type: [PromotionDto] }) items!: PromotionDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({ type: StatusCountsDto }) statusCounts!: StatusCountsDto;
}

class RedemptionCustomerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'KH000001' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() phone!: string;
}

export class RedemptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) orderId!: string;
  @ApiProperty({ example: 'HD261125-0001' }) orderCode!: string;
  @ApiProperty({ type: RedemptionCustomerDto, nullable: true })
  customer!: RedemptionCustomerDto | null;
  @ApiProperty({ example: 30000 }) discount!: number;
  @ApiProperty({ example: 270000 }) revenue!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) revokedAt!: Date | null;
}

export class RedemptionPageDto {
  @ApiProperty({ type: [RedemptionDto] }) items!: RedemptionDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class GeneratedCodeDto {
  @ApiProperty({ example: 'FOTECH7K2QXA' }) code!: string;
}

export class VoucherDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'FOSALE10' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: DISCOUNT_TYPES }) type!: string;
  @ApiProperty({ example: 10 }) value!: number;
  @ApiProperty({ type: Number, nullable: true }) maxDiscount!: number | null;
  @ApiProperty({ type: Number, nullable: true }) minOrder!: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) expiresAt!: Date | null;
  @ApiProperty({ type: ScopeViewDto }) scope!: ScopeViewDto;
  @ApiProperty() stackable!: boolean;
}
