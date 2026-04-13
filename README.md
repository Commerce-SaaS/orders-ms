# 🧩 Orders Microservice

A robust, scalable microservice for managing orders in a SaaS e-commerce platform. This service handles order creation, retrieval, and status tracking with support for complex order structures including items, add-ons, and ingredient customizations. Built with NestJS and communicates with other microservices via RabbitMQ messaging.

## 🏗️ Architecture

The Orders Microservice follows a **modular, domain-driven architecture** organized into two main domains:

### **Module Structure**

```
orders-ms/
├── src/
│   ├── orders/                          # Core order management domain
│   │   ├── orders.controller.ts         # RPC message handlers
│   │   ├── orders.service.ts            # Business logic and data persistence
│   │   ├── orders.module.ts             # Module definition and DI
│   │   ├── dto/                         # Data Transfer Objects
│   │   ├── entities/                    # TypeORM entities
│   │   ├── mappers/                     # Response mappers for UI and integrations
│   │   └── patterns/                    # RabbitMQ message patterns
│   │
│   ├── order-status-history/            # Order status tracking domain
│   │   ├── order-status-history.controller.ts
│   │   ├── order-status-history.service.ts
│   │   ├── order-status-history.module.ts
│   │   ├── dto/
│   │   ├── entities/
│   │   └── patterns/
│   │
│   ├── common/                          # Shared utilities and constants
│   │   ├── dto/                         # Common DTOs
│   │   ├── enums/                       # Shared enumerations
│   │   ├── helpers/                     # RPC exception helpers
│   │   └── services/                    # Base services (if any)
│   │
│   ├── config/                          # Configuration and environment
│   │   ├── envs.ts                      # Zod-validated environment schema
│   │   ├── services.ts                  # Service registrations
│   │   └── transports/                  # RabbitMQ transport configuration
│   │
│   ├── app.module.ts                    # Main application module
│   └── main.ts                          # Application bootstrap
```

### **Design Patterns**

- **Message-Driven Architecture**: RabbitMQ RPC + Event-driven communication
- **Aggregate Root Pattern**: Order acts as the aggregate root with cascade relationships
- **Mapper Pattern**: Separate mappers for UI responses and Stripe integration
- **Transaction Management**: Database transactions ensure data consistency
- **Lazy Loading**: Entities support eager loading relationships

---

## ⚙️ Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **NestJS** | ^11.0.1 | Backend framework |
| **Node.js** | - | Runtime environment |
| **TypeScript** | ^5.7.3 | Language |
| **TypeORM** | ^0.3.28 | ORM and database layer |
| **PostgreSQL** | - | Primary database |
| **RabbitMQ** | - | Message broker for microservices |
| **Zod** | ^4.3.5 | Environment schema validation |
| **class-validator** | ^0.14.3 | DTO validation |
| **class-transformer** | ^0.5.1 | DTO transformation |
| **Jest** | ^29.7.0 | Testing framework |

---

## 📁 Project Structure

### **`/src/orders`** - Order Management Domain
Handles all order-related operations:
- **Creation** with transactional consistency
- **Retrieval** by organization and order ID
- **Data mapping** for different consumers (UI, Stripe)
- **Complex nested structures** (items, extras, removed ingredients)

### **`/src/order-status-history`** - Order Status Tracking
Manages order state transitions:
- **Status history records** for auditing
- **CRUD operations** on status history
- **Cascade deletion** when orders are removed

### **`/src/common`** - Shared Functionality
- **Enums**: `OrderStatus`, `OrderCurrency`
- **DTOs**: `FindOneByOrgDto`, `PaginationDto`
- **Helpers**: `RpcExceptionHelper` for standardized error handling
- **Services**: Base service classes (if extended)

### **`/src/config`** - Configuration & Integration
- **Environment Variables**: Zod-validated schema
- **Service Registrations**: RabbitMQ client instances
- **Transport Configuration**: RabbitMQ module setup

---

## 🔌 Environment Variables

