import { integer, jsonb, pgTable, index, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 字典条目（类型下多值；parentId 组树） */
export const baseDictInfo = columnComments(
  pgTable(
    'base_dict_info',
    {
      ...baseColumns,
      typeId: integer('typeId').notNull(),
      /** 展示名（下拉 label）；dict.get(类型key) 取的是整棵树，不是按 name 查） */
      name: varchar('name', { length: 255 }).notNull(),
      /** 存值：标量 / 对象 / URL；空则运行时回落为 id */
      value: jsonb('value'),
      orderNum: integer('orderNum').notNull().default(0),
      remark: varchar('remark', { length: 500 }),
      parentId: integer('parentId'),
    },
    (table) => [
      index('base_dict_info_type_id_idx').on(table.typeId),
      index('base_dict_info_parent_id_idx').on(table.parentId),
    ],
  ),
  {
    typeId: '字典类型',
    name: '名称',
    value: '值',
    orderNum: '排序',
    remark: '备注',
    parentId: '上级',
  },
)

export type BaseDictInfo = InferSelectModel<typeof baseDictInfo>
export type NewBaseDictInfo = InferInsertModel<typeof baseDictInfo>
export const BaseDictInfoSchema = entitySchemas(baseDictInfo)
