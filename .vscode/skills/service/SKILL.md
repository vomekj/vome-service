---
name: service-usage
description: >-
  Service 业务开发：vome-core/server API、模块、CRUD、QueryOp、权限、注入、任务与日志。
  Use when editing service/, modules, controllers, entities, or backend APIs.
---

# Service 用法（业务开发）

> **范围**：`service/` 业务后端。依赖 npm **`vome-core`**（`import … from 'vome-core/server'` 或别名 `/#/server`）。

## IDE

Snippets / Tasks 在 `service/.vscode/`，需**手动移到项目根**才生效；Skills 建议迁到 `.cursor/skills/`，入口见 [AGENTS.md](../AGENTS.md)。

## Core（`vome-core/server`）完整 API

导入：`import { … } from 'vome-core/server'`（或 `/#/server`）。宿主须 `import 'reflect-metadata'`，并开启 `experimentalDecorators` + `emitDecoratorMetadata`。

### 入口与配置

| API | 用法 |
|-----|------|
| `registerHost({ … })` | **必填**：静态绑定 Db/Cache/Queue/Auth/Task/Plugin/Module/Socket/middleware/`scan`；`index.ts` 须先 `import './lib/host'` |
| `vome(({ App }) => { … })` | 宿主入口；回调里注册 bootstrap/shutdown/use，结束自动 `App.start()` |
| `App.bootstrap` / `shutdown` / `use` / `start` / `stop` | 生命周期钩子与启停 |
| `VomeConfig` | 合并后的配置对象（只读使用） |
| `getEnv()` | 当前环境标识 |
| `version` | 包版本字符串 |
| `isSeatEnforced` / `assertModuleInstallAllowed` | 生产构建（`SEAT_ENFORCE`）下市场签/席位/license 门禁 |

### IoC

| API | 用法 |
|-----|------|
| `@Provide()` | 注册服务；可选 `@Provide('id')` / `@Provide({ id, scope })` |
| `@Inject()` / `@Inject('id')` | 属性注入（按类型或显式 token） |
| `Ioc.get(Token)` | 手动取实例 |
| `ScopeEnum` | `Singleton`（默认）/ `Request` / `Prototype` |
| `listProviders()` | 已注册 Provider 列表（调试用） |

### 路由与控制器

| API | 用法 |
|-----|------|
| `@Controller({ api?, entity?, service?, pageQueryOp?, listQueryOp?, prefix?, importUniqueKeys? })` | 注册控制器；配 `api`+`entity`+`service` 自动挂 CRUD |
| `@Get` `@Post` `@Put` `@Patch` `@Delete` | 自定义 HTTP 方法 |
| `@Body()` `@Query()` `@Param()` | 参数绑定 + 校验 |
| `@Public()` | 跳过登录 |
| `@IgnorePerms()` | 要登录，不校权限码 |
| `@Perms('a:b:c')` | 覆盖自动权限码（少用） |
| `@Use(mw)` | 单路由中间件 |
| `BaseController` | `this.ok(data)` / `this.fail(msg)` / `this.excel(buf, name)` |
| `RES_CODE` | 业务码常量（成功等） |
| `defineAuthMacro(name, fn)` | 定义 admin/app 鉴权 macro（宿主 middleware 里用） |
| `isPublicHttpRoute` / `listControllers` | 路由元信息查询（少用） |

声明式 CRUD `api` 常见值：`add` `delete` `update` `info` `list` `page` `restore`。配了 `entity` 且含 `add`/`update` 时自动挂 **`importTemplate`（GET）** / **`import`（POST）**。

### ORM / Entity / CRUD 服务

| API | 用法 |
|-----|------|
| `baseColumns` / `BASE_COLUMN_COMMENTS` | 标准列（id、时间、软删等）与中文注释 |
| `columnComments(table, map)` / `getColumnComments` / `syncColumnCommentsToPg` | 列注释 → EPS / PG |
| `entitySchemas(table)` | Zod 校验（Repository 写入会走） |
| `DbStore` | 注入后拿 drizzle 客户端 |
| `@InjectRepository(table)` / `getRepository(table)` | 表级 Repository 单例 |
| `Repository` | `find` `findOne` `findById` `count` `findPage` `create` `save` `update` `softDelete` `restore` `forceDelete` `supportsSoftDelete` |
| `BaseService` | CRUD 业务基类：`add` `update` `delete` `info` `list` `page` `restore`；可覆写 `modifyBefore` / `modifyAfter` |
| `q` | QueryOp 辅助（高级） |
| `attachCrudRoutes` | 手动挂 CRUD 路由（少用；一般靠 `@Controller`） |

