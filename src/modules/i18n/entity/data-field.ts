import {
  index,
  integer,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/**
 * 业务数据翻译字段声明
 * mode=direct：按本表主键替换；mode=ref：冗余列走源表 pack（如 log.skinName ← game_skin）
 */
export const i18nDataField = columnComments(
  pgTable(
    'i18n_data_field',
    {
      ...baseColumns,
      tableName: varchar('tableName', { length: 100 }).notNull(),
      fieldName: varchar('fieldName', { length: 100 }).notNull(),
      pkField: varchar('pkField', { length: 64 }).notNull().default('id'),
      /** direct | ref */
      mode: varchar('mode', { length: 16 }).notNull().default('direct'),
      sourceTable: varchar('sourceTable', { length: 100 }),
      sourcePkField: varchar('sourcePkField', { length: 64 }).default('id'),
      sourceField: varchar('sourceField', { length: 100 }),
      joinField: varchar('joinField', { length: 100 }),
      sourceJoinField: varchar('sourceJoinField', { length: 100 }),
      status: integer('status').notNull().default(1),
      remark: varchar('remark', { length: 500 }),
    },
    (table) => [
      uniqueIndex('i18n_data_field_tenant_table_field_uidx').on(
        table.tenantId,
        table.tableName,
        table.fieldName,
      ),
      index('i18n_data_field_tenant_id_idx').on(table.tenantId),
      index('i18n_data_field_table_name_idx').on(table.tableName),
    ],
  ),
  {
    tableName: '业务表',
    fieldName: '字段名',
    pkField: '主键列',
    mode: '映射模式',
    sourceTable: '源表',
    sourcePkField: '源表主键',
    sourceField: '源表字段',
    joinField: '关联列',
    sourceJoinField: '源表关联列',
    status: '状态',
    remark: '备注',
  },
)

export type I18nDataField = InferSelectModel<typeof i18nDataField>
export type NewI18nDataField = InferInsertModel<typeof i18nDataField>
export const I18nDataFieldSchema = entitySchemas(i18nDataField)
