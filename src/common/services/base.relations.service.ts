import { ObjectLiteral, Repository } from "typeorm";
import { RpcExceptionHelper } from "../helpers/rpc-exception.helper";

export abstract class BaseRelationService<T extends ObjectLiteral> {
  protected constructor(
    protected readonly repo: Repository<T>,
    protected readonly entityName: string,
  ) {}

  protected async createRelation(
    where: Partial<T>,
    dto: Partial<T>,
  ) {
    const existing = await this.repo.findOne({
      where: where as any,
      withDeleted: true,
    });

    if (existing) {
      if ((existing as any).deletedAt) {
        (existing as any).deletedAt = null;
        (existing as any).isActive = true;
        return this.repo.save(existing);
      }

      RpcExceptionHelper.duplicate(this.entityName);
    }

    const entity = this.repo.create(dto as any);
    return this.repo.save(entity);
  }

  protected async softDeleteRelation(where: Partial<T>) {
    const result = await this.repo.update(
      where as any,
      { isActive: false } as any,
    );

    if (!result.affected) {
      RpcExceptionHelper.notFound(this.entityName);
    }

    await this.repo.softDelete(where as any);

    return { message: `${this.entityName} removed` };
  }
}
