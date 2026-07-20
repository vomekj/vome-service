---
name: service-usage
description: >-
  Service 业务开发：vome-core/server API、模块、CRUD、QueryOp、权限、注入、任务与日志。
  Use when editing service/, modules, controllers, entities, or backend APIs.
---

# Service 用法（业务开发）

> **范围**：`service/` 业务后端。依赖 npm **`vome-core`**（`import … from 'vome-core/server'` 或别名 `/#/server`）。

## IDE

Snippets / Tasks 在 `service/.vscode/`，需**手动移到项目根**才生效；Skills 建议迁到 `.cursor/skills/`，入口 `AGENTS.md`。详见文档 `/service/structure#ide-vscode`。

## Core 能力一览

| 能力 | 从哪用 | 说明 |
|------|--------|------|
| 入口 / 生命周期 | `vome()` / `App` | 宿主 bootstrap，扫描模块、挂路由 |
| IoC | `@Provide` / `@Inject` / `Ioc.get` | 服务注册与注入 |
| 声明式 CRUD | `@Controller({ api, entity, service, pageQueryOp… })` | 自动挂 add/delete/update/info/list/page/restore 等 |
| 自定义路由 | `@Get` `@Post` … + `@Body` `@Query` `@Param` | 方法级 HTTP |
| 鉴权 | `@Public` `@IgnorePerms` `@Perms` | 公开 / 登录免权限码 / 覆盖权限码 |
| ORM | `DbStore` / `Repository` / `@InjectRepository` / `BaseService` | 表 CRUD、分页、软删 |
| QueryOp | `pageQueryOp` / `listQueryOp` | 联表、筛选；Admin `vm-search` 自动出控件 |
| 上下文 | `Context.get()` | adminId、perms、ip… |
| 异常 / 响应 | `CommException` / `BaseController.ok|fail|excel` | 统一 `{ code, message, data }` |
| EPS | `Eps.admin()` / `Eps.app()` | 给前端生成类型化 `service.*` |
| 插件 | `BasePlugin` / `ModuleRegistry` / `microApps` / `createModuleGateway` | 安装模块、钩子、微应用、扩展网关 |
| Excel | `buildExcelBuffer` / `parseExcelBuffer` / `excel()` | 导出与导入模板 |
| 租户 / 数据权限 | `noTenant` / `noDataScope` / `resolveDataScope`… | 按配置自动过滤；可临时关闭 |

## 宿主命令（业务侧）

```bash
cd service
bun install
bun run dev                 # 开发热更新
```

配置：`src/config/default.ts` + `dev.ts` / `prod.ts`。**禁止 `.env`**。类型放 `service/typings/<模块>/`。

## 新模块目录

```
service/src/modules/<m>/
  entity/*.ts              # 表名 {m}_* ，索引 {m}_xxx_*_idx
  service/*.ts             # @Provide + BaseService / Repository
  controller/admin/*.ts    # → /admin/{m}/...
  controller/app/*.ts      # → /app/...（或配置的 app 前缀）
  db.json / menu.json      # 可选种子
```

## Entity

```ts
import { pgTable, varchar } from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, BASE_COLUMN_COMMENTS } from 'vome-core/server'

export const shopGoods = columnComments(
  pgTable('shop_goods', {
    ...baseColumns,
    name: varchar('name', { length: 64 }).notNull(),
  }),
  { ...BASE_COLUMN_COMMENTS, name: '商品名' },
)
```

- 物理表 = `{module}_*`；用 `entitySchemas(table)` 做 Zod 校验（Repository 写入会走）
- 注释进 EPS 列元数据，Admin 表头/表单可复用

## Controller API

```ts
import {
  Controller, BaseController, Inject, Provide,
  Public, IgnorePerms, Get, Post, Body,
} from 'vome-core/server'

@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: shopGoods,
  service: GoodsService,
  pageQueryOp: { /* 见下 */ },
  listQueryOp: { /* 常与 page 同 */ },
})
export class GoodsController extends BaseController {
  @Inject() goods: GoodsService

  // this.ok(data)  → { code: 1000, message, data }
  // this.fail(msg) → { code: 1001, message }
  // this.excel(buf, 'x.xlsx') → 文件下载
  // throw new CommException('…') → 全局拦截
}
```

