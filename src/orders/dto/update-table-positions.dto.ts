import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class TablePositionItemDto {
  @IsUUID()
  id: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  posX: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  posY: number;
}

export class UpdateTablePositionsDto {
  @IsUUID()
  organizationId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TablePositionItemDto)
  positions: TablePositionItemDto[];
}
