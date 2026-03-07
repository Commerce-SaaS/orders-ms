import { IsString, IsUUID, Length } from "class-validator";

export class CreateOrderItemRemovedIngredientDto {
  @IsUUID()
  ingredientId: string;

  @IsString()
  @Length(1, 100)
  ingredientName: string
}