### QueryOp（`pageQueryOp` / `listQueryOp`）

见下文专节。联表 `join` **必须** `entity`+`alias`+`type`+`condition`；`select` 用字符串数组；短名冲突用 `as`。

### 上下文 / 异常 / 日志

| API | 用法 |
|-----|------|
| `Context.get()` | 读当前请求上下文 |
| `Context({ … })` | 合并写入字段 |
| `Context.run(ctx, fn)` | 非 HTTP（队列/定时任务）里跑一段带上下文的代码 |
| `CommException` / `isCommException` | 抛业务异常；全局拦截成 fail 响应 |
| `Logger` | `@Inject() logger: Logger` |

`ContextData` 字段：

| 侧 | 字段 |
|----|------|
| 公共 | `requestId` `method` `path` `ip` `host` `startTime` |
| Admin（`adminAuth`） | `adminId` `username` `isSuper` `perms` `dataScope` `dataScopeDeptIds` `tenantId` |
| App（`webAuth` → macro **`auth`**） | `userId` `appPerms` `appOpenAll` `tenantId` |

### 租户 / 数据权限

| API | 用法 |
|-----|------|
| `isTenantEnabled()` | 是否开多租户 |
| `noTenant(fn)` | 临时关闭租户过滤执行 `fn` |
| `normalizeHost` / `resolveTenantScope` | 按 Host 解析租户 |
| `tableHasDepartmentId` | 表是否有部门字段 |
| `resolveDataScope` / `applyDataScopeWhere` / `applyRowScopes` | 数据权限解析与应用到查询 |
| `noDataScope(fn)` | 临时关闭数据权限 |

### EPS

| API | 用法 |
|-----|------|
| `Eps.admin()` / `Eps.app()` | 生成给前端的 EPS 数据 |
| `isEpsEnabled` | 配置是否开启 EPS |

### 插件 / 模块

| API | 用法 |
|-----|------|
| `BasePlugin` | 插件基类；覆写 `ready()`；框架调 `init()` |
| `loadPluginClass` / `loadPluginClassFromPath` | 动态加载插件类 |
| `loadModuleHandlers` / `loadModuleHandlersFromPath` | 加载模块 handlers |
| `readPluginScript` / `resolvePluginServerPath` | 读 `modules/.../server` 脚本 |
| `pDataPath` `pPluginPath` `pModulesPath` `pModulePath` | 数据/插件/模块目录路径 |
| `ModuleRegistry` | 已装模块注册表 |
| `microApps` | 微应用静态资源挂载 |
| `createModuleGateway` | `/admin/ext/{key}/…` 扩展网关 |

业务调用已装插件（宿主 `PluginInfoService`）：`Ioc.get(PluginInfoService).invoke(key, method, …)`。

### Excel

| API | 用法 |
|-----|------|
| `buildExcelBuffer(columns, rows)` | 导出 xlsx |
| `buildImportTemplateBuffer(columns)` | 仅表头模板 |
| `parseExcelBuffer(buf)` | 解析上传 |
| `excelFilename` / `excelResponseHeaders` | 下载名与响应头 |
| `IMPORT_SKIP_FIELDS` / `isImportSkipField` | 导入跳过 id/时间/tenant 等 |
| `this.excel(buf, 'x.xlsx')` | Controller 返回文件 |

自动导入：模板列不含 `id`/`createTime`/`updateTime`/`deletedAt`/`tenantId`；有 `id` 或唯一键则更新，否则新增；`importUniqueKeys` 可指定唯一键组。

### 类型（常用）

`PageQuery` `PageResult` `PagePagination` `QueryOp` `QueryJoin` `CrudApi` `ControllerCrudOptions` `ClassToken` `ContextData` `ApiResult` `PluginManifest` `ModuleManifest` 等从同包 `export type` 引入。

---

## 宿主命令（业务侧）

```bash
cd service
bun install
bun run dev                 # 开发热更新
```

配置：`src/config/default.ts` + `dev.ts` / `prod.ts`。类型放 `service/typings/<模块>/`。

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
| 当前后台用户 | `Context.get()?.adminId` / `isSuper` / `perms` / `dataScope` |
| 当前 App 用户 | `Context.get()?.userId` / `appPerms` / `appOpenAll` |
| IP | `Context.get()?.ip` |
| 租户 | `Context.get()?.tenantId` |

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

## Excel（core 导出）

