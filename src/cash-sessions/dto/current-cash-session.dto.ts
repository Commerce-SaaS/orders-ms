import { IsUUID } from 'class-validator';

export class CurrentCashSessionDto {
  @IsUUID() organizationId: string;
}
