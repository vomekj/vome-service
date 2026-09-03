import {
  boolean,
  index,
  integer,
  pgTable,
  varchar,
} from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/**
 * 后台菜单
 * type: 0 菜单（集）/ 1 页面 / 2 权限
 */
export const baseMenu = columnComments(
  pgTable(
    'base_menu',
    {
      ...baseColumns,
      parentId: integer('parentId'),
      name: varchar('name').notNull(),
      router: varchar('router'),
      perms: varchar('perms'),
      type: integer('type').notNull().default(0),
      icon: varchar('icon'),
      orderNum: integer('orderNum').notNull().default(0),
      viewPath: varchar('viewPath'),
      /** Module Federation：远程名（如 demo） */
      remoteName: varchar('remoteName'),
      /** 远程 remoteEntry.js URL */
      remoteEntry: varchar('remoteEntry'),
      /** 暴露模块（如 ./DemoPage） */
      remoteModule: varchar('remoteModule'),
      /** 微应用 key（有值则 wujie 加载 /vome/apps/{appKey}/） */
      appKey: varchar('appKey'),
      keepAlive: boolean('keepAlive').notNull().default(true),
      isShow: boolean('isShow').notNull().default(true),
    },
    (table) => [index('base_menu_parent_id_idx').on(table.parentId)],
  ),
  {
    parentId: '上级',
    name: '名称',
    router: '路由',
    perms: '权限',
    type: '类型',
    icon: '图标',
    orderNum: '排序',
    viewPath: '视图',
    remoteName: '远程名',
    remoteEntry: '远程入口',
    remoteModule: '远程模块',
    appKey: '微应用',
    keepAlive: '路由缓存',
    isShow: '是否显示',
  },
)

export const BaseMenuSchema = entitySchemas(baseMenu)
