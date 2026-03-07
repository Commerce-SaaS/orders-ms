import { IsUUID, Min, IsInt, IsString, Length, IsNumber } from 'class-validator';

export class CreateOrderItemExtraDto {
  @IsUUID()
  extraId: string;

  @IsString()
  @Length(1, 100)
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @IsInt()
  @Min(1)
  quantity: number;
}
