import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Sector } from './entities/sector.entity';
import { Table } from 'src/orders/entities/table.entity';
import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { CreateSectorDto } from 'src/orders/dto/create-sector.dto';
import { UpdateSectorDto } from 'src/orders/dto/update-sector.dto';
import { SectorsPaginationDto } from 'src/orders/dto/sectors-pagination.dto';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';

@Injectable()
export class SectorsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Sector)
    private readonly sectorRepository: Repository<Sector>,
  ) {}

  async create(dto: CreateSectorDto) {
    try {
      const sector = this.sectorRepository.create({
        organizationId: dto.organizationId,
        name: dto.name,
        sortOrder: dto.sortOrder,
      });
      const saved = await this.sectorRepository.save(sector);
      return this.mapSectorResponse(saved);
    } catch (error) {
      RpcExceptionHelper.handle(error);
    }
  }

  async findAll(dto: SectorsPaginationDto) {
    const { organizationId, search, offset = 0, limit = 20 } = dto;
    const effectiveLimit = limit > 0 ? limit : 20;

    const query = this.dataSource
      .getRepository(Sector)
      .createQueryBuilder('sector')
      .where('sector.organizationId = :organizationId AND sector.isDeleted = false', { organizationId });

    if (search) {
      query.andWhere('sector.name ILIKE :search', { search: `%${search}%` });
    }

    const totalItems = await query.getCount();

    const items = await query
      .orderBy('sector.sortOrder', 'ASC', 'NULLS LAST')
      .addOrderBy('sector.name', 'ASC')
      .skip(offset)
      .take(effectiveLimit)
      .getMany();

    return {
      items: items.map((s) => this.mapSectorResponse(s)),
      totalItems,
      totalPages: Math.ceil(totalItems / effectiveLimit),
      currentPage: Math.floor(offset / effectiveLimit) + 1,
      hasMore: offset + effectiveLimit < totalItems,
    };
  }

  async findOne(dto: FindOneByOrgDto) {
    const sector = await this.dataSource.getRepository(Sector).findOne({
      where: { id: dto.id, organizationId: dto.organizationId, isDeleted: false },
    });
    if (!sector) RpcExceptionHelper.notFound('Sector');
    return this.mapSectorResponse(sector);
  }

  async update(dto: UpdateSectorDto) {
    const { id, organizationId, name, sortOrder } = dto;
    const repo = this.dataSource.getRepository(Sector);

    const sector = await repo.findOne({ where: { id, organizationId, isDeleted: false } });
    if (!sector) RpcExceptionHelper.notFound('Sector');

    if (name !== undefined) sector.name = name;
    if (sortOrder !== undefined) sector.sortOrder = sortOrder;

    const saved = await repo.save(sector);
    return this.mapSectorResponse(saved);
  }

  async softDelete(dto: FindOneByOrgDto) {
    const sectorRepo = this.dataSource.getRepository(Sector);
    const sector = await sectorRepo.findOne({ where: { id: dto.id, organizationId: dto.organizationId } });
    if (!sector) RpcExceptionHelper.notFound('Sector');
    if (sector.isDeleted) RpcExceptionHelper.badRequestException('Sector is already deleted');

    const tableCount = await this.dataSource.getRepository(Table).count({
      where: { sectorId: dto.id, organizationId: dto.organizationId, isDeleted: false },
    });
    if (tableCount > 0) {
      RpcExceptionHelper.conflict(
        'Sector has active tables. Reassign or remove all tables before deleting this sector.',
      );
    }

    sector.isDeleted = true;
    const saved = await sectorRepo.save(sector);
    return this.mapSectorResponse(saved);
  }

  async restore(dto: FindOneByOrgDto) {
    const repo = this.dataSource.getRepository(Sector);
    const sector = await repo.findOne({ where: { id: dto.id, organizationId: dto.organizationId } });
    if (!sector) RpcExceptionHelper.notFound('Sector');
    if (!sector.isDeleted) RpcExceptionHelper.badRequestException('Sector is not deleted');

    sector.isDeleted = false;
    const saved = await repo.save(sector);
    return this.mapSectorResponse(saved);
  }

  async findOrCreateDefault(organizationId: string): Promise<Sector> {
    const repo = this.dataSource.getRepository(Sector);
    const existing = await repo.findOne({ where: { organizationId, isDeleted: false } });
    if (existing) return existing;

    const defaultSector = repo.create({ organizationId, name: 'General', sortOrder: 0 });
    return repo.save(defaultSector);
  }

  private mapSectorResponse(sector: Sector) {
    return {
      id: sector.id,
      organizationId: sector.organizationId,
      name: sector.name,
      sortOrder: sector.sortOrder ?? null,
      isDeleted: sector.isDeleted,
      createdAt: sector.createdAt,
      updatedAt: sector.updatedAt,
    };
  }
}