| API | 用法 |
|-----|------|
| `buildExcelBuffer(columns, rows)` | 列 + 行 → xlsx 二进制 |
| `buildImportTemplateBuffer(columns)` | 导入模板 |
| `parseExcelBuffer(buf)` | 解析上传文件 |
| `excelFilename(name)` / `excelResponseHeaders` | 下载文件名与头 |
| `this.excel(buf, 'x.xlsx')` | Controller 返回文件 Response |

## 启动与中间件

`service/src/index.ts`：

```ts
import 'reflect-metadata'
import './lib/host' // registerHost 静态绑定（build 与 IoC 同一模块图）
import { Ioc, vome } from '/#/server'

vome(({ App }) => {
  // App.bootstrap(async () => { /* 启动后初始化 */ })
  App.shutdown(async () => { /* 退出前清理，如刷日志 */ })
  // App.use((app) => app.use(/* 额外 Elysia 插件 */))
})
```

| 文件 | 作用 |
|------|------|
| `src/lib/host/index.ts` | `registerHost({ Db…Socket, middleware, scan })` |
| `src/lib/host/scan.ts` | **生成物**（勿手改）：`bun run gen:host-scan` / 各 build 脚本前置 |
| `scripts/gen-host-scan.ts` | 扫描 `modules/*/service|controller` 写出相对 `import()` |

`App.start()`：`registerHost` 中间件 → `scanHost`（优先 `registerHost.scan`）→ IoC → 路由。  
**禁止**再 `pathToFileURL` 加载 `src/lib`（打包后会出现 `Logger` 未注册）。

宿主中间件在 `src/middleware/`：

| 文件 | 作用 |
|------|------|
| `adminAuth.ts` | 后台 JWT → `Context`（adminId、perms、dataScope…） |
| `webAuth.ts` | App 侧会话 → `userId` / `appPerms` 等 |
| `requestLog.ts` | 请求日志入库 |
| `microApps.ts` | 微应用静态资源 |
| `moduleGateway.ts` | `/admin/ext/{key}/…` |

鉴权形态必须用 core 的 `defineAuthMacro`（见下）。

### 打包与席位

| 命令 | 说明 |
|------|------|
| `bun run gen:host-scan` | 新增模块后手动重生成（dev/build 已自动） |
| `bun run build` / `binary` | 含 `--define SEAT_ENFORCE:true`：生产验 `market.sig`、付费包 `market.lic`/联网签发、席位心跳 |
| `bun run dev` | 无 `SEAT_ENFORCE`：本地/自研包安装放行 |

## 鉴权（adminAuth 样例）

```ts
import { Context, Ioc, defineAuthMacro } from '/#/server'

export const adminAuth = defineAuthMacro('adminAuth', async ({ status, request }) => {
  const session = await Ioc.get(AdminAuthService).resolveAuth(request.headers)
  if (!session) return status(401, { code: 1001, message: 'unauthorized' })

  const authz = await Ioc.get(PermissionService).getAdminAuthz(session.adminId)
  Context({
    adminId: session.adminId,
    username: session.username,
    tenantId: session.tenantId ?? null,
    isSuper: authz.isSuper,
    perms: authz.perms,
    dataScope: authz.dataScope ?? (authz.isSuper ? 'all' : 'none'),
    dataScopeDeptIds: authz.dataScopeDeptIds ?? [],
  })
  return { admin: session, isSuper: authz.isSuper, perms: authz.perms, … }
})
```

| 装饰器 | 行为 |
|--------|------|
| `@Public()` | 不跑登录 macro |
| `@IgnorePerms()` | 登录，不校 `{module}:{resource}:{action}` |
| 默认 | 自动权限码；`isSuper` 跳过 |
| `@Perms('a:b:c')` | 覆盖自动码（少用） |

Better Auth：宿主 `src/lib/auth`，默认 `basePath: '/api/auth'`；配置在 `src/config/*.ts` 的 `auth`。客户端 `authClient`，服务端 `auth.api`。

菜单配 `perms` 与后端码一致；Admin 按钮 `v-perm="'shop:goods:add'"`。

## 租户与数据权限（怎么用）

| 场景 | 做法 |
|------|------|
| 开多租户 | 配置 `vome.tenant: true`；表含 `tenantId`；鉴权写入 `Context.tenantId`；Repository 自动按租户过滤 |
| 某段查询忽略租户 | `await noTenant(async () => { … })` |
| 数据权限 | 角色配 `dataScope`：`all` / `dept` / `deptAndChild` / `self` / `none` + `dataScopeDeptIds`；表有 `departmentId` / 创建人字段时 Repository 自动过滤 |
| 某段忽略数据权限 | `await noDataScope(async () => { … })` |
| 超管 | `isSuper` → 通常 `dataScope: 'all'`，不挡查询 |

