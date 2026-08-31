import {
  index,
  integer,
  jsonb,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/** 业务表翻译包：packJson = { [pk]: { fieldName: translated } } */
export const i18nDataPack = columnComments(
  pgTable(
    'i18n_data_pack',
    {
      ...baseColumns,
      tableName: varchar('tableName', { length: 100 }).notNull(),
      langCode: varchar('langCode', { length: 32 }).notNull(),
      packJson: jsonb('packJson')
        .$type<Record<string, Record<string, string>>>()
        .notNull()
        .default({}),
      version: integer('version').notNull().default(1),
      sourceHash: varchar('sourceHash', { length: 64 }),
      remark: varchar('remark', { length: 500 }),
    },
    (table) => [
      uniqueIndex('i18n_data_pack_tenant_table_lang_uidx').on(
        table.tenantId,
        table.tableName,
        table.langCode,
      ),
      index('i18n_data_pack_tenant_id_idx').on(table.tenantId),
      index('i18n_data_pack_table_name_idx').on(table.tableName),
      index('i18n_data_pack_lang_code_idx').on(table.langCode),
    ],
  ),
  {
    tableName: '业务表',
    langCode: '语种',
    packJson: '翻译包',
    version: '版本',
    sourceHash: '源文案哈希',
    remark: '备注',
  },
)

export type I18nDataPack = InferSelectModel<typeof i18nDataPack>
export type NewI18nDataPack = InferInsertModel<typeof i18nDataPack>
export const I18nDataPackSchema = entitySchemas(i18nDataPack)
