import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PAYMENT_METHODS, SUPPLIER_STATUSES } from './supplier.dto';

export class SupplierSummaryDto {
  @ApiProperty({ example: 0, description: 'Đếm từ đơn đặt hàng (module Nhập hàng)' })
  orderCount!: number;
  @ApiProperty({ example: 0 }) openOrders!: number;
  @ApiProperty({ example: 125000000 }) purchased!: number;
  @ApiProperty({ example: 98000000 }) paid!: number;
  @ApiProperty({ example: 27000000 }) debt!: number;
  @ApiProperty({ example: 5000000 }) overdue!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastReceiptAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) nextDueAt!: Date | null;
}

export class SupplierDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'NCC001' }) code!: string;
  @ApiProperty({ example: 'Công ty TNHH Phân phối Minh Phát' }) name!: string;
  @ApiProperty({ example: 'Anh Tuấn' }) contact!: string;
  @ApiProperty({ example: '0903112233' }) phone!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty() address!: string;
  @ApiProperty({ type: String, nullable: true }) taxCode!: string | null;
  @ApiProperty({ type: [String], format: 'uuid' }) categoryIds!: string[];
  @ApiProperty({ example: 15 }) paymentTermDays!: number;
  @ApiProperty({ type: String, nullable: true }) bankName!: string | null;
  @ApiProperty({ type: String, nullable: true }) bankAccount!: string | null;
  @ApiProperty({ type: String, nullable: true }) bankHolder!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ enum: SUPPLIER_STATUSES }) status!: string;
  @ApiProperty({ type: String, nullable: true }) suspendReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) suspendedUntil!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class SupplierListItemDto extends SupplierDto {
  @ApiProperty({ type: SupplierSummaryDto }) summary!: SupplierSummaryDto;
}

class TabCountsDto {
  @ApiProperty() all!: number;
  @ApiProperty() active!: number;
  @ApiProperty() suspended!: number;
  @ApiProperty() inactive!: number;
  @ApiProperty() debt!: number;
}

export class SupplierPageDto {
  @ApiProperty({ type: [SupplierListItemDto] }) items!: SupplierListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({ type: TabCountsDto, description: 'Theo keyword + danh mục, bỏ qua tab' })
  tabCounts!: TabCountsDto;
}

export class SupplierStatsDto {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() suspended!: number;
  @ApiProperty({ description: 'Tổng giá trị nhập 30 ngày' }) purchased30!: number;
  @ApiProperty({ example: 0 }) openOrders!: number;
  @ApiProperty() debt!: number;
  @ApiProperty({ description: 'Số NCC đang nợ' }) debtors!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty({ description: 'Số NCC có nợ quá hạn' }) overdueCount!: number;
}

export class SupplierOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() paymentTermDays!: number;
  @ApiProperty({ enum: SUPPLIER_STATUSES }) status!: string;
  @ApiProperty({ type: [String], format: 'uuid' }) categoryIds!: string[];
}

export class NextCodeDto {
  @ApiProperty({ example: 'NCC008' }) code!: string;
}

export class LedgerEntryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['receipt', 'payment', 'return', 'adjustment'] }) kind!: string;
  @ApiProperty({ example: 'PC251125-0001' }) code!: string;
  @ApiProperty({ example: 'Chuyển khoản · FT26112512345' }) label!: string;
  @ApiProperty() at!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) dueAt!: Date | null;
  @ApiProperty({ example: -5000000 }) amount!: number;
  @ApiProperty({ example: 22000000, description: 'Số dư sau bút toán' }) balance!: number;
}

export class LedgerPageDto {
  @ApiProperty({ type: [LedgerEntryDto] }) items!: LedgerEntryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class SupplierPaymentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'PC251125-0001' }) code!: string;
  @ApiProperty({ format: 'uuid' }) supplierId!: string;
  @ApiProperty({ example: 5000000 }) amount!: number;
  @ApiProperty({ enum: PAYMENT_METHODS }) method!: string;
  @ApiProperty({ type: String, nullable: true }) reference!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() paidAt!: Date;
  @ApiProperty({ example: 'Quốc Huy' }) paidBy!: string;
}

export class PaymentPageDto {
  @ApiProperty({ type: [SupplierPaymentDto] }) items!: SupplierPaymentDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class PaymentResultDto {
  @ApiProperty({ type: SupplierPaymentDto }) payment!: SupplierPaymentDto;
  @ApiProperty({ type: SupplierListItemDto }) supplier!: SupplierListItemDto;
}
