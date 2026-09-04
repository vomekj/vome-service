import { integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { columnComments, entitySchemas } from '@core/server'

/** Better Auth JWT 插件 JWKS 表 */
export const userJwks = columnComments(
  pgTable('user_jwks', {
    id: varchar('id').primaryKey(),
    publicKey: text('publicKey').notNull(),
    privateKey: text('privateKey').notNull(),
    createTime: timestamp('createTime', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updateTime: timestamp('updateTime', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    expiresAt: timestamp('expiresAt', { withTimezone: true }),
    alg: varchar('alg'),
    crv: varchar('crv'),
    tenantId: integer('tenantId'),
    deleteTime: timestamp('deleteTime', { withTimezone: true }),
  }),
  {
    id: 'ID',
    publicKey: '公钥',
    privateKey: '私钥',
    createTime: '创建时间',
    updateTime: '更新时间',
    expiresAt: '过期时间',
    alg: '算法',
    crv: '曲线',
    tenantId: '租户',
    deleteTime: '删除时间',
  },
)

export const UserJwksSchema = entitySchemas(userJwks)
