---
name: app-usage
description: >-
  本仓库应用层用法入口：service / admin / uniapp / web。
  Use when developing business code; open the matching skill below.
---

# 应用层用法（入口）

按端打开对应 Skill；**完整在线文档**见 VitePress（本地 `cd docs/docs && bun run dev`）。

| 端 | Skill | 文档 |
|----|--------|------|
| 后端 | [service/SKILL.md](./service/SKILL.md) | `/service/` · [core 能力索引](/service/core/) |
| 后台 | [admin/SKILL.md](./admin/SKILL.md) | `/admin/` |
| UniApp | [uniapp/SKILL.md](./uniapp/SKILL.md) | `/uniapp/` |
| Web | [web/SKILL.md](./web/SKILL.md) | `/web/` |
| 插件 | — | `/plugins/` |

## IDE 放置建议

| 项 | 怎么用 |
|----|--------|
| **Snippets / Tasks** | 模版在 `service/.vscode/`。VS Code / Cursor 只认**工作区根**的 `.vscode`，请**手动复制/移动到项目根**后再用 snippet 与 Create Module / Create Component。 |
| **Skills** | 本目录为用法说明。Cursor 等更认 `.cursor/skills/`；可自行迁过去，并以项目根 **`AGENTS.md`** 作 Agent 入口，链到各端 `SKILL.md`。 |
