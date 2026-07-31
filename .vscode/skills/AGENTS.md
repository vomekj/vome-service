---
name: app-usage
description: >-
  本仓库应用层用法入口：service / admin / uniapp / web。
  Use when developing business code; open the matching skill below.
---

# 应用层用法（入口）

按端打开对应 Skill（正文自包含）。**各端开头有 Core API 全表**；其后为启动、鉴权/页面、字段约定、插件骨架等完整用法。

| 端 | Skill | 框架入口 | 重点章节 |
|----|--------|----------|----------|
| 后端 | [service/SKILL.md](./service/SKILL.md) | `vome-core/server` | 启动中间件、鉴权、租户/数据权限、QueryOp、插件骨架 |
| 后台 | [admin/SKILL.md](./admin/SKILL.md) | `/@` admin 包 | 视图注册、CRUD、**字典 get/options**、上传路径、组件清单 |
| UniApp | [uniapp/SKILL.md](./uniapp/SKILL.md) | `vome-core/client` | storage/token、登录、路由鉴权、排错 |
| Web | [web/SKILL.md](./web/SKILL.md) | `vome-core/client` | EPS、Auth、stores、Socket、排错 |

## IDE 放置建议

| 项 | 怎么用 |
|----|--------|
| **Snippets / Tasks** | 模版在 `service/.vscode/`。零代码 / `vome-agent` scaffold 会自动提到**项目根** `.vscode/`；手动拉模版请自行移到根后再用 snippet 与 Create Module / Create Component。 |
| **Skills** | 本目录用法说明。Cursor 认 `.cursor/skills/`；scaffold 会自动迁过去，并以项目根 **`AGENTS.md`** 作入口，链到各端 `SKILL.md`。 |
