import { index, integer, jsonb, pgTable, text, varchar } from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/** 用户侧项目 Skills（向量 Top-K） */
export const projectSkill = columnComments(
  pgTable(
    'project_skill',
    {
      ...baseColumns,
      projectId: integer('projectId').notNull(),
      userId: integer('userId'),
      name: varchar('name').notNull(),
      content: text('content').notNull().default(''),
      embedding: jsonb('embedding').$type<number[]>().notNull().default([]),
      embeddingModel: varchar('embeddingModel'),
      status: integer('status').notNull().default(1),
    },
    (table) => [index('project_skill_project_idx').on(table.projectId)],
  ),
  {
    projectId: '项目ID',
    userId: '创建者',
    name: '名称',
    content: '正文',
    embedding: '向量',
    embeddingModel: '向量模型',
    status: '状态',
  },
)

export const ProjectSkillSchema = entitySchemas(projectSkill)
