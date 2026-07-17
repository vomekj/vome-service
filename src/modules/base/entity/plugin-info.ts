import { index, integer, jsonb, pgTable, text, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 插件信息 */
export const basePluginInfo = columnComments(
  pgTable(
    'base_plugin_info',
    {
      ...baseColumns,
      name: varchar('name', { length: 255 }).notNull(),
      description: varchar('description', { length: 500 }),
      keyName: varchar('keyName', { length: 100 }).notNull(),
      hook: varchar('hook', { length: 100 }),
      readme: text('readme'),
      version: varchar('version', { length: 50 }).notNull(),
      logo: text('logo'),
      author: varchar('author', { length: 100 }),
      /** 0 禁用 / 1 启用 */
      status: integer('status').notNull().default(1),
      content: jsonb('content'),
      tsContent: jsonb('tsContent'),
      pluginJson: jsonb('pluginJson'),
      config: jsonb('config'),
    },
    (table) => [index('base_plugin_info_key_name_idx').on(table.keyName)],
  ),
  {
    name: '名称',
    description: '描述',
    keyName: '标识',
    hook: '钩子',
    readme: '说明',
    version: '版本',
    logo: 'Logo',
    author: '作者',
    status: '状态',
    content: '内容',
    tsContent: 'TS内容',
    pluginJson: '插件元数据',
    config: '配置',
  },
)

export type BasePluginInfo = InferSelectModel<typeof basePluginInfo>
export type NewBasePluginInfo = InferInsertModel<typeof basePluginInfo>
export const BasePluginInfoSchema = entitySchemas(basePluginInfo)
