import { pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 字典类型（字典名） */
export const baseDictType = columnComments(
  pgTable(
    'base_dict_type',
    {
      ...baseColumns,
      name: varchar('name', { length: 255 }).notNull(),
      key: varchar('key', { length: 100 }).notNull(),
    },
    (table) => [uniqueIndex('base_dict_type_key_idx').on(table.key)],
  ),
  {
    name: '名称',
    key: '标识',
  },
)

export type BaseDictType = InferSelectModel<typeof baseDictType>
export type NewBaseDictType = InferInsertModel<typeof baseDictType>
export const BaseDictTypeSchema = entitySchemas(baseDictType)