Create a `.env` file in the root directory with the following variables:

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `NODE_ENV` | Enum | ✅ | - | Environment (development, production, test) |
| `PORT` | Number | ❌ | 3000 | Server port |
| `DB_HOST` | String | ✅ | - | PostgreSQL host |
| `DB_PORT` | Number | ❌ | 5432 | PostgreSQL port |
| `POSTGRES_USER` | String | ✅ | - | PostgreSQL username |
| `POSTGRES_PASSWORD` | String | ✅ | - | PostgreSQL password |
| `POSTGRES_DB` | String | ✅ | - | Database name |
| `RABBITMQ_URL` | String | ✅ | - | RabbitMQ connection URL (amqp:// or amqps://) |
| `RABBITMQ_QUEUE` | String | ✅ | - | RabbitMQ queue for RPC messages |
| `RMQ_EVENTS_QUEUE_ORDERS` | String | ✅ | - | RabbitMQ queue for event broadcasting |
| `REDIS_HOST` | String | ✅ | - | Redis host (reserved for future use) |
| `REDIS_PORT` | Number | ❌ | 6379 | Redis port (reserved for future use) |

### **Example .env File**

```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
POSTGRES_USER=orderservice
POSTGRES_PASSWORD=securepassword123
POSTGRES_DB=orders_db
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_QUEUE=orders.rpc
RMQ_EVENTS_QUEUE_ORDERS=orders.events
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## 🚀 Installation & Running

### **Prerequisites**

- Node.js >= 18
- PostgreSQL >= 12
- RabbitMQ >= 3.12

### **Installation**

```bash
# Install dependencies
npm install

# Or with Yarn
yarn install
```

### **Database Setup**

```bash
# The TypeORM configuration auto-creates tables based on entities
# In development mode, synchronize is enabled in app.module.ts
# In production, use migrations (not yet implemented)

# Run the application to create tables
npm run start:dev
```

### **Running the Service**

```bash
# Development mode (with auto-reload)
npm run start:dev

# Debug mode
npm run start:debug

# Production mode
npm run start:prod

# Build for production
npm run build
```

The service will start on the port specified by `PORT` environment variable (default: 3000) and connect to RabbitMQ queues.

---

## 📡 API Endpoints

This microservice uses **RabbitMQ RPC (Remote Procedure Call) patterns** instead of HTTP endpoints. Communication is event-driven and asynchronous.

### **Orders Service - Message Patterns**

| Pattern | Method | Payload | Description |
|---------|--------|---------|-------------|
| `order.create` | RPC | `CreateOrderDto` | Create a new order with items, extras, and removed ingredients |
| `order.find_one` | RPC | `FindOneByOrgDto` | Retrieve a specific order by ID and organization ID |
| `order.find_all` | RPC | - | Retrieve all orders (currently disabled) |
| `order.update` | RPC | `UpdateOrderDto` | Update order details (currently disabled) |
| `order.cancel` | RPC | `string` (order ID) | Cancel an existing order (currently disabled) |

### **Order Status History Service - Message Patterns**

| Pattern | Method | Payload | Description |
|---------|--------|---------|-------------|
| `order_status_history.create` | RPC | `CreateOrderStatusHistoryDto` | Record a new status change for an order |
| `order_status_history.find_all` | RPC | - | Retrieve all status history records |
| `order_status_history.find_one` | RPC | `string` (history ID) | Retrieve a specific history record |
| `order_status_history.update` | RPC | `UpdateOrderStatusHistoryDto` | Update a history record |
| `order_status_history.delete` | RPC | `string` (history ID) | Remove a history record |

### **Request/Response Examples**

#### **Create Order**

```json
{
  "method": "order.create",
  "payload": {
    "organizationId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "550e8400-e29b-41d4-a716-446655440001",
    "status": "PENDING",
    "items": [
      {
        "productId": "550e8400-e29b-41d4-a716-446655440002",
        "name": "Margarita Pizza",
        "quantity": 2,
        "unitPrice": 12.50,
        "extras": [
          {
            "extraId": "550e8400-e29b-41d4-a716-446655440003",
            "name": "Extra Cheese",
            "price": 2.00,
            "quantity": 1
          }
        ],
        "removedIngredients": [
          {
            "ingredientId": "550e8400-e29b-41d4-a716-446655440004",
            "ingredientName": "Onions"
          }
        ]
      }
    ]
  }
}
```

**Response**: Returns Stripe line items for payment processing

```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440010",
  "amount": 5300,
  "lineItems": [
    {
      "price_data": {
        "currency": "eur",
        "product_data": {
          "name": "Margarita Pizza (+ Extra Cheese)"
        },
        "unit_amount": 1450
      },
      "quantity": 2
    }
  ]
}
```

#### **Find Order**

```json
{
  "method": "order.find_one",
  "payload": {
    "id": "550e8400-e29b-41d4-a716-446655440010",
    "organizationId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Response**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440010",
  "status": "PENDING",
  "subtotal": 27.00,
  "total": 27.00,
  "createdAt": "2025-04-13T10:30:00Z",
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440011",
      "name": "Margarita Pizza",
      "quantity": 2,
      "unitPrice": 12.50,
      "total": 27.00,
      "extras": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440012",
          "name": "Extra Cheese",
          "quantity": 1,
          "price": 2.00,
          "total": 2.00
        }
      ],
      "removedIngredients": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440013",
          "name": "Onions"
        }
      ]
    }
  ]
}
```

---

## 🔐 Security

### **Validation & Error Handling**

The service implements comprehensive validation and error handling:

#### **Input Validation**

- **DTO Validation Pipe**: Global `ValidationPipe` configured with:
  - `whitelist: true` - Strips unknown properties
  - `forbidNonWhitelisted: true` - Rejects payloads with unknown fields
  - `transform: true` - Auto-transforms DTO payloads
  - Custom `exceptionFactory` for RPC-formatted errors

- **Schema Validation**: Environment variables validated using Zod at startup

#### **Error Handling**

All errors are returned via `RpcException` with standardized format:

| Status Code | Error Type | Description |
|------------|-----------|-------------|
| 404 | NOT_FOUND | Order or resource not found |
| 409 | CONFLICT | Duplicate entry or constraint violation |
| 400 | BAD_REQUEST | Invalid input or state transition |
| 401 | UNAUTHORIZED | Authentication failed |
| 500 | INTERNAL_SERVER_ERROR | Unexpected server error |

#### **RPC Exception Helper**

Located in `src/common/helpers/rpc-exception.helper.ts`, provides static methods:

```typescript
RpcExceptionHelper.notFound('Order')
RpcExceptionHelper.duplicate('Order')
RpcExceptionHelper.badRequestException('Invalid status')
RpcExceptionHelper.unauthorized('Missing credentials')
RpcExceptionHelper.internalServerError('Database error')
```

### **Data Isolation**

- **Organization-scoped queries**: All orders filtered by `organizationId` to ensure multi-tenancy
- **User isolation**: Orders linked to specific `userId`
- **Cascade deletion**: Orphaned items, extras, and removed ingredients auto-deleted

### **Database Security**

- **Transactions**: Order creation wrapped in database transactions for ACID compliance
- **Indexes**: Optimized queries with compound indexes on frequently filtered columns
- **Constraints**: Foreign key constraints with CASCADE deletion

---

## 🧠 Core Logic

### **Order Creation Flow**

1. **Validation**: DTO validation ensures all required fields are present and valid
2. **Transaction Start**: Database transaction initiated
3. **Order Creation**: Root order entity created with organization and user context
4. **Total Calculation**: Subtotal and total computed from items
5. **Items Persistence**: Each order item persisted individually
6. **Extras Processing**: Product add-ons stored as separate entities
7. **Removed Ingredients**: Ingredient customizations tracked for kitchen
8. **Transaction Commit**: All data persisted atomically
9. **Response Mapping**: Order transformed to Stripe line items for payment
10. **Error Handling**: Transaction rolled back on any failure

### **Order Item Structure**

```
Order (Aggregate Root)
├── OrderItem (Product in order)
│   ├── OrderItemExtra[] (Add-ons: sizes, toppings, etc.)
│   └── OrderItemRemovedIngredient[] (Customizations: no onions, etc.)
├── OrderItem
│   └── ...
└── ...
```

### **Status Lifecycle**

```
PENDING → IN_PROGRESS → COMPLETED
   ↓                        ↑
   └─→ CANCELLED ←─────────┘

