import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  isTenantEnabled,
  noDataScope,
  noTenant,
  Provide,
  InjectRepository,
  BaseService,
  type Repository,
} from '/#/server'
import type { AdminAuthz, MenuTreeNode } from '../../../../typings/base/permission'
import { baseMenu } from '../entity/menu'
import { baseDepartment } from '../entity/department'
import { baseRole } from '../entity/role'
import { baseRoleDepartment } from '../entity/role-department'
import { baseRoleMenu } from '../entity/role-menu'
import { baseUser } from '../entity/user'
import { baseUserRole } from '../entity/user-role'

function buildMenuTree(rows: (typeof baseMenu.$inferSelect)[]): MenuTreeNode[] {
  const nodes = new Map<number, MenuTreeNode>()
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      router: row.router,
      perms: row.perms,
      type: row.type,
      icon: row.icon,
      orderNum: row.orderNum,
      viewPath: row.viewPath,
      remoteName: row.remoteName,
      remoteEntry: row.remoteEntry,
      remoteModule: row.remoteModule,
      appKey: row.appKey,
      keepAlive: row.keepAlive,
      isShow: row.isShow,
      children: [],
    })
  }

  const roots: MenuTreeNode[] = []
  for (const node of nodes.values()) {
    if (node.parentId != null && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortTree = (list: MenuTreeNode[]) => {
    list.sort((a, b) => a.orderNum - b.orderNum)
    for (const n of list) {
      if (n.children?.length) sortTree(n.children)
      else delete n.children
    }
  }
  sortTree(roots)
  return roots
}

/** 未开启多租户时隐藏租户管理菜单 */
function filterTenantMenus(menus: MenuTreeNode[]): MenuTreeNode[] {
  if (isTenantEnabled()) return menus
  const walk = (list: MenuTreeNode[]): MenuTreeNode[] =>
    list
      .filter((m) => {
        if (m.router === '/sys/tenant') return false
        if (m.perms?.startsWith('base:tenant')) return false
        return true
      })
      .map((m) => {
        const children = m.children?.length ? walk(m.children) : undefined
        return children?.length ? { ...m, children } : { ...m, children: undefined }
      })
  return walk(menus)
}

/** relevance=true 时按 parentId BFS 展开子孙部门 */
function expandDeptIds(
  all: Array<{ id: number; parentId: number | null }>,
  rootIds: number[],
): number[] {
  const children = new Map<number, number[]>()
  for (const d of all) {
    if (d.parentId == null) continue
    const list = children.get(d.parentId) || []
    list.push(d.id)
    children.set(d.parentId, list)
  }
  const out = new Set<number>(rootIds)
  const queue = [...rootIds]
  const visited = new Set<number>()
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    for (const c of children.get(id) || []) {
      out.add(c)
      queue.push(c)
    }
  }
  return [...out]
}

@Provide()
export class PermissionService extends BaseService {
  @InjectRepository(baseUser)
  userRepo: Repository<typeof baseUser>
  @InjectRepository(baseMenu)
  menuRepo: Repository<typeof baseMenu>
  @InjectRepository(baseRole)
  roleRepo: Repository<typeof baseRole>
  @InjectRepository(baseUserRole)
  userRoleRepo: Repository<typeof baseUserRole>
  @InjectRepository(baseRoleMenu)
  roleMenuRepo: Repository<typeof baseRoleMenu>
  @InjectRepository(baseRoleDepartment)
  roleDeptRepo: Repository<typeof baseRoleDepartment>
  @InjectRepository(baseDepartment)
  deptRepo: Repository<typeof baseDepartment>

  /** 后台用户鉴权信息（含数据范围） */
  async getAdminAuthz(adminId: number): Promise<AdminAuthz> {
    return noTenant(async () =>
      noDataScope(async () => {
        const [user] = await this.userRepo.find(
          and(eq(baseUser.id, adminId), isNull(baseUser.deletedAt)),
        )
        if (!user || user.status !== 1) {
          return {
            isSuper: false,
            perms: [],
            menus: [],
            tenantEnabled: isTenantEnabled(),
            dataScope: 'none',
            dataScopeDeptIds: [],
          }
        }

        let authz: AdminAuthz
        if (user.isSuper) {
          const allMenus = await this.menuRepo.find(isNull(baseMenu.deletedAt))
          const perms = [
            ...new Set(allMenus.map((m) => m.perms).filter((p): p is string => !!p)),
          ]
          authz = {
            isSuper: true,
            perms,
            menus: buildMenuTree(allMenus),
            dataScope: 'all',
            dataScopeDeptIds: [],
          }
        } else {
          authz = await this.resolveAuthzByUserRoles(adminId, false)
          const scope = await this.resolveAdminDataScope(adminId, authz.isSuper)
          authz = { ...authz, ...scope }
        }

        return {
          ...authz,
          menus: filterTenantMenus(authz.menus),
          tenantEnabled: isTenantEnabled(),
        }
      }),
    )
  }

