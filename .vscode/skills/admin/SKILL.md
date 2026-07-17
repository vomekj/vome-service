---
name: admin-usage
description: >-
  本仓库 admin 后台业务开发完整用法：CRUD 组件、筛选、主题、字典、别名、防连点、注意点。
  Use when editing admin/ Vue pages, CRUD views, styles, or admin UI in this repo.
---

# Admin 用法（业务开发）

> **范围**：本仓库 `admin/` 后台业务页与壳层定制。

## 能做什么

| 能力 | 说明 |
|------|------|
| 声明式 CRUD 页 | `vm-crud` + `useCrud` / `useTable` / `useUpsert` / `useSearch` |
| 自动筛选 | `<vm-search />` 按后端 `pageQueryOp` / EPS 生成；工具栏「搜索/重置」 |
| 权限菜单 | 动态菜单；无权限入口不出现；按钮级权限 |
| 字典 | `useDict()` / 管理页；筛选项 `dict: 'status'` |
| 微应用 | 菜单 `appKey` → wujie → `/vome/apps/{key}/` |
| 主题 | 蓝系锁定；只改 `theme.css` / 业务 SCSS，不改 core 结构样式 |

## 命令

```bash
cd admin
bun install
bun run dev       # 需先启动 service；端口见项目配置（常见 9000）
bun run build
```

代理：`admin/src/config/proxy.ts`（`/dev/`、`/prod/`、`/vome/` → service）。

## 路径别名

| 别名 | 指向 |
|------|------|
| `@/` | `admin/src/` |
| `/@` | `vome-core` **admin** 侧（CRUD、stores、组件） |
| `@config` | `admin/src/config` |
| `@typings` | `admin/typings` |

业务页优先用 **自动引入** 的 `vm-*`，勿手写重复 import。

## 业务页放哪

```
admin/src/modules/<module>/views/...
```

与 service 模块名、菜单 `viewPath` 一致。

## 可以用什么

### 标准 CRUD 页结构

```vue
<template>
  <vm-crud ref="Crud">
    <vm-row>
      <vm-search />
    </vm-row>
    <vm-row>
      <vm-refresh-btn />
      <vm-toolbar />
    </vm-row>
    <vm-row>
      <vm-table ref="Table" />
    </vm-row>
    <vm-row>
      <vm-flex />
      <vm-pagination />
    </vm-row>
    <vm-upsert ref="Upsert" />
  </vm-crud>
</template>

<script setup lang="ts">
defineOptions({ name: 'xxx-page' })

const { service } = useVome()
const { dict } = useDict()

useUpsert({ items: [ /* 表单字段 */ ] })
useTable({ columns: [ /* 列 */ ] })

const Crud = useCrud({ service: service.base.xxx })
</script>
```

| 组件 / API | 怎么用 |
|------------|--------|
| `vm-search` | **必须挂**，才有自动筛选 + 工具栏搜索/重置 |
| `vm-toolbar` | 默认新增/删除 + 搜索重置 + 列表/回收站；`:trash="false"` 关回收站；`:show-add="false"` 等屏蔽按钮 |
| `vm-search-key` | 一般不需要（有 `keyWordLikeFields` 时自动出关键字） |
| `useCrud` | 绑定 `service.xxx`；可 `onRefresh` 自定义拉数 |
| `useTable` | `columns`；插槽 `#cell-字段` |
| `useUpsert` | 弹窗表单项 |
| `useSearch` | 可选手写筛选项（与自动项按 prop 合并） |
| `vm-aside` / `vm-dept-tree` | 左右分栏；靠自动引入 |
| `useDict` | 字典树/取值；与后端 `dict` 键对应 |

### 工具栏变体

- 自定义左侧按钮：放在 `vm-toolbar` 默认槽；需要时 `:show-add="false"` / `:show-delete="false"`
- 无回收站列表（如日志）：`:trash="false"`

### UI / 样式（蓝系已锁定）

| 层 | 路径 | 业务可否改 |
|----|------|------------|
| 主题色 | `src/styles/theme.css` | ✅ 换色 |
| 结构 | `@vome-core/admin/styles/base.css` | ❌ 禁止为换肤改 |
| 主题 API | `src/themes/*`、`stores/theme.ts` | ✅ |
| 业务页 | `style lang="scss" scoped` | ✅ |

- 主色 `#4E5DFF`；`main.ts`：先 `theme.css` 再 `base.css`
- 业务布局用 SCSS + CSS 变量；**不要**用 Tailwind 铺满（`components/ui/**` shadcn 除外）
- 组件顺序：`template` → `script setup` → `style lang="scss" scoped`
- Dialog：Teleport + `vm-dialog-float` 约定

### 字典

- 管理：`modules/base/views/dict`
- 代码：`useDict()` / `useDictStore`
- 后端 `fieldEq: [{ column: 'status', dict: 'status' }]` → 前端自动下拉

### 微应用

菜单配 `appKey`（= 已安装模块 `key`）→ 宿主 wujie 加载 `/vome/apps/{appKey}/`。业务一般只配菜单。

### 请求按钮防连点（强制）

凡点按钮会打 `service` / HTTP：必须 `submitting`/`loading` + `:disabled`，`finally` 释放。不要只靠 debounce。

```ts
const submitting = ref(false)
async function onSubmit() {
  if (submitting.value) return
  submitting.value = true
  try {
    await service.xxx(...)
  } finally {
    submitting.value = false
  }
}
```

## 需要注意什么

1. **缺 `vm-search` 或 `:search="false"`** → 没有重置、也没有自动筛选（不要只留 `vm-search-key` 当标准页）。
2. **筛选字段以后端 `pageQueryOp` 为准**；前端 `none: true` 的字段不会出现。
3. **不要改 core `base.css` 换肤**；颜色只动 `theme.css`。
4. **不要另起灰白/紫系皮肤**。
5. **service 未启动 / 代理错** → EPS、登录、CRUD 全挂。
6. **改 vome-core admin 后**需 core `bun run build`，admin 才能吃到新组件。
7. 提交类按钮一律防连点。
