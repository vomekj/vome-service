import {
  index,
  integer,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'
import { columnComments, entitySchemas } from '@core/server'

/** Better Auth 验证码 / 临时凭证表 */
export const userVerification = columnComments(
  pgTable(
    'user_verification',
    {
      id: varchar('id').primaryKey(),
      identifier: varchar('identifier').notNull(),
      value: varchar('value').notNull(),
      expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
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
    (table) => [index('user_verification_identifier_idx').on(table.identifier)],
  ),
  {
    id: 'ID',
    identifier: '标识',
    value: '值',
    expiresAt: '过期时间',
    createTime: '创建时间',
    updateTime: '更新时间',
    tenantId: '租户',
    deleteTime: '删除时间',
  },
)

export const UserVerificationSchema = entitySchemas(userVerification)
