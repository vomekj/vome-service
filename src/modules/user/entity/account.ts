import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'
import { columnComments, entitySchemas } from '@core/server'
import { userInfo } from './info'

/**
 * Better Auth 第三方账号关联表。
 * userId 指向 user_info.id（BA UUID），≠ 业务自增 user_info.userId。
 */
export const userAccount = columnComments(
  pgTable(
    'user_account',
    {
      id: varchar('id').primaryKey(),
      userId: varchar('userId')
        .notNull()
        .references(() => userInfo.id, { onDelete: 'cascade' }),
      accountId: varchar('accountId').notNull(),
      providerId: varchar('providerId').notNull(),
      accessToken: text('accessToken'),
      refreshToken: text('refreshToken'),
      accessTokenExpiresAt: timestamp('accessTokenExpiresAt', {
        withTimezone: true,
      }),
      refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', {
        withTimezone: true,
      }),
      scope: varchar('scope'),
      idToken: text('idToken'),
      password: varchar('password'),
      createTime: timestamp('createTime', { withTimezone: true })
        .notNull()
        .defaultNow(),
      updateTime: timestamp('updateTime', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
      tenantId: integer('tenantId'),
      deleteTime: timestamp('deleteTime', { withTimezone: true }),
    },
    (table) => [
      index('user_account_user_id_idx').on(table.userId),
      index('user_account_provider_idx').on(table.providerId, table.accountId),
    ],
  ),
  {
    id: 'ID',
    userId: '用户(BA)',
    accountId: '账号ID',
    providerId: '提供商',
    accessToken: 'AccessToken',
    refreshToken: 'RefreshToken',
    accessTokenExpiresAt: 'Access过期时间',
    refreshTokenExpiresAt: 'Refresh过期时间',
    scope: 'Scope',
    idToken: 'IdToken',
    password: '密码',
    createTime: '创建时间',
    updateTime: '更新时间',
    tenantId: '租户',
    deleteTime: '删除时间',
  },
)

export const UserAccountSchema = entitySchemas(userAccount)
