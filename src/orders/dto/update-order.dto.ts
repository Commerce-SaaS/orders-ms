import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { OrderStatus } from 'src/common/enums/order-status.enum';
import { VoidReason } from 'src/common/enums/void-reason.enum';

export class UpdateOrderDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(VoidReason)
  voidReason?: VoidReason;

  @ValidateIf((o) => o.voidReason === VoidReason.OTHER)
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  voidReasonDetails?: string;
}
