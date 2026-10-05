---
name: app-usage
description: >-
  本仓库应用层用法入口：service / admin / uniapp / web。
  Use when developing business code; open the matching skill below.
---

# 应用层用法（入口）

按端打开对应 Skill。正文面向**业务怎么用**（能力是什么、怎么配、怎么操作），不写框架内部实现细节。

| 端 | Skill | 重点 |
|----|--------|------|
| 后端 | [service/SKILL.md](./service/SKILL.md) | 模块 CRUD、筛选 QueryOp、软删、本地实体缓存（后台灌桶）、国际化、插件调用、Docker 打包 |
| 后台 | [admin/SKILL.md](./admin/SKILL.md) | CRUD 页、字典、回收站/语言 Tab、语种与语言包（列表不含 packJson）、上传、插件安装 |
| UniApp | [uniapp/SKILL.md](./uniapp/SKILL.md) | 登录、请求、语种切换、Socket |
| Web | [web/SKILL.md](./web/SKILL.md) | 登录、请求、语种切换、Socket |

## IDE 放置建议

| 项 | 怎么用 |
|----|--------|
| **Snippets / Tasks** | 模版在 `service/.vscode/`。零代码 / scaffold 会自动提到**项目根** `.vscode/`；手动拉模版请自行移到根后再用。 |
| **Skills** | 本目录用法说明。Cursor 认 `.cursor/skills/`；scaffold 会迁过去，并以项目根 **`AGENTS.md`** 作入口。 |
