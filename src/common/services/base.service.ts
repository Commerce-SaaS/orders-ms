import { Repository, ObjectLiteral } from 'typeorm';
import { RpcExceptionHelper } from '../helpers/rpc-exception.helper';
import { PaginationDto } from '../dto/pagination.dto';
import { FindOneByOrgDto } from '../dto/find-one-by-org.dto';
import { Logger } from '@nestjs/common';

type WithOrg = {
  id: string;
  organizationId: string;
  name?: string;
  isActive?: boolean;
};

export abstract class BaseService<T extends ObjectLiteral & WithOrg> {
  logger = new Logger(BaseService.name);
  protected constructor(
    protected readonly repo: Repository<T>,
    protected readonly entityName: string,
  ) {}

  // -------------------------
  // CREATE with soft-delete
  // -------------------------
  async create(
    createDto: Partial<T> & { name: string; organizationId: string },
  ) {
    const { name, organizationId } = createDto;
    this.logger.log(
      `Creating ${this.entityName} with name="${name}" for org="${organizationId}"`,
    );

    try {
      const existing = await this.repo.findOne({
        where: { name, organizationId } as any,
        withDeleted: true,
      });

      if (existing) {
        if ((existing as any).deletedAt) {
          this.logger.warn(
            `Restoring soft-deleted ${this.entityName} id=${existing.id}`,
          );
          (existing as any).deletedAt = null;
          (existing as any).isActive = true;
          return this.repo.save(existing);
        } else {
          this.logger.warn(
            `${this.entityName} with name="${name}" already exists`,
          );
          RpcExceptionHelper.duplicate(this.entityName);
        }
      }

      const entity = this.repo.create(createDto as any);
      const saved = await this.repo.save(entity);
      this.logger.log(`Created ${this.entityName}`);
      return saved;
    } catch (error) {
      this.logger.error(`Failed to create ${this.entityName}`, error.stack);
      RpcExceptionHelper.handle(error);
    }
  }

  // -------------------------
  // FIND ONE
  // -------------------------
  async findAllByOrg(paginationDto: PaginationDto) {
    const {
      limit = 10,
      offset = 0,
      organizationId,
      withDeleted = false,
    } = paginationDto;
    this.logger.log(
      `Fetching ${this.entityName} list for org="${organizationId}" (offset=${offset}, limit=${limit})`,
    );

    try {
      const [items, totalItems] = await this.repo.findAndCount({
        where: { organizationId } as any,
        skip: offset,
        take: limit,
        order: { createdAt: 'DESC' } as any,
        withDeleted,
      });

      this.logger.log(
        `Fetched ${items.length} ${this.entityName}(s) for org="${organizationId}"`,
      );

      return {
        items,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: Math.floor(offset / limit) + 1,
        hasMore: offset + limit < totalItems,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch ${this.entityName} list`, error.stack);
      RpcExceptionHelper.handle(error);
    }
  }

  // -------------------------
  // FIND ONE
  // -------------------------
  async findOneByOrg(data: FindOneByOrgDto) {
    const { id, organizationId, withDeleted = false } = data;
    this.logger.log(
      `Fetching ${this.entityName} id=${id} for org="${organizationId}"`,
    );

    const entity = await this.repo.findOne({
      where: { id, organizationId } as any,
      withDeleted,
    });

    if (!entity) {
      this.logger.warn(
        `${this.entityName} id=${id} not found for org="${organizationId}"`,
      );
      RpcExceptionHelper.notFound(this.entityName);
    }

    return entity;
  }

  // -------------------------
  // UPDATE
  // -------------------------
  async updateByOrg<U extends Partial<T>>(
    dto: U & { id: string; organizationId: string },
  ) {
    const { id, organizationId, ...rest } = dto;
    this.logger.log(
      `Updating ${this.entityName} id=${id} for org="${organizationId}"`,
    );

    const result = await this.repo.update(
      { id, organizationId } as any,
      { ...rest } as any,
    );

    if (!result.affected) {
      this.logger.warn(
        `Failed to update ${this.entityName} id=${id} (not found)`,
      );
      RpcExceptionHelper.notFound(this.entityName);
    }

    this.logger.log(`Updated ${this.entityName} id=${id}`);
    return this.findOneByOrg({ id, organizationId, withDeleted: true });
  }

  // -------------------------
  // SOFT DELETE
  // -------------------------
  async softDeleteByOrg(data: FindOneByOrgDto) {
    const { id, organizationId } = data;
    this.logger.log(
      `Soft deleting ${this.entityName} id=${id} for org="${organizationId}"`,
    );

    const result = await this.repo.update(
      { id, organizationId } as any,
      { isActive: false } as any,
    );

    if (!result.affected) {
      this.logger.warn(
        `Failed to soft delete ${this.entityName} id=${id} (not found)`,
      );
      RpcExceptionHelper.notFound(this.entityName);
    }

    await this.repo.softDelete({ id, organizationId } as any);
    this.logger.log(`Soft deleted ${this.entityName} id=${id}`);

    return { message: `${this.entityName} deleted successfully` };
  }
}
