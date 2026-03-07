import { Type } from 'class-transformer';
import {
  IsUUID,
  Min,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  IsString,
  IsNumber,
  Length,
} from 'class-validator';
import { CreateOrderItemRemovedIngredientDto } from './create-order-remove-ingredient.dto';
import { CreateOrderItemExtraDto } from './create-order-item-extra.dto';

export class CreateOrderItemDto {
  @IsUUID()
  productId: string;

  @IsString()
  @Length(1, 100)
  name: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

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
