import { index, integer, jsonb, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 用户自接 AI 模型（OpenAI 兼容）；apiKey 加密存储 */
export const projectAiModel = columnComments(
  pgTable(
    'project_ai_model',
    {
      ...baseColumns,
      projectId: integer('projectId').notNull(),
      /** 选择列表用，建议 custom:xxx */
      code: varchar('code', { length: 100 }).notNull(),
      name: varchar('name', { length: 120 }).notNull(),
      baseUrl: varchar('baseUrl', { length: 500 }).notNull(),
      /** 加密后的密钥 */
      apiKeyEnc: varchar('apiKeyEnc', { length: 2000 }).notNull().default(''),
      /** chat / embed */
      capabilities: jsonb('capabilities').$type<string[]>().notNull().default(['chat']),
      remark: varchar('remark', { length: 200 }),
      status: integer('status').notNull().default(1),
    },
    (table) => [
      index('project_ai_model_project_idx').on(table.projectId),
      uniqueIndex('project_ai_model_project_code_uidx').on(
        table.projectId,
        table.code,
      ),
    ],
  ),
  {
    projectId: '项目ID',
    code: '模型编码',
    name: '显示名',
    baseUrl: '接口根地址',
    apiKeyEnc: '加密密钥',
    capabilities: '能力',
    remark: '备注',
    status: '状态',
  },
)

export type ProjectAiModel = InferSelectModel<typeof projectAiModel>
export type NewProjectAiModel = InferInsertModel<typeof projectAiModel>
export const ProjectAiModelSchema = entitySchemas(projectAiModel)