PAID → [Any status above]
FAILED/REFUNDED → [Terminal states]
```

### **Calculation Logic**

```
Total Per Item = (unitPrice + extras.sum(price)) × quantity
Subtotal = sum(total for each item)
Total = Subtotal (taxes/discounts not yet implemented)
```

---

## 🔄 Integrations

### **Payments Microservice**

**Connection**: RabbitMQ Event Queue (`events.payments`)

The Orders service registers as a listener for payment-related events from the Payments microservice (currently commented out, ready for implementation):

```typescript
// @EventPattern('payment.succeeded')
// onPaymentSucceeded(event: PaymentSucceededEvent) {
//   // Update order status to PAID
// }

// @EventPattern('payment.failed')
// onPaymentFailed(event: PaymentFailedEvent) {
//   // Update order status to FAILED
// }

// @EventPattern('payment.refunded')
// onPaymentRefunded(event: PaymentRefundedEvent) {
//   // Update order status to REFUNDED
// }
```

### **Stripe Integration**

Orders are mapped to Stripe line items for payment processing:

- **Currency Support**: EUR, USD, UYU, MXN
- **Line Items**: Each item with pricing and quantity
- **Amount Calculation**: Automatically includes extras and applies proper decimal conversion

Response format compatible with Stripe's `checkout.sessions.create()` API.

### **Database Dependencies**

- **PostgreSQL**: Primary data store
- **TypeORM Entities**: Auto-loaded from entities directory

---

## 🧪 Testing

Test infrastructure is configured but not yet fully implemented.

### **Available Commands**

```bash
# Run unit tests
npm run test