| API | 用法 |
|-----|------|
| 默认 prefix | `/{admin\|app}/{module}/{文件名}`，可不写 `prefix` |
| `@Public()` | 不登录 |
| `@IgnorePerms()` | 要登录，不校权限码 |
| `@Perms('a:b:c')` | 少用；覆盖自动权限码 |
| `@Use(mw)` | 单路由中间件 |
| 参数校验 | `@Body()` / `@Query()` + `Schema.pick` / `t.Object`，**不建 dto.ts** |

权限码格式：`{module}:{resource}:{action}`（如 `shop:goods:add`）。业务接口默认按路由自动鉴权；超管跳过。

## Service / IoC / Repository

```ts
@Provide()
export class GoodsService extends BaseService {
  @InjectRepository(shopGoods)
  repo: Repository<typeof shopGoods>

  @Inject() logger: Logger
  @Inject() db: DbStore
  @Inject() cache: CacheStore   // 宿主提供
}
```

### Repository 常用方法

| 方法 | 说明 |
|------|------|
| `find` / `findOne` / `findById` / `count` | 查询；默认排除软删 |
| `findPage({ page, size, where, orderBy })` | `{ list, pagination }` |
| `create` / `save` / `update` | 写入（走 entitySchemas） |
| `softDelete` / `restore` / `forceDelete` | 软删 / 恢复 / 物理删 |

也可用 `getRepository(table)`。条件多用 `drizzle-orm` 的 `eq` / `and` / `inArray` 等。

### Context

| 字段 | 用途 |
|------|------|
| `Context.get()?.adminId` / `isSuper` / `perms` | 当前后台用户 |
| `Context.get()?.ip` | 客户端 IP |

### 插件调用（宿主）

```ts
Ioc.get(PluginInfoService).invoke(key, method, …)
```

## pageQueryOp / listQueryOp

Admin `<vm-search />` 按此配置自动生成筛选项。

| 配置 | 作用 |
|------|------|
| `keyWordLikeFields` | 关键字（前端自动 `keyWord`） |
| `fieldEq` | 精确；`{ column, dict }` 下拉；`{ column, none: true }` 仅后端可筛 |
| `fieldLike` | 模糊 |
| `fieldArray` | 数组包含（按方言） |
| `fieldRange` | 区间（`min`/`max`/`type`） |
| `join` | **必填** `entity` + `alias` + `type` + `condition`（如 `'a.x = b.y'`） |
| `select` | 声明式：`['a.*', 'b.name', 'c.price as randomPrice']`；短名冲突一律 `as` |
| `where` / `extend` | 自定义条件 / 改 qb |
| `addOrderBy` | 默认排序 |

```ts
join: [
  { entity: skin, alias: 'b', type: 'leftJoin', condition: 'a.skinId = b.id' },
  { entity: skin, alias: 'c', type: 'leftJoin', condition: 'a.randomSkinId = c.id' },
],
select: ['a.*', 'b.skinName', 'c.price as randomPrice'],
keyWordLikeFields: ['a.name', 'b.skinName'],
fieldEq: [
  { column: 'c.type', dict: 'skin_type' },
  { column: 'b.id as skinId' },
],
```

软删：请求 `onlyTrashed`；`restore`；彻底删 `delete({ force: true })`。

## 定时任务 / 队列 / 日志（宿主模块）

| 能力 | 用法要点 |
|------|----------|
| 定时任务 | 表 `base_task`；`service`=类名 + `method` + `params`；croner **单机** |
| 任务队列 | `@Inject() queue: QueueStore` → `queue.jobs.add/process`（BullMQ，`prefix: vome:job`） |
| 请求日志 | `base_log` 中间件自动记；后台可清空 / `logKeep` |

## Snippets（移根后的 `.vscode`）

`entity` / `entity-index` / `controller` / `crud` / `middleware` / `store`；Tasks：**Create Module** / **Create Component**。

## 注意

1. 配置只用 `src/config/*.ts`，禁止 `.env`。
2. 类型进 `typings/`，业务文件不重复声明 interface。
3. 表名与索引带模块前缀。
4. 筛选配在后端 QueryOp；Admin 靠 EPS 出控件。
5. `ok()` 出参里 `Date` 会格式成上海时区字符串。
6. 升级 `vome-core`：`bun install` 后按 changelog 改业务调用即可。
7. 插件：有 `hook` 需 `server/index.js`；有 `routes` 需 `handlers`。

在线细文档：`/service/core/`（Controller、Repository、QueryOp、IoC、Auth、Plugin、Excel…）。
