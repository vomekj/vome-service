import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { columnComments, entitySchemas } from '@core/server'

/** Better Auth 用户表（含租户 / 手机号 / 微信绑定字段） */
export const userInfo = columnComments(
  pgTable(
    'user_info',
    {
      id: varchar('id').primaryKey(),
      /** 业务侧数字 ID（自增，区别于 Better Auth 的 id） */
      userId: serial('userId').notNull(),
      name: varchar('name').notNull(),
      /** 可空：仅邮箱注册/绑定时写入，禁止占位自动生成 */
      email: varchar('email').unique(),
      emailVerified: boolean('emailVerified').notNull().default(false),
      image: varchar('image'),
      /** 所属租户；按注册域名自动写入 */
      tenantId: integer('tenantId'),
      phone: varchar('phone'),
      /** 手机号是否已通过短信验证码验证（只验一次） */
      phoneVerified: boolean('phoneVerified').notNull().default(false),
      /** 微信 unionid（无则用 openid） */
      unionid: varchar('unionid'),
      /** 手机号密码登录（md5） */
      password: varchar('password'),
      /** 备注 */
      remark: varchar('remark'),
      /** 1 正常 / 2 已注销 / 3 禁用 */
      status: integer('status').notNull().default(1),
      createTime: timestamp('createTime', { withTimezone: true }).notNull().defaultNow(),
      updateTime: timestamp('updateTime', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
      /** 软删时间；null = 未删除 */
      deletedTime: timestamp('deletedTime', { withTimezone: true }),
    },
    (table) => [
      uniqueIndex('user_info_user_id_uidx').on(table.userId),
      index('user_info_email_idx').on(table.email),
      index('user_info_tenant_id_idx').on(table.tenantId),
      index('user_info_phone_idx').on(table.phone),
      index('user_info_unionid_idx').on(table.unionid),
    ],
  ),
  {
    id: 'ID',
    userId: '用户ID',
    name: '名称',
    email: '邮箱',
    emailVerified: '邮箱已验证',
    image: '头像',
    tenantId: '租户',
    phone: '手机号',
    phoneVerified: '手机已验证',
    unionid: '微信unionid',
    password: '密码',
    remark: '备注',
    status: '状态',
    createTime: '创建时间',
    updateTime: '更新时间',
    deletedTime: '删除时间',
  },
)

export const UserInfoSchema = entitySchemas(userInfo)
