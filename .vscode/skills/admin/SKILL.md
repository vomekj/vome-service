---
name: admin-usage
description: >-
  Admin 业务开发：vome-core/admin CRUD 组件与 hooks、筛选、字典、主题、权限、防连点。
  Use when editing admin/ Vue pages, CRUD views, or admin UI.
---

# Admin 用法（业务开发）

> **范围**：`admin/` 后台业务页。CRUD / 布局组件来自 npm **`vome-core/admin`**（别名 `/@`）。

## IDE

与 Service 相同：把含 `vm-crud` 等 snippet 的 `.vscode` **移到项目根**；Skills 建议 `.cursor/skills/` + 根 `AGENTS.md`。见文档 `/service/structure#ide-vscode`。

## Core（admin 侧）能力一览

| 能力 | API / 组件 | 说明 |
|------|------------|------|
| CRUD 壳 | `vm-crud` + `useCrud` | 绑定 EPS `service.xxx`，统一刷新/选中 |
| 表 | `vm-table` + `useTable` | 列、插槽 `#cell-字段` |
| 表单弹窗 | `vm-upsert` + `useUpsert` | 新增/编辑；字段默认 `span: 12` |
| 筛选 | `vm-search` + `useSearch` | 按后端 `pageQueryOp` / EPS 自动生成 |
| 工具栏 | `vm-toolbar` / `vm-refresh-btn` | 新增删除、搜索重置、列表/回收站 |
| 分页 | `vm-pagination` | 与 crud 联动 |
| 字典 | `useDict` / `useDictStore` | 与后端 `dict: 'key'` 对应 |
| 权限 | `v-perm` / 菜单 | 按钮级；无权限入口不出现 |
| 上传 | `vm-upload` / `useUpload` | 公开前缀 `app/public/**`；插件 `app/plugin/**` |
| EPS / 请求 | `useVome()` → `service` | `createEps` 启动时拉取 |
| 确认框 | `vmConfirm` | 禁止自绘 confirm |
| 布局件 | `vm-aside` / `vm-dept-tree` / `vm-split-layout`… | 自动引入 `vm-*` |

## 命令

```bash
cd admin
bun install
bun run dev       # 需先启动 service；常见端口 9000
```

代理：`src/config/proxy.ts`（`/dev/`、`/prod/`、`/vome/` → service）。

## 路径别名

| 别名 | 指向 |
|------|------|
| `@/` | `admin/src/` |
| `/@` | `vome-core` **admin**（CRUD、stores、组件） |
| `@config` / `@typings` | 宿主 config / typings |

业务页优先 **自动引入** 的 `vm-*`，少手写 import。

## 业务页位置

```
admin/src/modules/<module>/views/...
```

与 service 模块名、菜单 `viewPath` 一致。

## 标准 CRUD 页

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
defineOptions({ name: 'shop-goods' })

const { service } = useVome()
const { dict } = useDict()

useUpsert({
  items: [
    { prop: 'name', label: '名称', required: true, span: 12 },
    { prop: 'status', label: '状态', component: { name: 'vm-select', options: dict('status') } },
  ],
})
useTable({
  columns: [
    { prop: 'name', label: '名称' },
    { prop: 'status', label: '状态' },
  ],
})

const Crud = useCrud({ service: service.shop.goods })
</script>
```

### Hooks / 组件怎么用

| API | 用法 |
|-----|------|
| `useVome()` | `{ service, … }`；调 `service.module.resource.page(data)` |
| `useCrud({ service })` | 绑定 CRUD；可 `onRefresh` 自定义拉数 |
| `useTable({ columns })` | 列定义；`#cell-xxx` 自定义单元格 |
| `useUpsert({ items })` | 弹窗字段；`span`、`component`、`required` |
| `useSearch({ items? })` | 可选手写筛选项，与自动项按 prop 合并 |
| `vm-search` | **标准页必须挂**；缺了则无自动筛选与工具栏搜索/重置 |
| `vm-toolbar` | 默认新增/删除 + 搜索重置 + 列表/回收站；`:trash="false"`；`:show-add="false"` 等 |
| `vmConfirm` | 删除/危险操作确认 |

### 弹窗三态

| 类型 | 用法 |
|------|------|
| 表单 | `vm-upsert` + `useUpsert` |
| 只读大内容 | `vm-upsert`：`:confirm="false"`；`layout="fill"` + `:height="800"`；槽位自定义底栏 |
| 确认/警告 | `vmConfirm` |

### 工具栏变体

- 自定义左侧按钮：放 `vm-toolbar` 默认槽；必要时关掉默认 add/delete
- 无回收站（如日志）：`:trash="false"`

## 样式分层（业务可改范围）

| 层 | 路径 | 业务 |
|----|------|------|
| 主题色 | `src/styles/theme.css` | ✅ 换色 |
| 结构 | `@vome-core/admin/styles/base.css` | ❌ 不为换肤改 |
| 主题切换 | `src/themes/*`、`stores/theme.ts` | ✅ |
| 业务页 | `style lang="scss" scoped` | ✅ |

- 主色 `#4E5DFF`；`main.ts`：先 `theme.css` 再 `base.css`
- 布局用 SCSS + CSS 变量；不要用 Tailwind 铺满业务页（`components/ui/**` 除外）
- 顺序：`template` → `script setup` → `style lang="scss" scoped`

## 字典 / 权限 / 上传 / 微应用

| 场景 | 用法 |
|------|------|
| 字典管理 | `modules/base/views/dict` |
| 筛选项字典 | 后端 `fieldEq: [{ column: 'status', dict: 'status' }]` → 前端自动下拉 |
| 按钮权限 | `v-perm="'shop:goods:add'"` 等 |
| 上传公开 | `vm-upload` 默认 `app/public/**` |
| 上传插件包 | 显式 `prefixPath: 'app/plugin'` |
| 微应用 | 菜单 `appKey` → wujie → `/vome/apps/{key}/` |

## 请求按钮防连点（强制）

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

## 注意

1. 缺 `vm-search` 或 `:search="false"` → 没有重置与自动筛选。
2. 筛选项以后端 `pageQueryOp` 为准；`none: true` 不出控件。
3. 不要改 core `base.css` 换肤；颜色只动 `theme.css`。
4. service 未启动 / 代理错 → EPS、登录、CRUD 全挂。
5. 升级 `vome-core` 后 `bun install`；按组件文档调整用法。
6. 提交类按钮一律防连点。

在线细文档：`/admin/crud/`、`/admin/hooks/`、`/admin/components/`。