# Watch mode (re-run on file changes)
npm run test:watch

# Coverage report
npm run test:cov

# Debug tests
npm run test:debug

# E2E tests
npm run test:e2e
```

### **Test Configuration**

- **Framework**: Jest
- **Transform**: `ts-jest` for TypeScript support
- **Root Directory**: `src/`
- **Test File Pattern**: `*.spec.ts`
- **Coverage Directory**: `coverage/`
- **Test Environment**: Node.js

### **Future Testing Roadmap**

- [ ] Unit tests for service methods
- [ ] DTO validation tests
- [ ] Transaction rollback scenarios
- [ ] RabbitMQ message pattern tests
- [ ] E2E tests for order creation flow

---

## 📌 Additional Notes

### **Development Tips**

1. **Environment Validation**: The application validates all environment variables at startup using Zod. Missing or invalid vars will throw descriptive errors.

2. **Auto-Reload**: Development mode uses NestJS watch mode for instant code changes.

3. **Database Synchronization**: In development mode, TypeORM automatically creates/updates tables based on entity definitions. **Never use this in production** — implement migrations instead.

4. **Transaction Rollback**: If order creation fails at any point, the entire transaction is rolled back, ensuring data consistency.

5. **Curry Organization Context**: All queries require `organizationId` for multi-tenant isolation.

### **Production Considerations**

1. **Database Migrations**: Implement TypeORM migrations for production deployments instead of auto-sync
2. **Error Logging**: Integrate structured logging (Winston, Pino) for production monitoring
3. **Health Checks**: Add `/health` endpoint for container orchestration
4. **Rate Limiting**: Implement RabbitMQ consumer prefetch for backpressure handling
5. **Monitoring**: Connect to observability tools (DataDog, New Relic) for metrics tracking
6. **Redis Caching**: Redis variables are present but not yet integrated — implement caching layer for hot data

### **Disabled Features** (Ready for Implementation)

The following features are implemented but currently disabled (commented out):

- `findAll()` - List all orders with pagination
- `update()` - Modify existing orders
- `cancel()` - Soft delete orders
- Event handlers for payment events
- State transition validation
- Status update flow

These can be enabled by uncommenting code and connecting to the appropriate message patterns.

### **Common Issues & Troubleshooting**

| Issue | Solution |
|-------|----------|
| `RABBITMQ_URL must start with amqp://` | Ensure RabbitMQ connection string uses `amqp://` or `amqps://` protocol |
| `POSTGRES_PASSWORD is required` | Add all required database variables to `.env` |
| `Order not found` | Verify organizationId matches when querying |
| `Duplicate entry` | Check for unique constraint violations |
| `Invalid status transition` | Review OrderStatus enum and validation rules |

### **Code Quality**

- **Linting**: ESLint with Prettier formatting
- **Format Check**: `npm run lint`
- **Format Fix**: `npm run format`

---

## 🔗 Related Microservices

- **Payments Microservice**: Handles payment processing and status events
- **Products Microservice**: Provides product catalog (integrates via order items)
- **Auth Microservice**: Authentication and authorization (future integration)

---

## 📚 Additional Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [TypeORM Documentation](https://typeorm.io/)
- [RabbitMQ Tutorials](https://www.rabbitmq.com/getstarted.html)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

**Version**: 0.0.1  
**License**: UNLICENSED  
**Last Updated**: April 2025
