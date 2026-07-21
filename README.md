# 🛒 Orders Microservice (`orders-ms`)

A NestJS microservice responsible for managing orders, tables, dining areas, cash sessions, kitchen workflows, and sales analytics for a restaurant POS platform.

The service communicates exclusively through RabbitMQ and acts as the operational core of the restaurant ecosystem.

---

# 📋 Table of Contents

* Overview
* Architecture
* Features
* Tech Stack
* Getting Started
* Environment Variables
* RabbitMQ Patterns
* Order Lifecycle
* Restaurant Management
* Analytics
* Database Entities
* Dependencies
* Development Notes

---

# 🚀 Overview

`orders-ms` manages:

* Restaurant orders
* POS orders
* Scheduled orders
* Order items
* Kitchen workflow
* Tables
* Dining sectors
* Cash sessions
* Sales analytics
* Order scheduling

The service is responsible for the entire operational flow from order creation to kitchen preparation and payment synchronization.

---

# 🏗️ Architecture

```text
                   ┌──────────────────┐
                   │   Client Gateway │
                   └────────┬─────────┘
                            │ RabbitMQ
                            ▼

┌─────────────────────────────────────────────┐
│                  orders-ms                  │
├─────────────────────────────────────────────┤
│ Orders                                      │
│ Kitchen Workflow                            │
│ Tables                                      │
│ Sectors                                     │
│ Cash Sessions                               │
│ Analytics                                   │
│ Scheduled Orders                            │
└──────┬───────────────┬───────────────┬──────┘
       │               │               │
       ▼               ▼               ▼
 PostgreSQL       RabbitMQ      Organization-MS
                         │
                         ▼
                   Payments-MS
```

---

# ✨ Features

* Dine-in orders
* POS orders
* Scheduled orders
* Kitchen workflow management
* Table management
* Dining area management
* Cash session tracking
* Sales analytics
* Payment synchronization
* Multi-tenant architecture
* Order scheduling validation

---

# 🛠 Tech Stack

| Category               | Technology      |
| ---------------------- | --------------- |
| Framework              | NestJS 11       |
| Language               | TypeScript 5    |
| Database               | PostgreSQL      |
| ORM                    | TypeORM         |
| Messaging              | RabbitMQ        |
| Cache                  | Redis           |
| Validation             | class-validator |
| Environment Validation | Zod             |
| Testing                | Jest            |
| Integration Testing    | Testcontainers  |

---

# ⚙️ Getting Started

## Prerequisites

* Node.js 20+
* PostgreSQL
* RabbitMQ
* Docker (for integration tests)

---

## Installation

```bash
npm install

cp .env.example .env

npm run start:dev
```

---

## Available Scripts

```bash
npm run build

npm run start
npm run start:dev
npm run start:debug
npm run start:prod

npm run lint
npm run format

npm run test
npm run test:watch
npm run test:cov
npm run test:integration
npm run test:e2e
```

---

# 🌍 Environment Variables

| Variable                  | Required | Description           |
| ------------------------- | -------- | --------------------- |
| NODE_ENV                  | ✅        | Environment           |
| PORT                      | ❌        | Application port      |
| DB_HOST                   | ✅        | PostgreSQL host       |
| DB_PORT                   | ❌        | PostgreSQL port       |
| POSTGRES_USER             | ✅        | Database user         |
| POSTGRES_PASSWORD         | ✅        | Database password     |
| POSTGRES_DB               | ✅        | Database name         |
| RABBITMQ_URL              | ✅        | RabbitMQ connection   |
| RABBITMQ_QUEUE            | ✅        | Main RPC queue        |
| RMQ_EVENTS_QUEUE_ORDERS   | ✅        | Orders events queue   |
| RMQ_EVENTS_QUEUE_PAYMENTS | ✅        | Payments events queue |
| REDIS_HOST                | ✅        | Redis host            |
| REDIS_PORT                | ❌        | Redis port            |
| REDIS_PASS                | ✅        | Redis password        |

---

# 📨 RabbitMQ Patterns

## Orders

| Pattern                  |
| ------------------------ |
| order.create             |
| order.create_pos         |
| order.find_all           |
| order.find_one           |
| order.update             |
| order.add_item           |
| order.remove_item        |
| order.update_item        |
| order.available_slots    |
| order.send_to_kitchen    |
| order.mark_item_prepared |

---

## Tables

| Pattern                |
| ---------------------- |
| table.create           |
| table.find_all         |
| table.find_one         |
| table.update           |
| table.soft_delete      |
| table.update_positions |
| table.restore          |

---

## Sectors

| Pattern            |
| ------------------ |
| sector.create      |
| sector.find_all    |
| sector.find_one    |
| sector.update      |
| sector.soft_delete |
| sector.restore     |

---

## Cash Sessions

| Pattern               |
| --------------------- |
| cash_session.open     |
| cash_session.close    |
| cash_session.current  |
| cash_session.find_one |
| cash_session.find_all |
| cash_session.report   |

---

## Analytics

| Pattern                             |
| ----------------------------------- |
| analytics.orders.overview           |
| analytics.orders.sales_by_type      |
| analytics.orders.top_products       |
| analytics.orders.category_breakdown |

---

## Consumed Events

| Event               |
| ------------------- |
| payment.status      |
| customer.anonymized |

---

## Published Events

| Event           |
| --------------- |
| order.cancelled |

---

# 🍽️ Order Lifecycle

The typical order flow follows the process below:

```text
Customer Order
       │
       ▼
Create Order
       │
       ▼
Add Items
       │
       ▼
Send To Kitchen
       │
       ▼
Prepare Items
       │
       ▼
Payment Completed
       │
       ▼
Order Closed
```

---

# 🍕 Order Types

