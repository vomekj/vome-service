import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { columnComments, entitySchemas } from '/#/server'

/** Better Auth JWT 插件 JWKS 表 */
export const userJwks = columnComments(
  pgTable('user_jwks', {
    id: text('id').primaryKey(),
    publicKey: text('publicKey').notNull(),
    privateKey: text('privateKey').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    expiresAt: timestamp('expiresAt', { withTimezone: true }),
    alg: text('alg'),
    crv: text('crv'),
    tenantId: integer('tenantId'),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
  }),
  {
    id: 'ID',
    publicKey: '公钥',
    privateKey: '私钥',
    createdAt: '创建时间',
    updatedAt: '更新时间',
    expiresAt: '过期时间',
    alg: '算法',
    crv: '曲线',
    tenantId: '租户',
    deletedAt: '删除时间',
  },
)

export type UserJwks = InferSelectModel<typeof userJwks>
export type NewUserJwks = InferInsertModel<typeof userJwks>
export const UserJwksSchema = entitySchemas(userJwks)
