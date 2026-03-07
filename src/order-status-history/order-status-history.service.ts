import { Injectable } from '@nestjs/common';
import { CreateOrderStatusHistoryDto } from './dto/create-order-status-history.dto';
import { UpdateOrderStatusHistoryDto } from './dto/update-order-status-history.dto';

@Injectable()
export class OrderStatusHistoryService {
  create(createOrderStatusHistoryDto: CreateOrderStatusHistoryDto) {
    return 'This action adds a new orderStatusHistory';
  }

  findAll() {
    return `This action returns all orderStatusHistory`;
  }

  findOne(id: string) {
    return `This action returns a #${id} orderStatusHistory`;
  }

  update(id: string, updateOrderStatusHistoryDto: UpdateOrderStatusHistoryDto) {
    return `This action updates a #${id} orderStatusHistory`;
  }

  remove(id: string) {
    return `This action removes a #${id} orderStatusHistory`;
  }
}
