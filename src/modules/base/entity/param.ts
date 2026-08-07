import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/**
 * 系统参数
 * type：0 字符串 / 1 富文本 / 2 文件 / 3 JSON
 * openToApp：1 才可在 App 端调用；JSON 另用 appOpenPaths 控制键级开放
 */
export const baseParam = columnComments(
  pgTable(
    'base_param',
    {
      ...baseColumns,
      name: varchar('name', { length: 100 }).notNull(),
      keyName: varchar('keyName', { length: 100 }).notNull(),
      /** 0 字符串 / 1 富文本 / 2 文件 / 3 JSON */
      type: integer('type').notNull().default(0),
      data: text('data'),
      /** 0 不对 App 开放 / 1 开放 */
      openToApp: integer('openToApp').notNull().default(0),
      /** JSON 键开放路径，如 ["info","info.name"] */
      appOpenPaths: text('appOpenPaths'),
      remark: varchar('remark', { length: 500 }),
    },
    (table) => [
      uniqueIndex('base_param_key_name_idx').on(table.keyName),
      index('base_param_type_idx').on(table.type),
      index('base_param_open_to_app_idx').on(table.openToApp),
      index('base_param_tenant_id_idx').on(table.tenantId),
    ],
  ),
  {
    name: '名称',
    keyName: 'keyName',
    type: '类型',
    data: '数据',
    openToApp: '对App开放',
    appOpenPaths: 'JSON开放路径',
    remark: '备注',
  },
)

export type BaseParam = InferSelectModel<typeof baseParam>
export type NewBaseParam = InferInsertModel<typeof baseParam>
export const BaseParamSchema = entitySchemas(baseParam)
