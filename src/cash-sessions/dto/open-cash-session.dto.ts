import { IsInt, IsUUID, Min } from 'class-validator';

export class OpenCashSessionDto {
  @IsUUID() organizationId: string;
  @IsUUID() userId: string;

  @IsInt()
  @Min(0)
  openingCash: number;
}
