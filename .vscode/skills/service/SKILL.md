---
name: service-usage
description: >-
  本仓库 service 业务开发完整用法：模块、CRUD、权限、注入、任务与日志、注意点。
  Use when editing service/, modules, controllers, entities, or backend APIs in this repo.
---

# Service 用法（业务开发）

> **范围**：本仓库 `service/` 业务后端。

## 能做什么

| 能力 | 说明 |
|------|------|
| 业务模块 | `modules/<m>/`：entity / service / controller（admin、app） |
| 声明式 CRUD | `@Controller({ api, entity, service, pageQueryOp… })` 自动挂路由 |
| 权限 | 权限码 `{module}:{resource}:{action}`；超管跳过 |
| 双端 API | 后台 `/admin/...`；客户端 `/api/...`（或配置的 app 前缀） |
| 字典 / 菜单 / 角色 | base 模块已有；业务接菜单与 perms |
| 定时任务 | `base_task` + croner（单机） |
| 任务队列 JobQueue | BullMQ，Redis prefix `vome:job`；可延迟/重试（`queue.jobs`） |
| 请求日志 | `base_log` 全量入库；后台可查 / 清空 / 保留天数 |
| 插件模块 | 安装 `.vome`；钩子 `invoke`；微应用 `/vome/apps/{key}/`；扩展网关 `/admin/ext/{key}/…` |

## 命令

```bash
cd service
bun install
bun run dev                 # NODE_ENV=dev，热更新
bun run build               # 可读打包
bun run build:obfuscate     # 混淆（部署）
bun run binary:obfuscate    # 混淆后再编 Linux 二进制
```

改了 `packages/vome-core` 后须：`cd packages/vome-core && bun run build`，service 才能用到新 API。

## 配置与类型

| 项 | 约定 |
|----|------|
| 配置 | `src/config/default.ts` + `dev.ts` / `prod.ts` |
| 禁止 | **不要**用 `.env`；密钥写在上述 TS |
| 类型 | 业务类型只放 `service/typings/<模块>/`；`src/` 里用 `import type`，勿再声明 `type`/`interface` |
| 例外 | entity 里 `pgTable`（运行时 + 类型一体） |

## 新模块目录（最小集）

```
service/src/modules/<m>/
  entity/*.ts              # 表名 {m}_* ，索引 {m}_xxx_*_idx
  service/*.ts             # @Provide + BaseService / Repository
  controller/admin/*.ts    # → /admin/{m}/...
  controller/app/*.ts      # 需要时再加 → /api/...
  db.json                  # 可选种子
  menu.json                # 有后台菜单时（如 base）

service/typings/<m>/*.ts   # 仅类型，非请求体 DTO
```

未要求的文件不要加（如无用的 `dto.ts`）。

## 表命名

| 规则 | 示例 |
|------|------|
| 物理表 = `{module}_*` | `base_user`、`user_info` |
| 禁止 | 跨模块前缀、随意 `*_sys_*` |

## 可以用什么

### Controller / 响应

```ts
import { Controller, BaseController, Inject, Provide, Public, IgnorePerms } from '@vome-core'
// 或项目约定的 /# 路径

@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: myTable,
  service: MyService,
  pageQueryOp: { /* 见下 */ },
  listQueryOp: { /* 常与 page 同 */ },
})
export class MyController extends BaseController {
  @Inject()
  my: MyService

  // this.ok(data) → { code: 1000, message, data }
  // this.fail(msg) → { code: 1001, message }
  // throw new CommException('…') → 全局拦截
}
```

- **可不写 `prefix`**：默认 `/{admin|app}/{module}/{文件名}`
- 自定义路由：类上 `@Get` / `@Post` 等方法
- 校验：路由参数用实体 `Schema.pick` / `t.Object` 等，**不建 dto.ts**
- `@Public()`：不登录；`@IgnorePerms()`：要登录但不校验权限码；`@Perms('a:b:c')`：少用（覆盖自动码）
- `@Use(mw)`：单路由中间件

### Service / 注入

```ts
@Provide()
export class MyService {
  @Inject() logger: Logger
  @Inject() db: DbStore
  @Inject() cache: CacheStore
}
```

