import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TablesService } from './tables.service';
import { TABLE_PATTERNS } from 'src/orders/patterns/table-patterns';
import { CreateTableDto } from 'src/orders/dto/create-table.dto';
import { UpdateTableDto } from 'src/orders/dto/update-table.dto';
import { UpdateTablePositionsDto } from 'src/orders/dto/update-table-positions.dto';
import { TablesPaginationDto } from 'src/orders/dto/tables-pagination.dto';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';

@Controller()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @MessagePattern(TABLE_PATTERNS.CREATE)
  create(@Payload() dto: CreateTableDto) {
    return this.tablesService.create(dto);
  }

  @MessagePattern(TABLE_PATTERNS.FIND_ALL)
  findAll(@Payload() dto: TablesPaginationDto) {
    return this.tablesService.findAll(dto);
  }

  @MessagePattern(TABLE_PATTERNS.FIND_ONE)
  findOne(@Payload() dto: FindOneByOrgDto) {
    return this.tablesService.findOne(dto);
  }

  @MessagePattern(TABLE_PATTERNS.UPDATE)
  update(@Payload() dto: UpdateTableDto) {
    return this.tablesService.update(dto);
  }

  @MessagePattern(TABLE_PATTERNS.SOFT_DELETE)
  softDelete(@Payload() dto: FindOneByOrgDto) {
    return this.tablesService.softDelete(dto);
  }

  @MessagePattern(TABLE_PATTERNS.UPDATE_POSITIONS)
  updatePositions(@Payload() dto: UpdateTablePositionsDto) {
    return this.tablesService.updatePositions(dto);
  }

  @MessagePattern(TABLE_PATTERNS.RESTORE)
  restore(@Payload() dto: FindOneByOrgDto) {
    return this.tablesService.restore(dto);
  }
}
