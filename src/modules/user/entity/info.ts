import { boolean, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { columnComments, entitySchemas } from '/#/server'

/** Better Auth 用户表（含租户 / 手机号 / 微信绑定字段） */
export const userInfo = columnComments(
  pgTable(
    'user_info',
    {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
      email: text('email').notNull().unique(),
      emailVerified: boolean('emailVerified').notNull().default(false),
      image: text('image'),
      /** 所属租户；按注册域名自动写入 */
      tenantId: integer('tenantId'),
      phone: varchar('phone', { length: 20 }),
      /** 微信 unionid（无则用 openid） */
      unionid: varchar('unionid', { length: 100 }),
      /** 手机号密码登录（md5） */
      password: varchar('password', { length: 64 }),
      /** 1 正常 / 2 已注销 */
      status: integer('status').notNull().default(1),
      createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updatedAt', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
      /** 软删时间；null = 未删除 */
      deletedAt: timestamp('deletedAt', { withTimezone: true }),
    },
    (table) => [
      index('user_info_email_idx').on(table.email),
      index('user_info_tenant_id_idx').on(table.tenantId),
      index('user_info_phone_idx').on(table.phone),
      index('user_info_unionid_idx').on(table.unionid),
    ],
  ),
  {
    id: 'ID',
    name: '名称',
    email: '邮箱',
    emailVerified: '邮箱已验证',
    image: '头像',
    tenantId: '租户',
    phone: '手机号',
    unionid: '微信unionid',
    password: '密码',
    status: '状态',
    createdAt: '创建时间',
    updatedAt: '更新时间',
    deletedAt: '删除时间',
  },
)

export type UserInfo = InferSelectModel<typeof userInfo>
export type NewUserInfo = InferInsertModel<typeof userInfo>
export const UserInfoSchema = entitySchemas(userInfo)
