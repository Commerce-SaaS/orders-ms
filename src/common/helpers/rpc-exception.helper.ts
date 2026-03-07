import { HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

export class RpcExceptionHelper {
  static handle(error: any): never {
    if (error instanceof RpcException) {
      throw error;
    }

    if (error.code === '23505') {
      throw new RpcException({
        message: `Duplicate entry: ${error.table} already exists`,
        statusCode: HttpStatus.CONFLICT,
      });
    }

    throw new RpcException({
      message: error.detail || error.message || 'Internal server error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }

  static duplicate(entity: string): never {
    throw new RpcException({
      message: `Duplicate entry: ${entity} already exists`,
      statusCode: HttpStatus.CONFLICT,
    });
  }

  static notFound(entity: string): never {
    throw new RpcException({
      message: `${entity} not found`,
      statusCode: HttpStatus.NOT_FOUND,
    });
  }

  static unauthorized(message: string): never {
    throw new RpcException({
      message,
      statusCode: HttpStatus.UNAUTHORIZED,
    });
  }

  static internalServerError(message: string): never {
    throw new RpcException({
      message,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }

  static badRequestException(message: string): never {
    throw new RpcException({
      message,
      statusCode: HttpStatus.BAD_REQUEST,
    });
  }
}
