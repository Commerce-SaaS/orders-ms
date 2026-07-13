import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SectorsService } from './sectors.service';
import { SECTOR_PATTERNS } from 'src/orders/patterns/sector-patterns';
import { CreateSectorDto } from 'src/orders/dto/create-sector.dto';
import { UpdateSectorDto } from 'src/orders/dto/update-sector.dto';
import { SectorsPaginationDto } from 'src/orders/dto/sectors-pagination.dto';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';

@Controller()
export class SectorsController {
  constructor(private readonly sectorsService: SectorsService) {}

  @MessagePattern(SECTOR_PATTERNS.CREATE)
  create(@Payload() dto: CreateSectorDto) {
    return this.sectorsService.create(dto);
  }

  @MessagePattern(SECTOR_PATTERNS.FIND_ALL)
  findAll(@Payload() dto: SectorsPaginationDto) {
    return this.sectorsService.findAll(dto);
  }

  @MessagePattern(SECTOR_PATTERNS.FIND_ONE)
  findOne(@Payload() dto: FindOneByOrgDto) {
    return this.sectorsService.findOne(dto);
  }

  @MessagePattern(SECTOR_PATTERNS.UPDATE)
  update(@Payload() dto: UpdateSectorDto) {
    return this.sectorsService.update(dto);
  }

  @MessagePattern(SECTOR_PATTERNS.SOFT_DELETE)
  softDelete(@Payload() dto: FindOneByOrgDto) {
    return this.sectorsService.softDelete(dto);
  }

  @MessagePattern(SECTOR_PATTERNS.RESTORE)
  restore(@Payload() dto: FindOneByOrgDto) {
    return this.sectorsService.restore(dto);
  }
}
