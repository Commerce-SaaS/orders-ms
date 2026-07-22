import { Order } from "../entities/order.entity";

export class OrderStripeMapper {
  static toStripeLineItems(order: Order) {
    return order.items.map(item => {
      const extrasTotal = item.extras.reduce(
        (sum, extra) => sum + Number(extra.price) * extra.quantity,
        0,
      );

      const unitAmount =
        (Number(item.unitPrice) + extrasTotal) * 100;

      return {
        price_data: {
          currency: 'eur',
          product_data: {
            name: item.name,
          },
          unit_amount: unitAmount,
        },
        quantity: item.quantity,
      };
    });
  }
}

