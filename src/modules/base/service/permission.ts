import { isNull } from 'drizzle-orm'
import {
  isTenantEnabled,
  Provide,
  InjectRepository,
  BaseService,
  type Repository,
} from '@core/server'
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

  /** 启动灌角色 / 菜单 / 部门缓存 */
  override async init() {
    const [links, roles, roleMenus, roleDepts, menus, depts] = await Promise.all([
      this.userRoleRepo.find(isNull(baseUserRole.deleteTime)),
      this.roleRepo.find(isNull(baseRole.deleteTime)),
      this.roleMenuRepo.find(isNull(baseRoleMenu.deleteTime)),
      this.roleDeptRepo.find(isNull(baseRoleDepartment.deleteTime)),
      this.menuRepo.find(isNull(baseMenu.deleteTime)),
      this.deptRepo.find(isNull(baseDepartment.deleteTime)),
    ])
    await Promise.all([
      this.cacheSet('base_user_role', links ?? []),
      this.cacheSet('base_role', roles ?? []),
      this.cacheSet('base_role_menu', roleMenus ?? []),
      this.cacheSet('base_role_department', roleDepts ?? []),
      this.cacheSet('base_menu', menus ?? []),
      this.cacheSet('base_department', depts ?? []),
    ])
  }

  private async rbacSnap() {
    const [links, roles, roleMenus, roleDepts, menus, depts] = await Promise.all([
      this.cacheGet('base_user_role', () =>
        this.userRoleRepo.find(isNull(baseUserRole.deleteTime)),
      ),
      this.cacheGet('base_role', () => this.roleRepo.find(isNull(baseRole.deleteTime))),
      this.cacheGet('base_role_menu', () =>
        this.roleMenuRepo.find(isNull(baseRoleMenu.deleteTime)),
      ),
      this.cacheGet('base_role_department', () =>
        this.roleDeptRepo.find(isNull(baseRoleDepartment.deleteTime)),
      ),
      this.cacheGet('base_menu', () => this.menuRepo.find(isNull(baseMenu.deleteTime))),
      this.cacheGet('base_department', () =>
        this.deptRepo.find(isNull(baseDepartment.deleteTime)),
      ),
    ])

    const userRoleIds = new Map<number, number[]>()
    for (const row of links) {
      const list = userRoleIds.get(row.userId) ?? []
      list.push(row.roleId)
      userRoleIds.set(row.userId, list)
    }

    const roleMap = new Map<number, { status: number; dataScope: number; relevance: boolean }>()
    for (const row of roles) {
      roleMap.set(row.id, {
        status: row.status,
        dataScope: Number(row.dataScope),
        relevance: Boolean(row.relevance),
      })
    }

    const roleMenuIds = new Map<number, number[]>()
    for (const row of roleMenus) {
      const list = roleMenuIds.get(row.roleId) ?? []
      list.push(row.menuId)
      roleMenuIds.set(row.roleId, list)
    }

    const roleDeptIds = new Map<number, number[]>()
    for (const row of roleDepts) {
      const list = roleDeptIds.get(row.roleId) ?? []
      list.push(row.departmentId)
      roleDeptIds.set(row.roleId, list)
    }

    const menuById = new Map(menus.map((row) => [row.id, row]))
    return {
      userRoleIds,
      roles: roleMap,
      roleMenuIds,
      roleDeptIds,
      menus,
      menuById,
      departments: depts.map((d) => ({
        id: d.id,
        parentId: d.parentId == null ? null : Number(d.parentId),
      })),
    }
  }

  /** 后台用户鉴权。角色和菜单走本地缓存；用户行只按 id 查库，不进缓存 */
  async getAdminAuthz(adminId: number): Promise<AdminAuthz> {
    const [snap, row] = await Promise.all([
      this.rbacSnap(),
      this.userRepo.findById(adminId),
    ])
    if (!row || row.status !== 1) {
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
    if (row.isSuper) {
      const perms = [
        ...new Set(snap.menus.map((m) => m.perms).filter((p): p is string => !!p)),
      ]
      authz = {
        isSuper: true,
        perms,
        menus: buildMenuTree(snap.menus),
        dataScope: 'all',
        dataScopeDeptIds: [],
      }
    } else {
      authz = this.resolveAuthzByUserRoles(adminId, false, snap)
      authz = { ...authz, ...this.resolveDataScope(adminId, authz.isSuper, snap) }
    }

    return {
      ...authz,
      menus: filterTenantMenus(authz.menus),
      tenantEnabled: isTenantEnabled(),
    }
  }

  /**
   * 解析数据范围：任一角色全部 → all；否则并集自定义部门（relevance 展开子树）
   */
  async resolveAdminDataScope(
    adminId: number,
    isSuper = false,
  ): Promise<Pick<AdminAuthz, 'dataScope' | 'dataScopeDeptIds'>> {
    const snap = await this.rbacSnap()
    return this.resolveDataScope(adminId, isSuper, snap)
  }

  private resolveDataScope(
    adminId: number,
    isSuper = false,
    snap: Awaited<ReturnType<PermissionService['rbacSnap']>>,
  ): Pick<AdminAuthz, 'dataScope' | 'dataScopeDeptIds'> {
    if (isSuper) return { dataScope: 'all', dataScopeDeptIds: [] }

    const bound = (snap.userRoleIds.get(adminId) ?? [])
      .map((id) => ({ id, role: snap.roles.get(id) }))
      .filter((item): item is { id: number; role: NonNullable<(typeof item)['role']> } =>
        !!item.role && item.role.status === 1,
      )
    if (!bound.length) return { dataScope: 'none', dataScopeDeptIds: [] }

    if (bound.some((item) => item.role.dataScope === 0)) {
      return { dataScope: 'all', dataScopeDeptIds: [] }
    }

    const custom = bound.filter((item) => item.role.dataScope === 1)
    if (!custom.length) return { dataScope: 'none', dataScopeDeptIds: [] }

    const merged = new Set<number>()
    for (const item of custom) {
      const raw = snap.roleDeptIds.get(item.id) ?? []
      const ids = item.role.relevance ? expandDeptIds(snap.departments, raw) : raw
      for (const id of ids) merged.add(id)
    }
    const dataScopeDeptIds = [...merged]
    if (!dataScopeDeptIds.length) return { dataScope: 'none', dataScopeDeptIds: [] }
    return { dataScope: 'custom', dataScopeDeptIds }
  }

  private resolveAuthzByUserRoles(
    userId: number,
    isSuper: boolean,
    snap: Awaited<ReturnType<PermissionService['rbacSnap']>>,
  ): AdminAuthz {
    const roleIds = snap.userRoleIds.get(userId) ?? []
    const activeRoleIds = roleIds.filter((id) => snap.roles.get(id)?.status === 1)
    if (!activeRoleIds.length) {
      return {
        isSuper,
        perms: [],
        menus: [],
        dataScope: 'none',
        dataScopeDeptIds: [],
      }
    }

    const menuIds = [
      ...new Set(activeRoleIds.flatMap((id) => snap.roleMenuIds.get(id) ?? [])),
    ]
    const menus = menuIds
      .map((id) => snap.menuById.get(id))
      .filter((m): m is typeof baseMenu.$inferSelect => !!m)
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
