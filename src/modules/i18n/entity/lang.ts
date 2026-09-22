import {
  index,
  integer,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/** 语种；code 为技术键。name 为该语种自己的文字（切换组件用）。nameZh 为中文名称（语言包展示用）。都不走 dataI18n。flag 为国旗图片 URL */
export const i18nLang = columnComments(
  pgTable(
    'i18n_lang',
    {
      ...baseColumns,
      code: varchar('code').notNull(),
      /** 该语种自己的文字，顶栏等切换组件展示 */
      name: varchar('name').notNull(),
      /** 中文语言名，语言包列表与编辑里展示 */
      nameZh: varchar('nameZh').notNull().default(''),
      /** 国旗图片 URL（顶栏切换展示） */
      flag: varchar('flag').notNull().default(''),
      status: integer('status').notNull().default(1),
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
    nameZh: '中文名称',
    flag: '国旗',
    status: '状态',
  },
)

export const I18nLangSchema = entitySchemas(i18nLang)
