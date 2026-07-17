

# Vome Service

[English](./README.en.md) | 简体中文

基于 **Bun + Elysia** 的高性能业务后端脚手架。核心能力由 npm 包 [`vome-core`](https://www.npmjs.com/package/vome-core) 提供，业务代码按模块落在 `src/modules/`，开箱即用后台（Admin）与用户端（App）双端 API。

> 威迈科技开源项目。适合快速搭建管理后台 + C 端应用的服务端。

## 特性

| 能力 | 说明 |
| --- | --- |
| **声明式 CRUD** | `@Controller` + Entity 一键生成 `page/list/info/add/update/delete/restore/import/export` |
| **双 RBAC** | Admin：菜单权限码；App：角色 `perms` JSON；`@Public` / `@IgnorePerms` / 超管豁免 |
| **IoC** | `@Provide` / `@Inject` / `Repository` / 请求上下文 `Context` |
| **ORM** | Drizzle + PostgreSQL；dev 可 `push` 同步表结构；`db.json` / `menu.json` 种子 |
| **认证** | 后台 JWT；C 端 Better Auth（密码 / OTP / 社交登录等） |
| **EPS + OpenAPI** | 动态接口描述供 Admin 挂载；`/docs` 在线文档 |
| **队列 / 定时任务** | BullMQ + Cron；任务与队列可后台管理 |
| **Socket.IO** | 可选 Redis Adapter，后台 / App 实时通道 |
| **插件与微应用** | 可热加载插件、Module Federation / 微应用网关 |
| **请求日志** | 可配置写入范围（异常 / 其它业务接口 / CRUD / `@Public` 开放接口等） |
| **部署** | 可读打包、JS 混淆、Linux 单文件二进制 |

## 技术栈

- 运行时：[Bun](https://bun.sh)
- Web：[Elysia](https://elysiajs.com)
- ORM：[Drizzle](https://orm.drizzle.team)
- 认证：[Better Auth](https://www.better-auth.com)（App 端）
- 缓存 / 队列：Redis、BullMQ
- 框架核：`vome-core`

## 环境要求

- Bun（建议最新稳定版）
- PostgreSQL
- Redis（缓存、队列、Socket Adapter、部分登录态）

## 快速开始

```bash
git clone https://gitee.com/vomekj/vome-service.git
cd vome-service
bun install
```

### 1. 修改配置

配置写在 `src/config/`（**不使用 `.env`**），按环境合并：

| 文件 | 用途 |
| --- | --- |
| `default.ts` | 公共默认（端口、OpenAPI、Auth、JWT 等） |
| `dev.ts` | 开发：数据库、Redis、`push` / `initDB` / `initMenu` / `eps` |
| `prod.ts` | 生产覆盖项 |

至少改好 `dev.ts` 中的 **PostgreSQL** 与 **Redis**（以及 `default.ts` 里的 `keys` / 社交登录密钥等）。

### 2. 启动

```bash
bun run dev
```

| 项 | 说明 |
| --- | --- |
| 默认端口 | `3000`（占用时可自动换端口，见配置） |
| OpenAPI | `http://127.0.0.1:3000/docs` |
| 热更新 | `--watch`，改 Controller / Service 后自动重载 |

开发启动时（`NODE_ENV=dev` 且开关开启）会自动：

1. 扫描 Entity → 建表索引  
2. `drizzle-kit push` 同步表结构  
3. 导入模块 `db.json` / `menu.json` 种子（仅首次或空表策略，见 `base_conf` 初始化标记）  
4. 生成 EPS（供 Admin 使用）

### 3. 默认超管（种子）

`src/modules/base/db.json` 内置超级管理员（首次初始化写入）：

| 字段 | 值 |
| --- | --- |
| 用户名 | `admin` |
| 密码 | `123456` |

> 生产环境请立即修改密码，并更换 `keys`、数据库与第三方密钥。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `bun run dev` | 开发热更新 |
| `bun run build` | 可读打包 → `dist/index.js` |
| `bun run build:obfuscate` | minify + 混淆（推荐生产） |
| `bun run binary` | 编译 Linux x64 二进制 |
| `bun run binary:obfuscate` | 混淆后再编二进制 → `dist/service` |

运行生产包示例：

```bash
NODE_ENV=prod bun dist/index.js
```

## 目录结构

```text
vome-service/
├── src/
│   ├── config/           # default / dev / prod（禁止 .env）
│   ├── index.ts          # 入口
│   ├── lib/              # db / auth / cache / queue / task / socket …
│   ├── middleware/       # adminAuth / webAuth / requestLog …
│   └── modules/
│       ├── base/         # 后台：用户、角色、菜单、部门、字典、任务、日志、插件…
│       │   ├── controller/{admin,app}/
│       │   ├── service/
│       │   ├── entity/   # 表名 base_*
│       │   ├── db.json   # 种子（如超管）
│       │   └── menu.json # 后台菜单种子
│       └── user/         # C 端：登录、资料、App RBAC、Better Auth 相关表
├── typings/              # 类型定义（按模块分类）
├── scripts/              # 混淆等
└── package.json
```

路由约定：

| 端 | 前缀 | 示例 |
| --- | --- | --- |
| Admin | `/admin/{module}/…` | `/admin/base/user/page` |
| App | `/app/{module}/…` | `/app/user/login/password` |

表名约定：`{module}_*`（如 `base_user`、`user_info`）。

## 新建业务模块（简述）

1. 在 `src/modules/<name>/` 下按约定建 `entity` / `service` / `controller`  
2. 或使用仓库内 VS Code Task / Snippet（`.vscode/`）快速脚手架  
3. Entity 用 `pgTable`，Controller 声明 CRUD API  
4. `bun run dev` 后在 `/docs` 确认接口；Admin 侧配菜单即可挂页  

示例（概念）：

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

权限码格式：`{module}:{resource}:{action}`（如 `shop:goods:page`）。超管跳过校验；`@Public()` 免登录。

## 内置模块概览

### base（后台）

用户 / 角色 / 菜单 / 部门 / 数据权限、字典、系统配置、定时任务、队列监控、请求日志、租户开关、插件与扩展模块管理等。

### user（C 端）

密码 / 验证码登录与注册、个人资料、App 角色权限、社交与小程序相关能力（可按配置启用）、Better Auth 会话与 JWKS 等。

## 相关项目

可与下列前端 / 文档配合使用（同组织仓库，按需克隆）：

| 项目 | 说明 |
| --- | --- |
| Admin | Vue 管理后台（EPS + 声明式 CRUD 页） |
| Web | C 端 Web |
| UniApp | 移动端 |
| Docs | 开发文档站 |

核心框架包：[vome-core](https://www.npmjs.com/package/vome-core)

## 贡献

1. Fork 本仓库  
2. 新建特性分支（`feat/xxx`）  
3. 提交并推送  
4. 发起 Pull Request / Merge Request  

Issue 与 PR 欢迎中英文。

## 许可证

[MIT](./LICENSE) © VomeShop / 威迈科技

---

若本仓库对你有帮助，欢迎 Star ⭐