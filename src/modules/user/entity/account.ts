import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { columnComments, entitySchemas } from '/#/server'
import { userInfo } from './info'

/** Better Auth 第三方账号关联表 */
export const userAccount = columnComments(
  pgTable(
    'user_account',
    {
      id: text('id').primaryKey(),
      userId: text('userId')
        .notNull()
        .references(() => userInfo.id, { onDelete: 'cascade' }),
      accountId: text('accountId').notNull(),
      providerId: text('providerId').notNull(),
      accessToken: text('accessToken'),
      refreshToken: text('refreshToken'),
      accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
      refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
      scope: text('scope'),
      idToken: text('idToken'),
      password: text('password'),
      createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updatedAt', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
      tenantId: integer('tenantId'),
      deletedAt: timestamp('deletedAt', { withTimezone: true }),
    },
    (table) => [
      index('user_account_user_id_idx').on(table.userId),
      index('user_account_provider_idx').on(table.providerId, table.accountId),
    ],
  ),
  {
    id: 'ID',
    userId: '用户',
    accountId: '账号ID',
    providerId: '提供商',
    accessToken: 'AccessToken',
    refreshToken: 'RefreshToken',
    accessTokenExpiresAt: 'Access过期时间',
    refreshTokenExpiresAt: 'Refresh过期时间',
    scope: 'Scope',
    idToken: 'IdToken',
    password: '密码',
    createdAt: '创建时间',
    updatedAt: '更新时间',
    tenantId: '租户',
    deletedAt: '删除时间',
  },
)

export type UserAccount = InferSelectModel<typeof userAccount>
export type NewUserAccount = InferInsertModel<typeof userAccount>
export const UserAccountSchema = entitySchemas(userAccount)
