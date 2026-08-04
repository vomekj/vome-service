import { index, integer, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

export const projectAiSession = columnComments(
  pgTable(
    'project_ai_session',
    {
      ...baseColumns,
      projectId: integer('projectId').notNull(),
      userId: integer('userId').notNull(),
      clientKey: varchar('clientKey', { length: 64 }).notNull(),
      title: varchar('title', { length: 200 }).notNull().default('新对话'),
      status: integer('status').notNull().default(1),
    },
    (table) => [
      index('project_ai_session_project_user_idx').on(
        table.projectId,
        table.userId,
      ),
      uniqueIndex('project_ai_session_project_client_uidx').on(
        table.projectId,
        table.clientKey,
      ),
    ],
  ),
  {
    projectId: '项目ID',
    userId: '用户ID',
    clientKey: '客户端会话键',
    title: '标题',
    status: '状态',
  },
)

export type ProjectAiSession = InferSelectModel<typeof projectAiSession>
export type NewProjectAiSession = InferInsertModel<typeof projectAiSession>
export const ProjectAiSessionSchema = entitySchemas(projectAiSession)
