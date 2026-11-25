import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const STATUSES = ['draft', 'ordered', 'receiving', 'partial', 'completed', 'cancelled'];

class ItemProductDto {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ example: 'Coca-Cola lon 330ml' }) name!: string;
  @ApiProperty({ example: 'SP0001' }) sku!: string;
  @ApiProperty({ type: String, nullable: true, example: '8935049500018' }) barcode!: string | null;
  @ApiProperty({ example: 'lon' }) unit!: string;
}

export class PurchaseOrderItemDto extends ItemProductDto {
  @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @ApiProperty({ type: String, nullable: true }) image!: string | null;
  @ApiProperty({ enum: ['cover', 'contain', 'auto'] }) imageFit!: string;
  @ApiProperty({ example: 96 }) orderedQty!: number;
  @ApiProperty({ example: 7200 }) unitCost!: number;
  @ApiProperty({ example: 24 }) packSize!: number;
  @ApiProperty({ example: 0 }) receivedQty!: number;
  @ApiProperty({ example: 0 }) damagedQty!: number;
}

export class SuggestionDto extends PurchaseOrderItemDto {
  @ApiProperty({ example: 3 }) stock!: number;
  @ApiProperty({ example: 20 }) minStock!: number;
}

export class GoodsReceiptLineDto extends ItemProductDto {
  @ApiProperty({ example: 96 }) expectedQty!: number;
  @ApiProperty({ example: 96 }) scannedQty!: number;
  @ApiProperty({ example: 94 }) acceptedQty!: number;
  @ApiProperty({ example: 2 }) damagedQty!: number;
  @ApiProperty({ example: 0 }) returnedQty!: number;
  @ApiProperty({ example: 7200 }) unitCost!: number;
  @ApiProperty() extra!: boolean;
  @ApiProperty({ type: String, nullable: true, example: '2027-06-30' }) expiryDate!: string | null;
  @ApiProperty({ type: String, nullable: true }) lotNo!: string | null;
}

export class GoodsReceiptBaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'PN261125-0001' }) code!: string;
  @ApiProperty() receivedAt!: Date;
  @ApiProperty({ example: 'Quốc Huy' }) receivedBy!: string;
  @ApiProperty({ example: 'HD-MP-0912' }) supplierDocNo!: string;
  @ApiProperty({ example: 8 }) packageCount!: number;
  @ApiProperty() packagingOk!: boolean;
  @ApiProperty({ type: String, nullable: true }) deliveredBy!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true }) approvedBy!: string | null;
  @ApiProperty({ example: 1382400 }) grossValue!: number;
  @ApiProperty({ example: 0 }) discount!: number;
  @ApiProperty({ example: 1382400 }) value!: number;
}

export class GoodsReceiptDto extends GoodsReceiptBaseDto {
  @ApiProperty({ type: [GoodsReceiptLineDto] }) lines!: GoodsReceiptLineDto[];
}

export class GoodsReceiptListItemDto extends GoodsReceiptBaseDto {
  @ApiProperty({ format: 'uuid' }) poId!: string;
  @ApiProperty({ example: 'DH261125-0001' }) poCode!: string;
  @ApiProperty({ format: 'uuid' }) supplierId!: string;
  @ApiProperty() supplierName!: string;
}

class ReceiptSupplierDto {
  @ApiProperty({ example: 'NCC001' }) code!: string;
  @ApiProperty() address!: string;
  @ApiProperty({ type: String, nullable: true }) taxCode!: string | null;
  @ApiProperty() phone!: string;
}

export class GoodsReceiptDetailDto extends GoodsReceiptDto {
  @ApiProperty({ format: 'uuid' }) poId!: string;
  @ApiProperty({ example: 'DH261125-0001' }) poCode!: string;
  @ApiProperty({ format: 'uuid' }) supplierId!: string;
  @ApiProperty() supplierName!: string;
  @ApiProperty({ type: ReceiptSupplierDto }) supplier!: ReceiptSupplierDto;
}

