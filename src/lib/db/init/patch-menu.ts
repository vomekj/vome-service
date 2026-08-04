import { readFile } from 'node:fs/promises'
import type { SQL } from 'bun'

type MenuNode = Record<string, unknown> & {
  name?: string
  type?: number
  router?: string
  childMenus?: MenuNode[]
}

/**
 * 已 init 过的环境：按 router 增量补种 type=1 页面及其 type=2 按钮，
 * 挂到已有同名 type=0 目录下；并授予已拥有该目录下任一子菜单的角色。
 */
export async function patchMissingMenusFromJson(file: string, sql: SQL) {
  const raw = await readFile(file, 'utf8')
  const menus = JSON.parse(raw) as MenuNode[]
  if (!Array.isArray(menus)) return

  for (const root of menus) {
    if (Number(root.type) !== 0 || !root.name) continue
    const parentName = String(root.name)
    const parents = await sql`
      SELECT id FROM base_menu
      WHERE name = ${parentName} AND type = 0 AND "deletedAt" IS NULL
      ORDER BY id ASC
      LIMIT 1
    `
    const parentId = Number((parents[0] as { id?: number } | undefined)?.id)
    if (!Number.isFinite(parentId) || parentId <= 0) continue

    const children = Array.isArray(root.childMenus) ? root.childMenus : []
    for (const page of children) {
      if (Number(page.type) !== 1) continue
      const router = String(page.router || '').trim()
      if (!router) continue

      const exists = await sql`
        SELECT id, "viewPath" FROM base_menu
        WHERE router = ${router} AND "deletedAt" IS NULL
        LIMIT 1
      `
      const viewPath =
        page.viewPath == null ? null : String(page.viewPath)
      if (exists[0]) {
        const row = exists[0] as { id?: number; viewPath?: string | null }
        const id = Number(row.id)
        if (
          Number.isFinite(id) &&
          id > 0 &&
          viewPath &&
          String(row.viewPath || '') !== viewPath
        ) {
          await sql`
            UPDATE base_menu
            SET "viewPath" = ${viewPath}, "updateTime" = NOW()
            WHERE id = ${id}
          `
          console.log(`[init] menu viewPath ← ${router} → ${viewPath}`)
        }
        continue
      }

      const inserted = await sql`
        INSERT INTO base_menu (
          "parentId", name, router, perms, type, icon, "orderNum",
          "viewPath", "keepAlive", "isShow", "createTime", "updateTime"
        ) VALUES (
          ${parentId},
          ${String(page.name || router)},
          ${router},
          ${page.perms == null ? null : String(page.perms)},
          1,
          ${page.icon == null ? null : String(page.icon)},
          ${Number(page.orderNum) || 0},
          ${page.viewPath == null ? null : String(page.viewPath)},
          ${page.keepAlive !== false},
          ${page.isShow !== false},
          NOW(),
          NOW()
        )
        RETURNING id
      `
      const pageId = Number((inserted[0] as { id?: number } | undefined)?.id)
      if (!Number.isFinite(pageId) || pageId <= 0) continue

      const buttons = Array.isArray(page.childMenus) ? page.childMenus : []
      const menuIds = [pageId]
      for (const btn of buttons) {
        if (Number(btn.type) !== 2) continue
        const btnRows = await sql`
          INSERT INTO base_menu (
            "parentId", name, router, perms, type, icon, "orderNum",
            "viewPath", "keepAlive", "isShow", "createTime", "updateTime"
          ) VALUES (
            ${pageId},
            ${String(btn.name || btn.perms || 'perm')},
            ${btn.router == null ? null : String(btn.router)},
            ${btn.perms == null ? null : String(btn.perms)},
            2,
            ${btn.icon == null ? null : String(btn.icon)},
            ${Number(btn.orderNum) || 0},
            ${btn.viewPath == null ? null : String(btn.viewPath)},
            ${btn.keepAlive !== false},
            false,
            NOW(),
            NOW()
          )
          RETURNING id
        `
        const btnId = Number((btnRows[0] as { id?: number } | undefined)?.id)
        if (Number.isFinite(btnId) && btnId > 0) menuIds.push(btnId)
      }

      /* 与同目录已有页面同权的角色一并授权 */
      const roles = await sql`
        SELECT DISTINCT rm."roleId" AS "roleId"
        FROM base_role_menu rm
        INNER JOIN base_menu m ON m.id = rm."menuId"
        WHERE m."parentId" = ${parentId}
          AND m."deletedAt" IS NULL
          AND rm."deletedAt" IS NULL
      `
      for (const r of roles) {
        const roleId = Number((r as { roleId?: number }).roleId)
        if (!Number.isFinite(roleId) || roleId <= 0) continue
        for (const menuId of menuIds) {
          await sql`
            INSERT INTO base_role_menu ("roleId", "menuId", "createTime", "updateTime")
            SELECT ${roleId}, ${menuId}, NOW(), NOW()
            WHERE NOT EXISTS (
              SELECT 1 FROM base_role_menu
              WHERE "roleId" = ${roleId}
                AND "menuId" = ${menuId}
                AND "deletedAt" IS NULL
            )
          `
        }
      }

      console.log(`[init] menu patch ← ${router} under ${parentName}`)
    }
  }
}