## Dine-In Orders

Orders linked to restaurant tables.

Example:

```text
Table 12
├── Pizza Margherita
├── Coca-Cola
└── Tiramisu
```

---

## POS Orders

Walk-in or takeaway orders created directly from the POS.

Example:

```text
Counter Order
├── Burger
├── Fries
└── Soft Drink
```

---

## Scheduled Orders

Orders planned for a future date and time.

The service validates:

* Opening hours
* Available time slots
* Maximum dishes per slot
* Scheduling intervals

Organization settings are retrieved from `organization-ms`.

---

# 👨‍🍳 Kitchen Workflow

Kitchen operations are managed directly through the service.

Workflow:

```text
Order Created
      │
      ▼
Send To Kitchen
      │
      ▼
Item Preparation
      │
      ▼
Item Ready
      │
      ▼
Order Completed
```

Supported actions:

* Send order to kitchen
* Mark items as prepared
* Track preparation progress

---

# 🪑 Restaurant Management

## Tables

Represents physical restaurant tables.

Examples:

```text
Table 1
Table 2
Table 15
Terrace A3
```

Capabilities:

* Create tables
* Update tables
* Restore tables
* Reposition tables on floor plans
* Soft delete tables

---

## Sectors

Represents dining areas.

Examples:

```text
Main Room
Terrace
VIP Area
Bar
```

Capabilities:

* Create sectors
* Update sectors
* Restore sectors
* Soft delete sectors

---

# 💰 Cash Sessions

Cash sessions track cashier activity.

Lifecycle:

```text
Open Session
      │
      ▼
Process Orders
      │
      ▼
Collect Payments
      │
      ▼
Generate Report
      │
      ▼
Close Session
```

Available features:

* Open session
* Close session
* Current session lookup
* Historical reports
* Session reporting

---

# 📊 Analytics

The service provides operational analytics.

Available reports:

### Orders Overview

Provides:

* Total orders
* Revenue
* Average ticket
* Order trends

---

### Sales By Type

Breakdown by:

```text
Dine-In
POS
Scheduled Orders
```

---

### Top Products

Provides:

* Best-selling products
* Quantity sold
* Revenue generated

---

### Category Breakdown

Provides:

* Sales per category
* Revenue per category
* Product distribution

---

# 🗄 Database Entities

## Order

Represents a customer order.

Main fields:

* organizationId
* customerName
* status
* type
* total
* scheduledAt

---

## OrderItem

Represents a product inside an order.

Main fields:

* orderId
* productId
* quantity
* unitPrice

---

## OrderItemExtra

Represents selected extras.

Examples:

```text
Extra Cheese
Burrata
Bacon
```

---

## OrderItemRemovedIngredient

Represents removed ingredients.

Examples:

```text
No Onion
No Tomato
No Cheese
```

---

## OrderSlot

Represents available scheduling windows.

Used for:

* Future orders
* Delivery slots
* Pickup scheduling

---

## Table

Represents a restaurant table.

Main fields:

* organizationId
* sectorId
* name
* position

---

## Sector

Represents a dining area.

Main fields:

* organizationId
* name

---

## CashSession

Represents a cashier work session.

Main fields:

* organizationId
* openedAt
* closedAt
* openingAmount
* closingAmount

---

# 🔗 External Dependencies

## PostgreSQL

Stores:

* Orders
* Order Items
* Tables
* Sectors
* Cash Sessions

---

## RabbitMQ

Handles:

* RPC communication
* Event-driven communication
* Payment synchronization

---

## Payments-MS

Used for:

* Payment status updates
* Order cancellation events

Consumed event:

```text
payment.status
```

Published event:

```text
order.cancelled
```

---

## Organization-MS

Used for scheduling validation.

Retrieved settings:

* Opening hours
* Scheduling intervals
* Slot capacity
* Restaurant configuration

---

## Auth-MS

Consumed event:

```text
customer.anonymized
```

Used to remove customer-identifiable information from historical orders.

---

# 🔄 Service Integration Flow

```text
Create Scheduled Order
          │
          ▼
Validate Organization Settings
          │
          ▼
Organization-MS
          │
          ▼
Order Created
          │
          ▼
Payment Processing
          │
          ▼
Payments-MS
          │
          ▼
Payment Status Event
          │
          ▼
Order Updated
```

---

# 🧪 Testing

The service includes:

### Unit Tests

```bash
npm run test
```

Uses:

* Jest
* ts-jest

---

### Integration Tests

```bash
npm run test:integration
```

Uses:

* Testcontainers
* PostgreSQL containers

Docker must be available locally.

---

# ⚠️ Development Notes

## Current Limitations

### Unimplemented Pattern

The following constant exists but currently has no handler:

```text
order.cancel
```

---

### Environment Example

`.env.example` is missing:

```text
RMQ_EVENTS_QUEUE_PAYMENTS
REDIS_PASS
```

Both are required by startup validation.

---

### Redis

Redis infrastructure is configured and initialized, but no active usage was found in the current codebase.

---

### Duplicate Definitions

The repository currently contains duplicated definitions for:

* `TABLE_PATTERNS`
* `Table` entities

under different modules.

---

### E2E Testing

The following script exists:

```bash
npm run test:e2e
```

but references a configuration file that is not currently present in the repository.

---

### Database Migrations

No migration files were found.

Development environments rely on:

```text
synchronize: true
```

while production migration strategy should be documented separately.

---

# 📈 Service Scope

`orders-ms` is the operational heart of the restaurant platform.

Responsibilities include:

* Order management
* Kitchen workflow
* Table management
* Dining areas
* Cash sessions
* Scheduling
* Analytics
* Payment synchronization

Every restaurant operation ultimately passes through `orders-ms`.

