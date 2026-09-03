import { index, integer, jsonb, pgTable, text, varchar } from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

export const projectKbChunk = columnComments(
  pgTable(
    'project_kb_chunk',
    {
      ...baseColumns,
      docId: integer('docId').notNull(),
      projectId: integer('projectId').notNull(),
      kind: varchar('kind').notNull(),
      chunkIndex: integer('chunkIndex').notNull().default(0),
      summary: varchar('summary'),
      content: text('content').notNull().default(''),
      embedding: jsonb('embedding').$type<number[]>().notNull().default([]),
      embeddingModel: varchar('embeddingModel'),
      meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
      enabled: integer('enabled').notNull().default(1),
    },
    (table) => [
      index('project_kb_chunk_doc_idx').on(table.docId),
      index('project_kb_chunk_project_kind_idx').on(table.projectId, table.kind),
    ],
  ),
  {
    docId: '文档ID',
    projectId: '项目ID',
    kind: '类型',
    chunkIndex: '分块序号',
    summary: '摘要',
    content: '内容',
    embedding: '向量',
    embeddingModel: '向量模型',
    meta: '扩展',
    enabled: '启用',
  },
)

export const ProjectKbChunkSchema = entitySchemas(projectKbChunk)
