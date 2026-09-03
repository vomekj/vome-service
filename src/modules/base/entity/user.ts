import {
  boolean,
  index,
  integer,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/** 后台用户 */
export const baseUser = columnComments(
  pgTable(
    'base_user',
    {
      ...baseColumns,
      departmentId: integer('departmentId'),
      userId: integer('userId'),
      name: varchar('name'),
      username: varchar('username').notNull(),
      password: varchar('password').notNull(),
      passwordV: integer('passwordV').notNull().default(1),
      nickName: varchar('nickName'),
      headImg: varchar('headImg'),
      phone: varchar('phone'),
      email: varchar('email'),
      remark: varchar('remark'),
      status: integer('status').notNull().default(1),
      socketId: varchar('socketId'),
      isSuper: boolean('isSuper').notNull().default(false),
    },
    (table) => [
      index('base_user_department_id_idx').on(table.departmentId),
      index('base_user_user_id_idx').on(table.userId),
      uniqueIndex('base_user_username_idx').on(table.username),
      index('base_user_phone_idx').on(table.phone),
    ],
  ),
  {
    departmentId: '部门',
    userId: '关联用户',
    name: '姓名',
    username: '用户名',
    password: '密码',
    passwordV: '密码版本',
    nickName: '昵称',
    headImg: '头像',
    phone: '手机号',
    email: '邮箱',
    remark: '备注',
    status: '状态',
    socketId: 'Socket',
    isSuper: '超管',
  },
)

export const BaseUserSchema = entitySchemas(baseUser)
