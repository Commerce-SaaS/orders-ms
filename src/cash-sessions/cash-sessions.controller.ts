import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CashSessionsService } from './cash-sessions.service';
import { CASH_SESSION_PATTERNS } from './patterns/cash-session-patterns';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CurrentCashSessionDto } from './dto/current-cash-session.dto';
import { CashSessionsPaginationDto } from './dto/cash-sessions-pagination.dto';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';

@Controller()
export class CashSessionsController {
  constructor(private readonly cashSessionsService: CashSessionsService) {}

  @MessagePattern(CASH_SESSION_PATTERNS.OPEN)
  open(@Payload() dto: OpenCashSessionDto) {
    return this.cashSessionsService.open(dto);
  }

  @MessagePattern(CASH_SESSION_PATTERNS.CLOSE)
  close(@Payload() dto: CloseCashSessionDto) {
    return this.cashSessionsService.close(dto);
  }

  @MessagePattern(CASH_SESSION_PATTERNS.CURRENT)
  current(@Payload() dto: CurrentCashSessionDto) {
    return this.cashSessionsService.current(dto);
  }

  @MessagePattern(CASH_SESSION_PATTERNS.FIND_ONE)
  findOne(@Payload() dto: FindOneByOrgDto) {
    return this.cashSessionsService.findOne(dto);
  }

  @MessagePattern(CASH_SESSION_PATTERNS.FIND_ALL)
  findAll(@Payload() dto: CashSessionsPaginationDto) {
    return this.cashSessionsService.findAll(dto);
  }

  @MessagePattern(CASH_SESSION_PATTERNS.REPORT)
  report(@Payload() dto: FindOneByOrgDto) {
    return this.cashSessionsService.report(dto);
  }
}
