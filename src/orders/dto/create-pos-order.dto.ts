import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePosOrderDto {
  @IsUUID()
  organizationId: string;

  @IsOptional()
  @IsString()
  customerName?: string;
}
