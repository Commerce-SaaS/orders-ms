import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Table } from 'src/orders/entities/table.entity';
import { Sector } from 'src/sectors/entities/sector.entity';
import { TableStatus } from 'src/common/enums/table-status.enum';
import { TableShape } from 'src/common/enums/table-shape.enum';
import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { CreateTableDto } from 'src/orders/dto/create-table.dto';
import { UpdateTableDto } from 'src/orders/dto/update-table.dto';
import { UpdateTablePositionsDto } from 'src/orders/dto/update-table-positions.dto';
import { TablesPaginationDto } from 'src/orders/dto/tables-pagination.dto';
import { FindOneByOrgDto } from 'src/common/dto/find-one-by-org.dto';

@Injectable()
export class TablesService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Table)
    private readonly tableRepository: Repository<Table>,
  ) {}

  async onModuleInit() {
    const tableRepo = this.dataSource.getRepository(Table);
    const sectorRepo = this.dataSource.getRepository(Sector);

    const orphanedTables = await tableRepo.find({ where: { sectorId: IsNull() } });
    if (orphanedTables.length === 0) return;

    const orgIds = [...new Set(orphanedTables.map((t) => t.organizationId))];

    for (const orgId of orgIds) {
      let sector = await sectorRepo.findOne({ where: { organizationId: orgId, isDeleted: false } });
      if (!sector) {
        sector = await sectorRepo.save(
          sectorRepo.create({ organizationId: orgId, name: 'General', sortOrder: 0 }),
        );
      }
      await tableRepo.update({ organizationId: orgId, sectorId: IsNull() }, { sectorId: sector.id });
    }
  }

  private async validateSector(sectorId: string, organizationId: string): Promise<void> {
    const sector = await this.dataSource.getRepository(Sector).findOne({
      where: { id: sectorId, organizationId, isDeleted: false },
    });
    if (!sector) RpcExceptionHelper.notFound('Sector');
  }

  private async validateUniqueName(
    name: string,
    organizationId: string,
    excludeTableId?: string,
  ): Promise<void> {
    const query = this.dataSource
      .getRepository(Table)
      .createQueryBuilder('table')
      .where(
        'table.organizationId = :organizationId AND table.name = :name AND table.isDeleted = false',
        { organizationId, name },
      );
    if (excludeTableId) {
      query.andWhere('table.id != :excludeTableId', { excludeTableId });
    }
    const existing = await query.getOne();
    if (existing) {
      RpcExceptionHelper.conflict(`A table named "${name}" already exists`);
    }
  }

  async create(dto: CreateTableDto) {
    try {
      await this.validateSector(dto.sectorId, dto.organizationId);
      await this.validateUniqueName(dto.name, dto.organizationId);

      const table = this.tableRepository.create({
        organizationId: dto.organizationId,
        sectorId: dto.sectorId,
        name: dto.name,
        capacity: dto.capacity,
        status: dto.status ?? TableStatus.FREE,
        shape: dto.shape ?? TableShape.SQUARE,
        posX: dto.posX ?? 0,
        posY: dto.posY ?? 0,
      });
      const saved = await this.tableRepository.save(table);
      return this.mapTableResponse(saved);
    } catch (error) {
      RpcExceptionHelper.handle(error);
    }
  }

  async findAll(dto: TablesPaginationDto) {
    const { organizationId, sectorId, status, search, offset = 0, limit = 20 } = dto;
    const effectiveLimit = limit > 0 ? limit : 20;

    const query = this.dataSource
      .getRepository(Table)
      .createQueryBuilder('table')
      .where('table.organizationId = :organizationId AND table.isDeleted = false', { organizationId });

    if (sectorId) {
      query.andWhere('table.sectorId = :sectorId', { sectorId });
    }

    if (status) {
      query.andWhere('table.status = :status', { status });
    }

    if (search) {
      query.andWhere('table.name ILIKE :search', { search: `%${search}%` });
    }

    const totalItems = await query.getCount();

    const items = await query
      .orderBy('table.name', 'ASC')
      .skip(offset)
      .take(effectiveLimit)
      .getMany();

    return {
      items: items.map((t) => this.mapTableResponse(t)),
      totalItems,
      totalPages: Math.ceil(totalItems / effectiveLimit),
      currentPage: Math.floor(offset / effectiveLimit) + 1,
      hasMore: offset + effectiveLimit < totalItems,
    };
  }

  async findOne(dto: FindOneByOrgDto) {
    const table = await this.dataSource.getRepository(Table).findOne({
      where: { id: dto.id, organizationId: dto.organizationId, isDeleted: false },
    });
    if (!table) RpcExceptionHelper.notFound('Table');
    return this.mapTableResponse(table);
  }

  async update(dto: UpdateTableDto) {
    const { id, organizationId, name, capacity, status, shape, sectorId } = dto;
    const repo = this.dataSource.getRepository(Table);

    const table = await repo.findOne({ where: { id, organizationId, isDeleted: false } });
    if (!table) RpcExceptionHelper.notFound('Table');

    if (status === TableStatus.OCCUPIED) {
      RpcExceptionHelper.badRequestException(
        'Table status cannot be set to OCCUPIED directly — it is managed by the order flow',
      );
    }

    if (sectorId !== undefined) {
      await this.validateSector(sectorId, organizationId);
      table.sectorId = sectorId;
    }

    if (name !== undefined && name !== table.name) {
      await this.validateUniqueName(name, organizationId, id);
      table.name = name;
    }
    if (capacity !== undefined) table.capacity = capacity;
    if (status !== undefined) table.status = status;
    if (shape !== undefined) table.shape = shape;
    if (dto.posX !== undefined) table.posX = dto.posX;
    if (dto.posY !== undefined) table.posY = dto.posY;

    try {
      const saved = await repo.save(table);
      return this.mapTableResponse(saved);
    } catch (error) {
      RpcExceptionHelper.handle(error);
    }
  }

  async softDelete(dto: FindOneByOrgDto) {
    const repo = this.dataSource.getRepository(Table);
    const table = await repo.findOne({ where: { id: dto.id, organizationId: dto.organizationId } });
    if (!table) RpcExceptionHelper.notFound('Table');
    if (table.isDeleted) RpcExceptionHelper.badRequestException('Table is already deleted');
    if (table.status === TableStatus.OCCUPIED) {
      RpcExceptionHelper.badRequestException('Cannot delete an occupied table');
    }

    table.isDeleted = true;
    const saved = await repo.save(table);
    return this.mapTableResponse(saved);
  }

  async restore(dto: FindOneByOrgDto) {
    const repo = this.dataSource.getRepository(Table);
    const table = await repo.findOne({ where: { id: dto.id, organizationId: dto.organizationId } });
    if (!table) RpcExceptionHelper.notFound('Table');
    if (!table.isDeleted) RpcExceptionHelper.badRequestException('Table is not deleted');

    await this.validateUniqueName(table.name, table.organizationId, table.id);

    table.isDeleted = false;
    try {
      const saved = await repo.save(table);
      return this.mapTableResponse(saved);
    } catch (error) {
      RpcExceptionHelper.handle(error);
    }
  }

  async updatePositions(dto: UpdateTablePositionsDto) {
    const repo = this.dataSource.getRepository(Table);
    const results: object[] = [];

    for (const item of dto.positions) {
      const table = await repo.findOne({
        where: { id: item.id, organizationId: dto.organizationId, isDeleted: false },
      });
      if (!table) RpcExceptionHelper.notFound('Table');
      table.posX = item.posX;
      table.posY = item.posY;
      const saved = await repo.save(table);
      results.push(this.mapTableResponse(saved));
    }

    return results;
  }

  private mapTableResponse(table: Table) {
    return {
      id: table.id,
      organizationId: table.organizationId,
      sectorId: table.sectorId ?? null,
      name: table.name,
      capacity: table.capacity ?? null,
      status: table.status,
      shape: table.shape,
      posX: table.posX ?? 0,
      posY: table.posY ?? 0,
      currentOrderId: table.currentOrderId ?? null,
      isDeleted: table.isDeleted,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt,
    };
  }
}
