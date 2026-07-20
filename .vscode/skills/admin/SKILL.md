---
name: admin-usage
description: >-
  Admin 业务开发：vome-core/admin CRUD 组件与 hooks、筛选、字典、主题、权限、防连点。
  Use when editing admin/ Vue pages, CRUD views, or admin UI.
---

# Admin 用法（业务开发）

> **范围**：`admin/` 后台业务页。CRUD / 布局组件来自 npm **`vome-core/admin`**（别名 `/@`）。

## IDE

与 Service 相同：把含 `vm-crud` 等 snippet 的 `.vscode` **移到项目根**；Skills 建议 `.cursor/skills/` + 根 `AGENTS.md`（见 [AGENTS.md](../AGENTS.md)）。

## Core（`vome-core/admin`）完整 API

别名 `/@` → admin 包。CRUD 组件靠 **自动引入**（`vm-*`），不必从桶里 import SFC。

### 入口与 EPS / 请求

| API | 用法 |
|-----|------|
| `useVome()` | `{ service, route, router, …useBrowser() }`；页面里调接口首选 |
| `createEps(opts?)` | 拉 EPS；`opts.force` 强制刷新 |
| `service` / `serviceOf` / `resolveService` / `getService` 同类 | 类型化 API 树；`setServicePerms` 绑定权限 |
| `loadEps` / `loadAllEps` / `getEps` / `findEpsEntity` | EPS 数据读写 |
| `api` / `request` / `apiUrl` | 底层 HTTP（多数业务走 `service.*`） |
| `BaseService`（admin/service） | EPS 叶子上的方法封装 |

### CRUD Hooks 与配置

| API | 用法 |
|-----|------|
| `useCrud(options?, ready?)` | 页面根绑定 `service`；无参则 inject |
| `useCore()` | `{ crud: useCrud() }` |
| `useTable` / `useUpsert` / `useSearch` | 列 / 表单 / 筛选项 |
| `CRUD_KEY` | provide/inject key |
| `setCrudConfig` / `getCrudConfig` / `getCrudStyle` | 全局 CRUD 默认（样式、插件、文案） |
| `Plugins` / `toTree` / `setFocus` / `setRules` / `setAuto` / `buildAutoSearchItems` | 表单/筛选插件与自动筛选项构建 |
| `resolveCrudComponent` / `registerCrudComponent` | 自定义字段组件名注册 |
| `vmConfirm` | 确认框 |

### 视图 / 路由 / 权限 / 浏览器

| API | 用法 |
|-----|------|
| `registerViews` / `resolveView` / `listViews` / `listViewsTree` / `viewPathToName` | 业务页注册与按 `viewPath` 解析 |
| `VIEWS_RESCAN_EVENT` | 视图重扫事件名 |
| `router` / `resetMenuRoutesFlag` | 框架路由与菜单路由标记重置 |
| `vPerm` | 权限指令（模板 `v-perm`） |
| `useBrowser` / `getBrowser` | 浏览器/屏幕信息 |

### Stores（框架壳）

| API | 用法 |
|-----|------|
| `useAppStore` | 侧栏折叠、移动端抽屉、`reloadView` 等（**不含**主题） |
| `useUserStore` | 后台登录用户（admin 侧） |
| `useTagsStore` | 多页签 |

主题色在宿主 `theme.css` / `stores/theme.ts`，不要改 core `base.css`。

### 工具与其它

| API | 用法 |
|-----|------|
| `deepTree` / `flattenTree` | 树数据转换 |
| `cn` | className 合并 |
| `config` | 宿主配置桥 |
| `pluginDev` | 插件开发脚手架配置 |

样式入口：`@vome-core/admin/styles/base.css`（结构，禁止换肤乱改）。

---

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
| `useCrud({ service })` | 绑定 CRUD；可 `onRefresh` / `onDelete`；`permission` 覆盖；第二参为就绪回调 |
| `useCrud()` | 无参：在 `vm-crud` 子树内 inject 上下文 |
| `useCore()` | `{ crud: useCrud() }` |
| `useTable({ columns })` | 列定义；`#cell-xxx` 自定义单元格 |
| `useUpsert({ items })` | 弹窗字段；`span`、`component`、`required` |
| `useSearch({ items? })` | 可选手写筛选项，与自动项按 prop 合并 |
| `vm-search` | **标准页必须挂**；缺了则无自动筛选与工具栏搜索/重置 |
| `vm-toolbar` | 默认新增/删除 + 搜索重置 + 列表/回收站；`:trash="false"`；`:show-add="false"` 等 |
| `vmConfirm` | 删除/危险操作确认 |

```ts
const Crud = useCrud(
  {
    service: service.shop.goods,
    permission: { add: true },
    onRefresh(params, { next }) {
      return next(params)
    },
  },
  (app) => {
    app.refresh()
  },
)
// 模板 ref="Crud"；Crud.value?.setParams / refresh / rowEdit / selection
```

### CRUD 组件清单（自动引入 `vm-*`）

