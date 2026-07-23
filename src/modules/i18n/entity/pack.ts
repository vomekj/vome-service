import {
  index,
  integer,
  jsonb,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/**
 * 语言包（宿主 / 插件）
 * scopeType: host | plugin；host 的 scopeKey 为 admin | web | uniapp
 */
export const i18nPack = columnComments(
  pgTable(
    'i18n_pack',
    {
      ...baseColumns,
      langCode: varchar('langCode', { length: 32 }).notNull(),
      /** host | plugin */
      scopeType: varchar('scopeType', { length: 16 }).notNull().default('host'),
      /** host → admin|web|uniapp；plugin → 插件名称（同步时写入） */
      scopeKey: varchar('scopeKey', { length: 100 }).notNull().default('admin'),
      packJson: jsonb('packJson')
        .$type<Record<string, unknown>>()
        .notNull()
        .default({}),
      version: integer('version').notNull().default(1),
      /** 源文案 hash，便于增量判断 */
      sourceHash: varchar('sourceHash', { length: 64 }),
      remark: varchar('remark', { length: 500 }),
    },
    (table) => [
      uniqueIndex('i18n_pack_tenant_scope_lang_uidx').on(
        table.tenantId,
        table.scopeType,
        table.scopeKey,
        table.langCode,
      ),
      index('i18n_pack_tenant_id_idx').on(table.tenantId),
      index('i18n_pack_lang_code_idx').on(table.langCode),
    ],
  ),
  {
    langCode: '语种编码',
    scopeType: '来源类型',
    scopeKey: '标识',
    packJson: '语言包JSON',
    version: '版本',
    sourceHash: '源文案哈希',
    remark: '备注',
  },
)

export type I18nPack = InferSelectModel<typeof i18nPack>
export type NewI18nPack = InferInsertModel<typeof i18nPack>
export const I18nPackSchema = entitySchemas(i18nPack)