export class GoodsReceiptPageDto {
  @ApiProperty({ type: [GoodsReceiptListItemDto] }) items!: GoodsReceiptListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

class TotalsDto {
  @ApiProperty({ example: 1382400 }) subtotal!: number;
  @ApiProperty({ example: 1332400 }) total!: number;
  @ApiProperty({ example: 216 }) orderedQty!: number;
  @ApiProperty({ example: 0 }) receivedQty!: number;
  @ApiProperty({ example: 4 }) lines!: number;
  @ApiProperty({ example: 0 }) receivedValue!: number;
}

class HistoryDto {
  @ApiProperty({ example: 'Tạo đơn đặt hàng' }) label!: string;
  @ApiProperty() at!: Date;
  @ApiProperty({ example: 'Quốc Huy' }) by!: string;
}

export class PurchaseOrderListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'DH261125-0001' }) code!: string;
  @ApiProperty({ format: 'uuid' }) supplierId!: string;
  @ApiProperty() supplierName!: string;
  @ApiProperty({ enum: STATUSES }) status!: string;
  @ApiProperty({ example: 0 }) discount!: number;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ example: '2026-11-28' }) expectedDate!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() createdBy!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) placedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) completedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) cancelReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) cancelledAt!: Date | null;
  @ApiProperty({ type: TotalsDto }) totals!: TotalsDto;
  @ApiProperty() overdue!: boolean;
  @ApiProperty({ type: String, nullable: true }) receivingBy!: string | null;
}

export class PurchaseOrderDto extends PurchaseOrderListItemDto {
  @ApiProperty({ type: [PurchaseOrderItemDto] }) items!: PurchaseOrderItemDto[];
  @ApiProperty({ type: [HistoryDto] }) history!: HistoryDto[];
  @ApiProperty({ type: [GoodsReceiptDto] }) receipts!: GoodsReceiptDto[];
  @ApiProperty({ type: Object, nullable: true, description: 'ReceivingDraft của FE' })
  draftReceipt!: Record<string, unknown> | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Gửi lại qua If-Match khi lưu nháp' })
  draftVersion!: number | null;
}

class PurchaseTabCountsDto {
  @ApiProperty() open!: number;
  @ApiProperty() all!: number;
  @ApiProperty() draft!: number;
  @ApiProperty() ordered!: number;
  @ApiProperty() partial!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() cancelled!: number;
}

export class PurchaseOrderPageDto {
  @ApiProperty({ type: [PurchaseOrderListItemDto] }) items!: PurchaseOrderListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({ type: PurchaseTabCountsDto }) tabCounts!: PurchaseTabCountsDto;
}

export class PurchaseSummaryDto {
  @ApiProperty({ example: 5 }) open!: number;
  @ApiProperty({ example: 1 }) overdue!: number;
  @ApiProperty({ example: 1 }) receiving!: number;
  @ApiProperty({ example: 2 }) draft!: number;
}

export class ReceivingSavedDto {
  @ApiProperty({ type: PurchaseOrderListItemDto }) order!: PurchaseOrderListItemDto;
  @ApiProperty({ example: 2 }) version!: number;
}

export class ReceiveResultDto {
  @ApiProperty({ type: PurchaseOrderDto }) order!: PurchaseOrderDto;
  @ApiProperty({ type: GoodsReceiptDetailDto }) receipt!: GoodsReceiptDetailDto;
}

export class ReceivingDraftBodyDto {
  @ApiProperty({ enum: ['check-in', 'count', 'review'] }) step!: string;
  @ApiProperty({ type: Object }) checkIn!: Record<string, unknown>;
  @ApiProperty({
    type: [Object],
    description: '≤ 500 dòng, mỗi dòng có productId, scannedQty, damagedQty',
  })
  lines!: Record<string, unknown>[];
  @ApiProperty({ type: [Object], description: '≤ 50 lần quét gần nhất' }) scans!: Record<
    string,
    unknown
  >[];
  @ApiPropertyOptional() note?: string;
  @ApiPropertyOptional() approvedBy?: string;
  @ApiPropertyOptional() startedAt?: string;
}
