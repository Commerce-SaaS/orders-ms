import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CloseCashSessionDto {
  @IsUUID() id: string;
  @IsUUID() organizationId: string;
  @IsUUID() userId: string;

  @IsInt()
  @Min(0)
  countedCash: number;

  // Computed by client-gateway from payments-ms cash totals for the session
  // window ([openedAt, now]) — orders-ms does not call payments-ms directly
  // (see architecture note in cash-sessions.service.ts), so the expected
  // amount is supplied by the caller rather than derived here.
  @IsInt()
  @Min(0)
  expectedCash: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
