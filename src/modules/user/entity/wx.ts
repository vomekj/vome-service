import { index, integer, pgTable, varchar } from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/** 微信用户（openid / unionid 绑定） */
export const userWx = columnComments(
  pgTable(
    'user_wx',
    {
      ...baseColumns,
      unionid: varchar('unionid'),
      openid: varchar('openid').notNull(),
      avatarUrl: varchar('avatarUrl'),
      nickName: varchar('nickName'),
      /** 0 未知 / 1 男 / 2 女 */
      gender: integer('gender').notNull().default(0),
      language: varchar('language'),
      city: varchar('city'),
      province: varchar('province'),
      country: varchar('country'),
      /** 0 小程序 / 1 公众号 / 2 H5 / 3 APP */
      type: integer('type').notNull().default(0),
    },
    (table) => [
      index('user_wx_openid_idx').on(table.openid),
      index('user_wx_unionid_idx').on(table.unionid),
    ],
  ),
  {
    unionid: '微信unionid',
    openid: '微信openid',
    avatarUrl: '头像',
    nickName: '昵称',
    gender: '性别',
    language: '语言',
    city: '城市',
    province: '省份',
    country: '国家',
    type: '类型',
  },
)

export const UserWxSchema = entitySchemas(userWx)
