import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsString, ValidateNested } from 'class-validator';
import { CUSTOMER_TIERS, type CustomerTierValue } from './customer-query.dto';

export class TierSettingDto {
  @ApiProperty({ enum: CUSTOMER_TIERS })
  @IsIn(CUSTOMER_TIERS, { message: 'Hạng không hợp lệ' })
  tier!: CustomerTierValue;

  @ApiProperty({ example: 'Bạc' })
  @IsString({ message: 'Tên hạng không hợp lệ' })
  label!: string;

  @ApiProperty({ example: 1000000 })
  @IsNumber({}, { message: 'Mức chi tiêu không hợp lệ' })
  minSpent!: number;

  @ApiProperty({ example: 2 })
  @IsNumber({}, { message: 'Ưu đãi không hợp lệ' })
  discountPercent!: number;

  @ApiProperty({ example: 1.2 })
  @IsNumber({}, { message: 'Hệ số điểm không hợp lệ' })
  pointMultiplier!: number;

  @ApiProperty({ example: 'Giảm 2% mỗi hóa đơn, x1.2 điểm' })
  @IsString({ message: 'Quyền lợi không hợp lệ' })
  perks!: string;
}

export class MembershipDto {
  @ApiProperty({ example: 10000, description: 'Số tiền cho 1 điểm' })
  @IsNumber({}, { message: 'Số tiền cho 1 điểm không hợp lệ' })
  amountPerPoint!: number;

  @ApiProperty({ example: 100, description: 'Giá trị 1 điểm khi đổi' })
  @IsNumber({}, { message: 'Giá trị điểm không hợp lệ' })
  pointValue!: number;

  @ApiProperty({ type: [TierSettingDto] })
  @IsArray({ message: 'Danh sách hạng không hợp lệ' })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TierSettingDto)
  tiers!: TierSettingDto[];
}

export class MembershipUpdateResultDto {
  @ApiProperty({ type: MembershipDto }) settings!: MembershipDto;
  @ApiProperty({ example: 3 }) changedTiers!: number;
}