业务里一般**不必**手写 `applyDataScopeWhere`；只有自定义 SQL/特殊报表才需要。

## BaseService 常用方法

继承后可直接给声明式 CRUD 用，也可业务里调用：

| 方法 | 说明 |
|------|------|
| `add(data)` | 新增；可走 `modifyBefore/After('add')` |
| `update(data)` / 按条件更新 | 更新 |
| `delete(idsOrWhere, { force? })` | 默认软删；`force: true` 物理删 |
| `restore(ids)` | 恢复软删 |
| `info(id)` / `list` / `page` | 详情 / 列表 / 分页（吃 QueryOp） |
| `modifyBefore` / `modifyAfter` | 覆写钩子，改写入前后逻辑 |

## 配置要点（`src/config`）

| 项 | 说明 |
|----|------|
| `default.ts` + `dev.ts` / `prod.ts` | 深度合并； |
| `system.port` | HTTP 端口 |
| `vome.eps` / `initDB` / `initMenu` / `tenant` | EPS、种子、菜单种子、多租户 |
| `db` / Redis / `auth` | 数据库与 Better Auth |

## 菜单与种子

| 文件 | 作用 |
|------|------|
| `modules/<m>/db.json` | 表种子（`vome.initDB`） |
| `modules/<m>/menu.json` | 仅当存在 `{m}_menu` 表时导入；**多数项目菜单写在 `base/menu.json` 或后台「菜单管理」** |
| 菜单字段 | `type`：0 目录 / 1 菜单 / 2 按钮；`router`、`viewPath`、`perms`、`appKey`（微应用） |

改种子后若未再导入，可能需清 init 标记或走后台菜单 UI。

## 插件：最小可运行骨架（业务侧怎么写/调）

**包内约定**（安装后落在 `data/plugin/{key}` 或 `modules/{key}`）：

```
module.json          # name/key/version；建议 hook；config.@local/@prod
server/index.js      # 构建产物（有 hook 时必须有）
src/index.ts         # 开发源（发布前编成 server）
```

`module.json`：`key` 匹配 `[a-zA-Z0-9_-]+`，不能为 `plugin`。有 `routes` 必须有对应 `handlers`。

插件类：

```ts
import { BasePlugin } from 'vome-plugin-runtime' // 宿主加载时注入真实 BasePlugin

export class DemoPlugin extends BasePlugin {
  async ready() {
    const cfg = (this.pluginInfo?.config ?? {}) as Record<string, unknown>
  }

  async ping() {
    return { ok: true, key: this.pluginInfo?.key }
  }
}

export const Plugin = DemoPlugin // 加载器约定名，必须导出
```

宿主业务调用：

```ts
await Ioc.get(PluginInfoService).invoke('demo', 'ping')
// getConfig(key) / getInstance(key) / reInit / remove
```

| 规则 | 说明 |
|------|------|
| 同 `hook` | 通常只能启用一个 |
| 配置 | 只读 `pluginInfo.config`，插件内 |
| 微应用 | 需 front/full 类插件或菜单配 `appKey`；纯 service 插件无前端页 |
| 路径工具 | `pModulePath` / `pPluginPath` / `readPluginScript`（只认 `modules/.../server`） |

## 定时任务 / 队列 / 日志（宿主模块）

| 能力 | 用法要点 |
|------|----------|
| 定时任务 | 表 `base_task`；`service`=类名 + `method` + `params`；croner **单机**；启停走后台接口 |
| 任务队列 | `@Inject() queue: QueueStore` → `queue.jobs.add/process`（BullMQ，`prefix: vome:job`，队列名勿含 `:`） |
| 请求日志 | `base_log` 中间件自动记；后台可清空 / `logKeep` |

```ts
await this.queue.jobs.add('email', { orderId }, { delay: 3000, attempts: 3 })
// this.queue.jobs.process('email', async (job) => { … })
```

## Snippets（移根后的 `.vscode`）

`entity` / `entity-index` / `controller` / `crud` / `middleware` / `store`；Tasks：**Create Module** / **Create Component**。

## 注意

1. 配置优先写在 `src/config/*.ts`（也可在 config 内自行读取环境变量）。
2. 类型进 `typings/`，业务文件不重复声明 interface。
3. 表名与索引带模块前缀。
4. 筛选配在后端 QueryOp；Admin 靠 EPS 出控件。
5. `ok()` 出参里 `Date` 会格式成上海时区字符串。
6. 升级 `vome-core`：`bun install` 后按本 Skill 调整业务调用即可。
7. 插件：有 `hook` 需 `server/index.js`；有 `routes` 需 `handlers`；必须 `export const Plugin`。