| 需求 | 用法 |
|------|------|
| 当前后台用户 | `Context.get()?.adminId` / `isSuper` / `perms` |
| IP | `Context.get()?.ip` |
| 密码 | `Bun.password.hash` / `verify` |
| 调插件 | `Ioc.get(PluginInfoService).invoke(key, method, …)` |

### pageQueryOp / listQueryOp（列表筛选，Admin 自动生成筛选项）

| 配置 | 作用 |
|------|------|
| `keyWordLikeFields` | 关键字（前端自动出 keyWord） |
| `fieldEq` | 精确；`{ column, dict }` 下拉；`{ column, none: true }` 后端可筛、前端不出控件 |
| `fieldLike` | 模糊 |
| `fieldArray` | 数组包含（PG：`integer[]`/`jsonb`；MySQL·SQLite：`json`） |
| `fieldRange` | 时间/数字区间（`min`/`max`/`type`） |
| `join` / `select` / `where` / `extend` | 联表与自定义条件 |
| `addOrderBy` | 默认排序 |

软删：请求带 `onlyTrashed`；`restore`；彻底删 `delete({ force: true })`。

### 权限码

格式：`{module}:{resource}:{action}`（如 `base:menu:add`）。

- 菜单 type：0 目录 / 1 菜单 / 2 按钮权限
- 业务接口默认按路由自动鉴权，一般**不必**手写 `@Perms`
- 超管跳过校验
- 配菜单：`base/menu.json` 或后台菜单管理；改种子后可能需清 init 标记再导入

### 定时任务

| 类型 | 字段 | 说明 |
|------|------|------|
| cron | `cron` | 循环 |
| once | `startDate` | 一次，到期后 status→0 |

- 表 `base_task`；后台启停走接口（改库不够）
- `service` = 类名，`method`、`params` JSON
- **单机** croner；多实例会重复执行

### 任务队列（BullMQ，与 cron 独立）

Redis 参数与 `cacheManager` 相同；ioredis **共用一条连接**（Worker 用 `duplicate()`）。  
**仅 Redis 存储**（无 PG 实体）；生产请为 Redis 开启 **AOF**（或 RDB），进程/机器重启后由 Redis 恢复队列数据。

注入：`@Inject() queue: QueueStore` → `queue.jobs`（BullMQ `prefix: vome:job`，队列名勿含 `:`）。可延迟、重试、并发。

```ts
import { Inject, Provide } from '/#/server'
import { QueueStore } from '../../lib/queue'

@Provide()
export class OrderService {
  @Inject()
  queue: QueueStore

  async onPaid(orderId: number) {
    await this.queue.jobs.add('email', { orderId }, { delay: 3000, attempts: 3 })
  }
}

// 启动后注册消费者（可放在任意 @Provide 服务构造后 / 模块初始化）
// this.queue.jobs.process('email', async (job) => { ... })
```

管理 API：`/admin/base/queue/*`；页面 `modules/base/views/queue/index`（菜单需自建，viewPath 指向该页）。**禁止**内置 `demo.ping` 等测试队列。

### 请求日志

- 表 `base_log`；中间件自动记 admin/app 请求
- 管理：清空、保留天数（`logKeep`）

## Snippets（仓库根 `.vscode`）

在宿主工作区可用：`controller` / `entity` / `crud` / `middleware` / `store` 等 code-snippets；Tasks 可创建模块（以当前 `.vscode/tasks.json` 为准）。

## 需要注意什么

1. **配置只用 `src/config/*.ts`**，禁止 `.env`。
2. **类型进 typings**，业务文件不重复声明 interface。
3. **表名带模块前缀**；索引同前缀。
4. **CRUD 筛选配在后端**，Admin 靠 EPS 自动出筛选项；`none: true` 可隐藏前端控件。
5. **Date 出参**经 `ok()` 会格式成上海时区字符串。
6. **改 core 必须 build** 后再跑 service。
7. **插件**：有 `hook` 必须带 `server/index.js`；有 `routes` 必须有 `handlers`；公开方法名要进混淆 `reservedNames`（若打包混淆）。
8. **不要**擅自加根 workspaces、乱建 `src/utils` 杂物抽屉。
