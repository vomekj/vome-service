import { pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/** 字典类型（字典名） */
export const baseDictType = columnComments(
  pgTable(
    'base_dict_type',
    {
      ...baseColumns,
      name: varchar('name').notNull(),
      key: varchar('key').notNull(),
    },
    (table) => [uniqueIndex('base_dict_type_key_idx').on(table.key)],
  ),
  {
    name: '名称',
    key: '标识',
  },
)

export const BaseDictTypeSchema = entitySchemas(baseDictType)
