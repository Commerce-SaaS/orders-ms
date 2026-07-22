import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
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
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

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

  // undefined = leave unchanged; null = unschedule (revert to "for now");
  // a Date = reschedule (re-validated against slot config + capacity).
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledFor?: Date | null;
}
