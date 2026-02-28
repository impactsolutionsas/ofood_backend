# O'Food Backend

Backend API for the O'Food food delivery platform, built for the Senegalese market. Handles restaurant management, real-time ordering, mobile money payments, and SMS-based authentication.

## Tech Stack

- **Framework:** NestJS 11 (TypeScript)
- **Database:** PostgreSQL + Prisma ORM
- **Cache:** Redis (ioredis)
- **Real-time:** Socket.IO (WebSocket)
- **Auth:** JWT (access + refresh tokens), phone/PIN-based login with OTP
- **SMS:** Infobip / Termii (pluggable strategy)
- **Docs:** Swagger/OpenAPI at `/api/docs`

## Project Structure

```
src/
├── auth/            # Registration, OTP, login, JWT tokens
├── users/           # User profile management
├── restaurants/     # Restaurant CRUD, geo-filtering, wallet
├── dishes/          # Dish management (categories, availability)
├── menus/           # Weekly menu configuration
├── orders/          # Order lifecycle + WebSocket notifications
├── payments/        # Wave, Orange Money, Free Money integration
├── ratings/         # Post-delivery restaurant ratings
├── notifications/   # SMS service (multi-provider)
├── admin/           # Dashboard, user/restaurant/order management
├── common/          # Guards, decorators, interceptors, pipes
├── prisma/          # Database service
└── redis/           # Redis caching service
```

## User Roles

| Role               | Description                              |
| ------------------ | ---------------------------------------- |
| `CLIENT`           | Browse restaurants, place orders, rate   |
| `RESTAURANT_OWNER` | Manage restaurant, dishes, menus, orders |
| `ADMIN`            | Platform oversight, verification, stats  |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL
- Redis

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your database, Redis, JWT, and SMS credentials

# Run database migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

### Run

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build
npm run start:prod
```

### Test

```bash
npm run test          # Unit tests
npm run test:e2e      # End-to-end tests
npm run test:cov      # Coverage report
```

## API Overview

### Auth
| Method | Endpoint             | Description       |
| ------ | -------------------- | ----------------- |
| POST   | `/auth/register`     | Register (phone + PIN) |
| POST   | `/auth/verify-otp`   | Verify OTP code   |
| POST   | `/auth/login`        | Login              |
| POST   | `/auth/refresh`      | Refresh token      |
| POST   | `/auth/logout`       | Logout             |

### Restaurants
| Method | Endpoint                      | Description              |
| ------ | ----------------------------- | ------------------------ |
| GET    | `/restaurants`                | List (with geo-filter)   |
| GET    | `/restaurants/:id`            | Details                  |
| POST   | `/restaurants`                | Create (OWNER)           |
| PATCH  | `/restaurants/:id`            | Update (OWNER)           |
| GET    | `/restaurants/:id/wallet`     | Wallet & transactions    |

### Dishes & Menus
| Method | Endpoint                              | Description             |
| ------ | ------------------------------------- | ----------------------- |
| GET    | `/dishes`                             | List with filtering     |
| POST   | `/restaurants/:id/dishes`             | Add dish (OWNER)        |
| GET    | `/restaurants/:id/menus`              | Weekly menu             |
| GET    | `/restaurants/:id/menus/today`        | Today's menu            |
| PUT    | `/restaurants/:id/menus`              | Set weekly menu (OWNER) |

### Orders
| Method | Endpoint                     | Description                |
| ------ | ---------------------------- | -------------------------- |
| POST   | `/orders`                    | Create order (CLIENT)      |
| GET    | `/orders/me`                 | My orders (CLIENT)         |
| GET    | `/orders/restaurant`         | Received orders (OWNER)    |
| PATCH  | `/orders/:id/status`         | Update status (OWNER)      |

**Order flow:** `PENDING` -> `AWAITING_PAYMENT` -> `PAID` -> `PREPARING` -> `READY` -> `DELIVERED`

### Payments
| Method | Endpoint                    | Description            |
| ------ | --------------------------- | ---------------------- |
| POST   | `/payments/initiate`        | Start payment (CLIENT) |
| POST   | `/payments/:id/verify`      | Verify payment         |
| GET    | `/payments/order/:orderId`  | Order transactions     |

### Ratings
| Method | Endpoint                      | Description               |
| ------ | ----------------------------- | ------------------------- |
| POST   | `/ratings`                    | Rate restaurant (CLIENT)  |
| GET    | `/ratings/restaurant/:id`     | Restaurant ratings        |

### Admin
| Method | Endpoint                           | Description          |
| ------ | ---------------------------------- | -------------------- |
| GET    | `/admin/dashboard`                 | Platform statistics  |
| GET    | `/admin/users`                     | All users            |
| GET    | `/admin/restaurants`               | All restaurants      |
| PATCH  | `/admin/restaurants/:id/verify`    | Verify restaurant    |
| GET    | `/admin/orders`                    | All orders           |
| GET    | `/admin/transactions`              | All transactions     |

## WebSocket Events

| Event              | Direction      | Description               |
| ------------------ | -------------- | ------------------------- |
| `join-restaurant`  | Client -> Server | Subscribe to restaurant orders |
| `join-user`        | Client -> Server | Subscribe to order updates     |
| `new-order`        | Server -> Client | New order received             |
| `order-status`     | Server -> Client | Order status changed           |

## Environment Variables

See [.env.example](.env.example) for the full list. Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_HOST` / `REDIS_PORT` - Redis connection
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` - Token secrets
- `SMS_PROVIDER` - `infobip`, `termii`, or `console`

## License

MIT
