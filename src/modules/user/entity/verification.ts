import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { columnComments, entitySchemas } from '/#/server'

/** Better Auth 验证码 / 临时凭证表 */
export const userVerification = columnComments(
  pgTable(
    'user_verification',
    {
      id: text('id').primaryKey(),
      identifier: text('identifier').notNull(),
      value: text('value').notNull(),
      expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
      createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updatedAt', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
      tenantId: integer('tenantId'),
      deletedAt: timestamp('deletedAt', { withTimezone: true }),
    },
    (table) => [index('user_verification_identifier_idx').on(table.identifier)],
  ),
  {
    id: 'ID',
    identifier: '标识',
    value: '值',
    expiresAt: '过期时间',
    createdAt: '创建时间',
    updatedAt: '更新时间',
    tenantId: '租户',
    deletedAt: '删除时间',
  },
)

export type UserVerification = InferSelectModel<typeof userVerification>
export type NewUserVerification = InferInsertModel<typeof userVerification>
export const UserVerificationSchema = entitySchemas(userVerification)