  /**
   * 解析数据范围：任一角色全部 → all；否则并集自定义部门（relevance 展开子树）
   */
  async resolveAdminDataScope(
    adminId: number,
    isSuper = false,
  ): Promise<Pick<AdminAuthz, 'dataScope' | 'dataScopeDeptIds'>> {
    if (isSuper) return { dataScope: 'all', dataScopeDeptIds: [] }

    return noDataScope(async () => {
      const links = await this.userRoleRepo.find(eq(baseUserRole.userId, adminId))
      if (!links.length) return { dataScope: 'none', dataScopeDeptIds: [] }

      const roleIds = links.map((l) => l.roleId)
      const roles = await this.roleRepo.find(
        and(
          inArray(baseRole.id, roleIds),
          eq(baseRole.status, 1),
          isNull(baseRole.deletedAt),
        ),
      )
      if (!roles.length) return { dataScope: 'none', dataScopeDeptIds: [] }

      if (roles.some((r) => Number(r.dataScope) === 0)) {
        return { dataScope: 'all', dataScopeDeptIds: [] }
      }

      const customRoles = roles.filter((r) => Number(r.dataScope) === 1)
      if (!customRoles.length) return { dataScope: 'none', dataScopeDeptIds: [] }

      const customRoleIds = customRoles.map((r) => r.id)
      const linksDept = await this.roleDeptRepo.find(
        inArray(baseRoleDepartment.roleId, customRoleIds),
      )
      if (!linksDept.length) return { dataScope: 'none', dataScopeDeptIds: [] }

      const needExpand = new Set(
        customRoles.filter((r) => Boolean(r.relevance)).map((r) => r.id),
      )
      const byRole = new Map<number, number[]>()
      for (const row of linksDept) {
        const list = byRole.get(row.roleId) || []
        list.push(row.departmentId)
        byRole.set(row.roleId, list)
      }

      let allDepts: Array<{ id: number; parentId: number | null }> = []
      if (needExpand.size) {
        const rows = await this.deptRepo.find(isNull(baseDepartment.deletedAt))
        allDepts = rows.map((d) => ({
          id: d.id,
          parentId: d.parentId == null ? null : Number(d.parentId),
        }))
      }

      const merged = new Set<number>()
      for (const role of customRoles) {
        const raw = byRole.get(role.id) || []
        const ids = needExpand.has(role.id) ? expandDeptIds(allDepts, raw) : raw
        for (const id of ids) merged.add(id)
      }

      const dataScopeDeptIds = [...merged]
      if (!dataScopeDeptIds.length) {
        return { dataScope: 'none', dataScopeDeptIds: [] }
      }
      return { dataScope: 'custom', dataScopeDeptIds }
    })
  }

  private async resolveAuthzByUserRoles(
    userId: number,
    isSuper: boolean,
  ): Promise<AdminAuthz> {
    const links = await this.userRoleRepo.find(eq(baseUserRole.userId, userId))
    if (!links.length) {
      return {
        isSuper,
        perms: [],
        menus: [],
        dataScope: 'none',
        dataScopeDeptIds: [],
      }
    }

    const roleIds = links.map((l) => l.roleId)
    const roles = await this.roleRepo.find(
      and(
        inArray(baseRole.id, roleIds),
        eq(baseRole.status, 1),
        isNull(baseRole.deletedAt),
      ),
    )
    if (!roles.length) {
      return {
        isSuper,
        perms: [],
        menus: [],
        dataScope: 'none',
        dataScopeDeptIds: [],
      }
    }

    const activeRoleIds = roles.map((r) => r.id)
    const roleMenus = await this.roleMenuRepo.find(inArray(baseRoleMenu.roleId, activeRoleIds))
    const menuIds = [...new Set(roleMenus.map((rm) => rm.menuId))]
    if (!menuIds.length) {
      return {
        isSuper,
        perms: [],
        menus: [],
        dataScope: 'none',
        dataScopeDeptIds: [],
      }
    }

    const menus = await this.menuRepo.find(
      and(inArray(baseMenu.id, menuIds), isNull(baseMenu.deletedAt)),
    )
    const perms = [...new Set(menus.map((m) => m.perms).filter((p): p is string => !!p))]
    return { isSuper, perms, menus: buildMenuTree(menus) }
  }

  /** 是否具备任一权限码（超管恒 true） */
  hasPerm(authz: { isSuper?: boolean; perms: string[] }, codes: string[]) {
    if (authz.isSuper) return true
    if (!codes.length) return true
    return codes.some((c) => authz.perms.includes(c))
  }
}
