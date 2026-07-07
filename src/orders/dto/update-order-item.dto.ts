import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';
import { CreateOrderItemExtraDto } from './create-order-item-extra.dto';
import { CreateOrderItemRemovedIngredientDto } from './create-order-remove-ingredient.dto';

export class UpdateOrderItemDto {
  @IsUUID()
  orderId: string;

  @IsUUID()
  itemId: string;

  @IsUUID()
  organizationId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemExtraDto)
  extras?: CreateOrderItemExtraDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemRemovedIngredientDto)
  removedIngredients?: CreateOrderItemRemovedIngredientDto[];
}
