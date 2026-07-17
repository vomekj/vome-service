import { defineConfig } from 'drizzle-kit'
import { VomeConfig } from '/#/server'
import type { DbConfig } from './typings/config/db'
import { buildDbUrl, drizzleDialect } from './src/lib/db/config'

const db = VomeConfig.db as DbConfig

export default defineConfig({
  schema: './src/lib/db/schema/index.ts',
  out: db.migrations,
  dialect: drizzleDialect(db.type),
  dbCredentials: {
    url: buildDbUrl(db),
  },
})
