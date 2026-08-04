import { index, integer, jsonb, pgTable, text, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 用户侧知识文档：adoption / context / rule / design */
export const projectKbDoc = columnComments(
  pgTable(
    'project_kb_doc',
    {
      ...baseColumns,
      projectId: integer('projectId').notNull(),
      kind: varchar('kind', { length: 20 }).notNull(),
      title: varchar('title', { length: 200 }).notNull(),
      sourceType: varchar('sourceType', { length: 50 }).notNull().default('manual'),
      sourceId: varchar('sourceId', { length: 100 }),
      summary: varchar('summary', { length: 1000 }),
      content: text('content'),
      tags: jsonb('tags').$type<string[]>().notNull().default([]),
      enabled: integer('enabled').notNull().default(1),
      createdBy: integer('createdBy'),
    },
    (table) => [
      index('project_kb_doc_project_kind_idx').on(table.projectId, table.kind),
    ],
  ),
  {
    projectId: '项目ID',
    kind: '类型',
    title: '标题',
    sourceType: '来源类型',
    sourceId: '来源ID',
    summary: '摘要',
    content: '内容',
    tags: '标签',
    enabled: '启用',
    createdBy: '创建者',
  },
)

export type ProjectKbDoc = InferSelectModel<typeof projectKbDoc>
export type NewProjectKbDoc = InferInsertModel<typeof projectKbDoc>
export const ProjectKbDocSchema = entitySchemas(projectKbDoc)
