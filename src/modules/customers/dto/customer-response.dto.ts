import { ApiProperty } from '@nestjs/swagger';
import { CUSTOMER_TIERS, POINT_LOG_TYPES } from './customer-query.dto';
import { CUSTOMER_STATUSES, GENDERS } from './customer.dto';

export class CustomerLiteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'KH000001' }) code!: string;
  @ApiProperty({ example: 'Nguyễn Minh Anh' }) name!: string;
  @ApiProperty({ example: '0901234567' }) phone!: string;
  @ApiProperty({ enum: CUSTOMER_TIERS }) tier!: string;
  @ApiProperty({ example: 320 }) points!: number;
  @ApiProperty({ enum: CUSTOMER_STATUSES }) status!: string;
}

class CustomerStatsDto {
  @ApiProperty({ example: 0 }) spent!: number;
  @ApiProperty({ example: 0 }) orders!: number;
  @ApiProperty({ example: 0 }) avgOrder!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastOrderAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) firstOrderAt!: Date | null;
  @ApiProperty({ example: 0, description: '0 cho tới khi có module Đơn hàng' }) orders30!: number;
}

class NextTierDto {
  @ApiProperty({ enum: CUSTOMER_TIERS }) tier!: string;
  @ApiProperty({ example: 'Vàng' }) label!: string;
  @ApiProperty({ example: 3000000 }) minSpent!: number;
  @ApiProperty({ example: 800000 }) remaining!: number;
  @ApiProperty({ example: 60, description: '0–100' }) progress!: number;
}

export class CustomerDto extends CustomerLiteDto {
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ enum: GENDERS, nullable: true }) gender!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '1990-11-25' }) birthday!: string | null;
  @ApiProperty({ type: String, nullable: true }) address!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ example: 3200000 }) legacySpent!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: CustomerStatsDto }) stats!: CustomerStatsDto;
  @ApiProperty({ example: 3200000, description: 'legacySpent + stats.spent' }) totalSpent!: number;
  @ApiProperty({ type: NextTierDto, nullable: true }) nextTier!: NextTierDto | null;
}

class TierCountsDto {
  @ApiProperty() all!: number;
  @ApiProperty() retail!: number;
  @ApiProperty() silver!: number;
  @ApiProperty() gold!: number;
  @ApiProperty() diamond!: number;
}

export class CustomerPageDto {
  @ApiProperty({ type: [CustomerDto] }) items!: CustomerDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({ type: TierCountsDto }) tierCounts!: TierCountsDto;
}

export class CustomerStatsSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty() new30!: number;
  @ApiProperty() active30!: number;
  @ApiProperty({ description: '0 cho tới khi có module Đơn hàng' }) returning!: number;
  @ApiProperty({ description: 'Σ điểm khách active' }) points!: number;
  @ApiProperty({ description: 'Khách active sinh nhật tháng này' }) birthday!: number;
}

export class PointLogDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) customerId!: string;
  @ApiProperty({ enum: POINT_LOG_TYPES }) type!: string;
  @ApiProperty({ example: 50 }) points!: number;
  @ApiProperty({ example: 370 }) balance!: number;
  @ApiProperty({ type: String, nullable: true }) refCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ example: 'Quốc Huy' }) createdBy!: string;
}

export class PointLogPageDto {
  @ApiProperty({ type: [PointLogDto] }) items!: PointLogDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class AdjustPointsResultDto {
  @ApiProperty({ type: CustomerDto }) customer!: CustomerDto;
  @ApiProperty({ type: PointLogDto }) log!: PointLogDto;
}

export class CustomerOrderPageDto {
  @ApiProperty({ type: [Object], description: '[] cho tới khi có module Đơn hàng' })
  items!: object[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
