import {
  boolean,
  index,
  integer,
  pgTable,
  varchar,
} from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

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
      name: varchar('name', { length: 100 }).notNull(),
      router: varchar('router', { length: 255 }),
      perms: varchar('perms', { length: 255 }),
      type: integer('type').notNull().default(0),
      icon: varchar('icon', { length: 100 }),
      orderNum: integer('orderNum').notNull().default(0),
      viewPath: varchar('viewPath', { length: 255 }),
      /** Module Federation：远程名（如 demo） */
      remoteName: varchar('remoteName', { length: 100 }),
      /** 远程 remoteEntry.js URL */
      remoteEntry: varchar('remoteEntry', { length: 500 }),
      /** 暴露模块（如 ./DemoPage） */
      remoteModule: varchar('remoteModule', { length: 255 }),
      /** 微应用 key（有值则 wujie 加载 /vome/apps/{appKey}/） */
      appKey: varchar('appKey', { length: 100 }),
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

export type BaseMenu = InferSelectModel<typeof baseMenu>
export type NewBaseMenu = InferInsertModel<typeof baseMenu>
export const BaseMenuSchema = entitySchemas(baseMenu)
