import { index, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

export const projectKbAdoption = columnComments(
  pgTable(
    'project_kb_adoption',
    {
      ...baseColumns,
      projectId: integer('projectId').notNull(),
      userId: integer('userId').notNull(),
      sceneType: varchar('sceneType').notNull().default('page'),
      title: varchar('title'),
      summary: varchar('summary'),
      content: text('content'),
    },
    (table) => [
      index('project_kb_adoption_project_idx').on(table.projectId),
    ],
  ),
  {
    projectId: '项目ID',
    userId: '用户ID',
    sceneType: '场景',
    title: '标题',
    summary: '摘要',
    content: '内容',
  },
)

export const ProjectKbAdoptionSchema = entitySchemas(projectKbAdoption)
