/**
 * pgvector 辅助：扩展 / 列同步 / 余弦检索
 */
export type SqlUnsafe = {
  unsafe: (query: string) => Promise<unknown>
}

export function vectorLiteral(vector: number[]) {
  return `[${vector
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .join(',')}]`
}

export async function ensureVectorInfra(
  sql: SqlUnsafe | undefined,
  opts: { table: string; column?: string; indexName: string; dim: number },
): Promise<boolean> {
  if (!sql || !Number.isFinite(opts.dim) || opts.dim <= 0) return false
  const column = opts.column || 'embedding_vec'
  const table = opts.table.replace(/[^a-zA-Z0-9_]/g, '')
  const col = column.replace(/[^a-zA-Z0-9_]/g, '')
  const idx = opts.indexName.replace(/[^a-zA-Z0-9_]/g, '')
  try {
    await sql.unsafe('CREATE EXTENSION IF NOT EXISTS vector')
    await sql.unsafe(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} vector(${opts.dim})`,
    )
    await sql.unsafe(
      `CREATE INDEX IF NOT EXISTS ${idx} ON ${table} USING ivfflat (${col} vector_cosine_ops)`,
    )
    return true
  } catch {
    return false
  }
}

export async function syncEmbeddingVec(
  sql: SqlUnsafe | undefined,
  opts: {
    table: string
    id: number
    vector: number[]
    column?: string
    indexName: string
  },
) {
  if (!sql || !opts.vector.length) return
  const ok = await ensureVectorInfra(sql, {
    table: opts.table,
    column: opts.column,
    indexName: opts.indexName,
    dim: opts.vector.length,
  })
  if (!ok) return
  const table = opts.table.replace(/[^a-zA-Z0-9_]/g, '')
  const col = (opts.column || 'embedding_vec').replace(/[^a-zA-Z0-9_]/g, '')
  await sql.unsafe(
    `UPDATE ${table} SET ${col} = '${vectorLiteral(opts.vector)}'::vector WHERE id = ${Number(opts.id)}`,
  )
}

export async function searchEmbeddingIds(
  sql: SqlUnsafe | undefined,
  opts: {
    table: string
    vector: number[]
    topK: number
    whereSql?: string
    column?: string
    indexName: string
  },
): Promise<number[] | null> {
  if (!sql || !opts.vector.length) return null
  const ok = await ensureVectorInfra(sql, {
    table: opts.table,
    column: opts.column,
    indexName: opts.indexName,
    dim: opts.vector.length,
  })
  if (!ok) return null
  const table = opts.table.replace(/[^a-zA-Z0-9_]/g, '')
  const col = (opts.column || 'embedding_vec').replace(/[^a-zA-Z0-9_]/g, '')
  const where = opts.whereSql ? `AND (${opts.whereSql})` : ''
  try {
    const rows = (await sql.unsafe(
      `SELECT id FROM ${table}
       WHERE ${col} IS NOT NULL ${where}
       ORDER BY ${col} <=> '${vectorLiteral(opts.vector)}'::vector
       LIMIT ${Math.max(1, opts.topK)}`,
    )) as Array<Record<string, unknown>>
    return (Array.isArray(rows) ? rows : [])
      .map((r) => Number(r.id))
      .filter((id) => Number.isFinite(id) && id > 0)
  } catch {
    return null
  }
}
