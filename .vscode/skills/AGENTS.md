---
name: app-usage
description: >-
  本仓库应用层用法入口：service / admin / uniapp / web。
  Use when developing business code; open the matching skill below.
---

# 应用层用法（入口）

按端打开对应 Skill（正文自包含）。**各端开头有 Core API 全表**；其后为启动、鉴权/页面、字段约定、插件骨架等完整用法。

| 端 | Skill | Core 入口 | 重点章节 |
|----|--------|-----------|----------|
| 后端 | [service/SKILL.md](./service/SKILL.md) | `vome-core/server` | 启动中间件、鉴权、租户/数据权限、QueryOp、插件骨架 |
| 后台 | [admin/SKILL.md](./admin/SKILL.md) | `vome-core/admin` | 视图注册、CRUD 字段约定、上传路径、组件清单 |
| UniApp | [uniapp/SKILL.md](./uniapp/SKILL.md) | `vome-core/client` | storage/token、登录、路由鉴权、排错 |
| Web | [web/SKILL.md](./web/SKILL.md) | `vome-core/client` | EPS、Auth、stores、Socket、排错 |

## IDE 放置建议

| 项 | 怎么用 |
|----|--------|
| **Snippets / Tasks** | 模版在 `service/.vscode/`。VS Code / Cursor 只认**工作区根**的 `.vscode`，请**手动复制/移动到项目根**后再用 snippet 与 Create Module / Create Component。 |
| **Skills** | 本目录为用法说明。Cursor 等更认 `.cursor/skills/`；可自行迁过去，并以项目根 **`AGENTS.md`** 作 Agent 入口，链到各端 `SKILL.md`。 |
