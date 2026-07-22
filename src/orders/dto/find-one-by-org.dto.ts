import { IsOptional, IsUUID } from 'class-validator';

export class FindOneByOrgDto {
  @IsUUID() id: string;
  @IsUUID() organizationId: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