| 分类 | 组件 |
|------|------|
| 骨架 | `vm-crud`、`vm-row`、`vm-flex` |
| 数据区 | `vm-search`、`vm-search-key`、`vm-adv-search`、`vm-table`、`vm-pagination` |
| 工具栏 | `vm-toolbar`、`vm-tabs`、`vm-add-btn`、`vm-multi-delete-btn`、`vm-export-btn`、`vm-refresh-btn` |
| 表单弹窗 | `vm-upsert`、`vm-form` |
| 字段控件 | `vm-select`、`vm-multi-select`、`vm-switch`、`vm-radio`、`vm-tree-select`、`vm-date-picker`、`vm-date-range`、`vm-date-text`、`vm-number-range`、`vm-dict-tag`、`vm-status-tag`、`vm-tag-list`、`vm-avatar`、`vm-richtext`、`vm-user-select`、`vm-upload`、`vm-upload-item`、`vm-preview-viewer`、`vm-json-code` / `vm-json-editor` |
| 表格辅助 | `vm-column-custom`、`vm-context-menu`、`vm-ellipsis-text`、`vm-copy-btn`、`vm-text-link` |
| 布局件 | `vm-aside`、`vm-dept-tree`、`vm-split-layout`、`vm-role-picker`、`vm-check-tree`、`vm-icon-picker`、`vm-markdown`（`v-model` / `modelValue`）、`vm-empty`… |

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

## 启动与视图注册

`main.ts` 典型顺序：

1. 引入 `theme.css` → `/@/styles/base.css`
2. `import './views-registry'`（注册业务页）
3. `await createEps()` 后挂路由 / 登录态
4. `createApp` + Pinia + `router`（`/@/router`）

`views-registry.ts`：

```ts
import { registerViews } from '/@'
const viewModules = import.meta.glob('./modules/*/views/**/*.vue')
registerViews(viewModules)
```

| 菜单字段 | 含义 |
|----------|------|
| `viewPath` | 相对 `src/`，**不含 `.vue`**，如 `modules/shop/views/goods/index` |
| `router` | 路由路径，如 `/shop/goods` |
| `perms` | 权限码，与后端一致 |
| `type` | 0 目录 / 1 菜单 / 2 按钮 |
| `appKey` | 微应用：wujie 加载 `/vome/apps/{appKey}/` |

新业务页：加 `modules/.../views/.../index.vue` + 后台配菜单即可，**不必**手改路由表。

## 表单 / 列字段约定（useUpsert · useTable · useSearch）

### 通用字段项

| 属性 | 说明 |
|------|------|
| `prop` | 字段名（与后端列 / 请求体一致） |
| `label` | 文案 |
| `span` | 24 栅格；业务表单默认常用 `12`（半宽） |
| `required` | 必填（走 `Plugins.Form.setRules`） |
| `rules` | 额外校验规则 |
| `dict` | 字典 key，如 `'status'` → `useDict().dict.get(...)` |
| `options` | 手写 `{ label, value }[]`（可代替 dict） |
| `type` | 内置控件类型，见下 |
| `component` | `{ name: 'vm-xxx', props: { … } }` 自定义注册表组件 |
| `hidden` / `disabled` | 隐藏 / 禁用 |

### 内置 `type`

| type | 用途 |
|------|------|
| `input`（默认） | 单行文本 |
| `textarea` | 多行 |
| `select` | 下拉（可配 dict/options；多选用 `vm-multi-select`） |
| `switch` / `radio` | 开关 / 单选 |
| `date` / `daterange` / `number-range` | 搜索常用；区间可配 `range: { min, max, rangeType }` |

```ts
// 字典下拉
{ prop: 'status', label: '状态', type: 'select', dict: 'status', span: 12 }

// 自定义组件
{
  prop: 'departmentId',
  label: '部门',
  span: 12,
  component: {
    name: 'vm-tree-select',
    props: { options: deptOptions, placeholder: '请选择' },
  },
}

// 日期区间搜索 → 请求带 startTime/endTime
{
  prop: 'createTime',
  type: 'daterange',
  range: { min: 'startTime', max: 'endTime', rangeType: 'day' },
}
```

### 表格列（useTable）

| 属性 | 说明 |
|------|------|
| `prop` / `label` | 列字段与标题 |
| `minWidth` / `width` | 宽度 |
| `sortable` | 排序（若后端支持） |
| 插槽 | 模板 `#cell-{prop}` 自定义单元格 |
| 展示组件 | 列内可用 `vm-dict-tag`、`vm-date-text`、`vm-status-tag`、`vm-avatar`、`vm-preview-viewer` 等 |

### 上传（vm-upload）

```ts
{
  prop: 'avatar',
  label: '头像',
  component: {
    name: 'vm-upload',
    props: { type: 'image', limit: 1, limitSize: 100 },
  },
}
```

| Prop | 默认 | 说明 |
|------|------|------|
| `type` | `image` | `image` / `file`（布局） |
| `accept` | `''` | 文件类型；空=不限制 |
| `limit` | `9` | 最多个数 |
| `limitSize` | `100` | MB |
| `drag` | `false` | 拖拽区 |
| `prefixPath` | `app/public` | 对象存储 Key 前缀 |

| 用途 | prefixPath | 说明 |
|------|------------|------|
| 公开资源 | `app/public` 或 `app/public/avatar` 等 | 桶策略 Allow `app/public/*` |
| 插件包 | **必须** `app/plugin` | 私有 + 一次性代传；勿当公开前缀 |

`modelValue`：单文件 `string`，多文件 `string[]`。禁止再用 `app/base`、`app/user`、`app/avatar` 等散落公开前缀。

## 字典 / 权限 / 微应用

| 场景 | 用法 |
|------|------|
| 字典管理 | `modules/base/views/dict` |
| 筛选项字典 | 后端 `fieldEq: [{ column: 'status', dict: 'status' }]` → 前端自动下拉 |
| 按钮权限 | `v-perm="'shop:goods:add'"` |
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
5. 新页面必须能被 `views-registry` 的 glob 扫到，且菜单 `viewPath` 正确。
6. 升级 `vome-core` 后 `bun install`，按本 Skill 调整用法。
7. 提交类按钮一律防连点。
