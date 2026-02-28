# AI Coding Assistant Instructions for O'Food Backend

This repository is a **NestJS monolith** written in TypeScript. The goal of the service is to handle
user authentication (OTP + PIN), token management, and SMS notifications.

The instructions below are specific to this project. Avoid generic advice – follow the patterns
and conventions that already exist.

---

## Architecture Overview

* **Entry point** is `src/main.ts`, `src/app.module.ts` imports global modules.
* **Modules** are the primary boundaries: `auth/`, `notifications/`, `prisma/`, `redis/`.
  * Add new features by creating a module and registering it in `AppModule.imports`.
* **Shared code** lives under `src/common` (decorators, guards, interceptors, pipes, filters).
  * `JwtAuthGuard` is bound globally via `APP_GUARD` in `AppModule`. Use `@Public()` to bypass it.
  * `@CurrentUser()` decorator extracts the JWT payload from `request.user`.
* **Data layer** uses Prisma Client defined in `src/prisma/prisma.service.ts`. Schema is
  in `prisma/schema.prisma` (users, otp_codes, Role enum).
* **Caching & state** uses Redis via `src/redis/redis.service.ts`. Only key usages are
  refresh-token blacklisting (`refresh_token:blacklist:<jti>`).
* **Notifications** uses a strategy pattern (`ISmsStrategy`) configured by `SMS_PROVIDER`
  env var. The only implementation today is `TermiiStrategy` which normalizes Senegalese
  phone numbers and posts to Termii’s API.

---

## Important Flows & Patterns

* **Register** (`AuthController.register`):
  1. Normalize phone (see `normalizePhone` in `AuthService`, `TermiiStrategy`).
  2. Hash PIN with `bcrypt` (12 rounds).
  3. Create user with `isActive=false` and an `OtpCode` record expiring in 5 minutes.
  4. Send OTP SMS via `SmsService.sendSms`.
* **Verify OTP / login**: check a non‑expired, unused OTP or validate PIN, then call
  `generateTokens()`.
* **JWT tokens**:
  * Access tokens include `sub`, `role`, `type: 'access'`.
  * Refresh tokens include a `jti` and `type: 'refresh'`. `jti` is used to blacklist tokens
    by storing a key in Redis with a TTL equal to `REFRESH_TOKEN_TTL_SECONDS`.
  * Secrets and expirations come from env vars: `JWT_SECRET`, `JWT_EXPIRES_IN`,
    `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`.
* **Logout**: try to decode the provided refresh token, then blacklist its `jti`.
  Failing to decode is ignored.

Patterns to replicate:

* Use `@Injectable()` services and inject `ConfigService`, `PrismaService`, etc.
* When you need to bypass guards for specific controller methods, apply `@Public()`.
* DTOs are plain classes under `auth/dto/`; validation (class‑validator) is configured
  automatically by Nest’s global pipes (not shown but assumed).
* Use Prisma transactions for multi‑step updates (see OTP verification).
* All phone normalization lives in `AuthService.normalizePhone` and
  `TermiiStrategy.normalizePhone`; follow the same logic when adding other utilities.

---

## Developer Workflows

* **Install & start**
  ```bash
  npm install
  npm run start:dev   # hot‑reload development server
  npm run start       # compiled once
  npm run start:prod  # production build
  ```

* **Testing**
  * Unit tests: `npm run test`
  * E2E tests: `npm run test:e2e` (currently only an example root route test)
  * Coverage: `npm run test:cov`

* **Prisma**
  ```bash
  npx prisma migrate dev      # run new migrations against dev database
  npx prisma studio           # open web UI
  ```
  Database URL is read from `DATABASE_URL` env var.

* **Environment variables**
  * `DATABASE_URL` – postgres connection
  * `REDIS_URL` – default `redis://localhost:6379`
  * `JWT_SECRET`, `JWT_REFRESH_SECRET` (defaults provided in code)
  * `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` – values like `15m` or `7d`
  * `SMS_PROVIDER` (`termii`), `TERMII_API_KEY`, `TERMII_SENDER_ID`

* **Linting / formatting**
  This repo uses the default NestJS ESLint configuration (`.eslintrc.js`).


---

## Conventions & Gotchas

* **Phone numbers** are always stored in E.164 format starting with `221` (Senegal).
  All incoming phone strings are stripped of non‑digits and normalized as shown
  in `AuthService.normalizePhone`.
* **Roles** are defined by the `Role` enum in Prisma; Prisma-generated types
  are imported when needed (`import { Role } from '@prisma/client'`).
* **Error messages** are mostly French.
* **Module imports** should avoid circular dependencies; the `auth` module already
  depends on `prisma`, `notifications`, and `redis`.
* **Refresh token blacklisting** is only enforced if the JWT payload contains `jti`.
  Tokens issued before that field was added will not be revocable.
* **SMS strategy selection** happens in `SmsService` constructor – use switch/`provider`
  pattern when adding new providers.

---

## When Writing Code for the AI

* Look at `src/common` to see how decorators / guards are wired; replicate the
  pattern when adding new global behaviour.
* Non-public controller methods must either use `@Public()` or explicitly guard
  with `@UseGuards(...)`.
* Use `ConfigService` for all runtime configuration, not `process.env` directly.
* For any new persistent data, update `prisma/schema.prisma` and run a migration.
* Use `this.prisma` for all DB operations; prefer `findUnique`, `findFirst`,
  `create`, `update`, and `transaction` as shown.
* Keep service methods focused; controllers simply delegate and return whatever the
  service returns (no extra formatting).

Feel free to ask for clarification on any pattern or file if the above is
insufficient.