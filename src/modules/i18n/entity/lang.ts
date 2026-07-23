import {
  index,
  integer,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 语种（如简体中文 / 英语）；code 为技术键，name 为显示名，flag 为国旗 emoji */
export const i18nLang = columnComments(
  pgTable(
    'i18n_lang',
    {
      ...baseColumns,
      code: varchar('code', { length: 32 }).notNull(),
      name: varchar('name', { length: 100 }).notNull(),
      /** 国旗 emoji，顶栏切换展示 */
      flag: varchar('flag', { length: 16 }).notNull().default('🏳️'),
      status: integer('status').notNull().default(1),
      orderNum: integer('orderNum').notNull().default(0),
    },
    (table) => [
      uniqueIndex('i18n_lang_tenant_code_uidx').on(table.tenantId, table.code),
      index('i18n_lang_tenant_id_idx').on(table.tenantId),
      index('i18n_lang_status_idx').on(table.status),
    ],
  ),
  {
    code: '语种编码',
    name: '语言名称',
    flag: '国旗',
    status: '状态',
    orderNum: '排序',
  },
)

export type I18nLang = InferSelectModel<typeof i18nLang>
export type NewI18nLang = InferInsertModel<typeof i18nLang>
export const I18nLangSchema = entitySchemas(i18nLang)
