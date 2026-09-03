import {
  index,
  integer,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
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
      tableName: varchar('tableName').notNull(),
      fieldName: varchar('fieldName').notNull(),
      pkField: varchar('pkField').notNull().default('id'),
      /** direct | ref */
      mode: varchar('mode').notNull().default('direct'),
      sourceTable: varchar('sourceTable'),
      sourcePkField: varchar('sourcePkField').default('id'),
      sourceField: varchar('sourceField'),
      joinField: varchar('joinField'),
      sourceJoinField: varchar('sourceJoinField'),
      status: integer('status').notNull().default(1),
      remark: varchar('remark'),
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

export const I18nDataFieldSchema = entitySchemas(i18nDataField)
