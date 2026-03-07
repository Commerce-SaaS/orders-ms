import { IsBoolean, IsOptional, IsUUID } from "class-validator";

export class FindOneByOrgDto {
  @IsUUID()
  id: string;

  @IsUUID()
  organizationId: string;
  
  @IsBoolean()
  @IsOptional()
  withDeleted?: boolean;
}
