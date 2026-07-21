# Vome Service

[简体中文](./README.md) | English

A high-performance backend scaffold built on **Bun + Elysia**. Core capabilities ship via the npm package [`vome-core`](https://www.npmjs.com/package/vome-core); business code lives under `src/modules/`, with ready-to-use **Admin** and **App** APIs.

> Open-sourced by Vome / 威迈科技. Designed for rapid delivery of admin backends and consumer-facing APIs.

## Features

| Capability | Description |
| --- | --- |
| **Declarative CRUD** | `@Controller` + Entity → `page/list/info/add/update/delete/restore/import/export` |
| **Dual RBAC** | Admin menu permission codes; App role `perms` JSON; `@Public` / `@IgnorePerms` / super-admin bypass |
| **IoC** | `@Provide` / `@Inject` / `Repository` / request `Context` |
| **ORM** | Drizzle + PostgreSQL; optional schema `push` in dev; `db.json` / `menu.json` seeds |
| **Auth** | Admin JWT; App Better Auth (password / OTP / social, etc.) |
| **EPS + OpenAPI** | Dynamic API descriptors for Admin; live docs at `/docs` |
| **Queue / Jobs** | BullMQ + Cron; manageable from Admin |
| **Socket.IO** | Optional Redis adapter for realtime Admin / App channels |
| **Plugins & micro-apps** | Hot-loadable plugins, Module Federation / micro-app gateway |
| **Request logging** | Configurable scopes (errors, custom APIs, CRUD, `@Public` routes, …) |
| **Deploy** | Readable bundle, JS obfuscation, single Linux binary |

## Stack

- Runtime: [Bun](https://bun.sh)
- Web: [Elysia](https://elysiajs.com)
- ORM: [Drizzle](https://orm.drizzle.team)
- Auth: [Better Auth](https://www.better-auth.com) (App)
- Cache / queue: Redis, BullMQ
- Framework core: `vome-core`

## Requirements

- Bun (latest stable recommended)
- PostgreSQL
- Redis (cache, queues, Socket adapter, some auth state)

## Quick start

```bash
git clone https://github.com/vomekj/vome-service.git
# or your GitHub mirror
cd vome-service
bun install
```

### 1. Configure

Config lives in `src/config/` (TypeScript config files), merged by environment:

| File | Purpose |
| --- | --- |
| `default.ts` | Shared defaults (port, OpenAPI, auth, JWT, …) |
| `dev.ts` | Dev: DB, Redis, `push` / `initDB` / `initMenu` / `eps` |
| `prod.ts` | Production overrides |

Update **PostgreSQL** and **Redis** in `dev.ts` (and rotate `keys` / OAuth secrets in `default.ts`).

### 2. Run

```bash
bun run dev
```

| Item | Notes |
| --- | --- |
| Default port | `3000` (may auto-pick if busy) |
| OpenAPI | `http://127.0.0.1:3000/docs` |
| Hot reload | `--watch` on Controllers / Services |

On `NODE_ENV=dev` (with flags enabled), startup will:

1. Index entities  
2. Sync schema via `drizzle-kit push`  
3. Seed `db.json` / `menu.json` (first-time / empty-table rules; markers in `base_conf`)  
4. Generate EPS for Admin  

### 3. Default super admin (seed)

From `src/modules/base/db.json` (imported on first init):

| Field | Value |
| --- | --- |
| Username | `admin` |
| Password | `123456` |

> Change the password immediately in production, and rotate `keys`, DB credentials, and third-party secrets.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Dev with hot reload |
| `bun run build` | Readable bundle → `dist/index.js` |
| `bun run build:obfuscate` | Minify + obfuscate (recommended for prod) |
| `bun run binary` | Compile Linux x64 binary |
| `bun run binary:obfuscate` | Obfuscate then compile → `dist/service` |

```bash
NODE_ENV=prod bun dist/index.js
```

## Project layout

```text
vome-service/
├── src/
│   ├── config/           # default / dev / prod
│   ├── index.ts
│   ├── lib/              # db / auth / cache / ticket / queue / task / socket …
│   ├── middleware/       # adminAuth / webAuth / requestLog …
│   └── modules/
│       ├── base/         # Admin: users, roles, menus, depts, dict, jobs, logs, plugins…
│       │   ├── controller/{admin,app}/
│       │   ├── service/
│       │   ├── entity/   # tables base_*
│       │   ├── db.json
│       │   └── menu.json
│       └── user/         # App: login, profile, App RBAC, Better Auth tables
├── typings/
├── scripts/
└── package.json
```

Routing:

| Side | Prefix | Example |
| --- | --- | --- |
| Admin | `/admin/{module}/…` | `/admin/base/user/page` |
| App | `/app/{module}/…` | `/app/user/login/password` |

Table naming: `{module}_*` (e.g. `base_user`, `user_info`).

## Adding a business module (sketch)

1. Create `entity` / `service` / `controller` under `src/modules/<name>/`  
2. Or use VS Code tasks / snippets in `.vscode/`  
3. Declare CRUD APIs on the Controller  
4. Confirm endpoints under `/docs`; wire Admin menus as needed  

```ts
@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: shopGoods,
  service: GoodsService,
})
export class GoodsController extends BaseController {
  @Inject()
  goods: GoodsService
}
```

Permission code format: `{module}:{resource}:{action}` (e.g. `shop:goods:page`). Super admins skip checks; `@Public()` skips login.

## Built-in modules

### base (Admin)

Users, roles, menus, departments & data scope, dictionaries, system config, scheduled tasks, queue monitoring, request logs, tenant switch, plugins / extension modules, and more.

### user (App)

Password / OTP login & register, profile, App RBAC, optional social / mini-program flows, Better Auth sessions & JWKS, etc.

## Related projects

Companion frontends / docs (same org, clone as needed):

| Project | Role |
| --- | --- |
| Admin | Vue admin (EPS + declarative CRUD UI) |
| Web | Consumer web |
| UniApp | Mobile |
| Docs | Developer documentation site |

Core package: [vome-core](https://www.npmjs.com/package/vome-core)

## Contributing

1. Fork this repo  
2. Create a feature branch (`feat/xxx`)  
3. Commit and push  
4. Open a Pull / Merge Request  

Issues and PRs in Chinese or English are welcome.

## License

[MIT](./LICENSE) © VomeShop / 威迈科技

---

If this project helps you, a Star ⭐ is appreciated.
