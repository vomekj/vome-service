import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  varchar,
} from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

export const projectAiMessage = columnComments(
  pgTable(
    'project_ai_message',
    {
      ...baseColumns,
      sessionId: integer('sessionId').notNull(),
      projectId: integer('projectId').notNull(),
      userId: integer('userId').notNull(),
      clientKey: varchar('clientKey').notNull(),
      role: varchar('role').notNull(),
      content: text('content').notNull().default(''),
      seq: integer('seq').notNull().default(0),
      embedding: jsonb('embedding').$type<number[]>().notNull().default([]),
      embeddingModel: varchar('embeddingModel'),
      status: integer('status').notNull().default(1),
    },
    (table) => [
      index('project_ai_message_session_seq_idx').on(table.sessionId, table.seq),
      index('project_ai_message_project_idx').on(table.projectId),
    ],
  ),
  {
    sessionId: '会话ID',
    projectId: '项目ID',
    userId: '用户ID',
    clientKey: '客户端消息键',
    role: '角色',
    content: '正文',
    seq: '序号',
    embedding: '向量',
    embeddingModel: '向量模型',
    status: '状态',
  },
)

export const ProjectAiMessageSchema = entitySchemas(projectAiMessage)
