import { and, eq, inArray, isNull } from 'drizzle-orm'
import { CommException, Provide } from '/#/server'
import { InjectRepository, type Repository } from '/#/server'
import { BaseService } from '/#/server'
import { baseMenu } from '../entity/menu'
import { baseDepartment } from '../entity/department'
import { baseRole } from '../entity/role'
import { baseRoleDepartment } from '../entity/role-department'
import { baseRoleMenu } from '../entity/role-menu'
import { baseUser } from '../entity/user'
import { baseUserRole } from '../entity/user-role'

@Provide()
export class MenuService extends BaseService {
  @InjectRepository(baseMenu)
  menuRepo: Repository<typeof baseMenu>

  async listAll() {
    return this.menuRepo.find(isNull(baseMenu.deletedAt))
  }
}

@Provide()
export class DepartmentService extends BaseService {
  @InjectRepository(baseDepartment)
  deptRepo: Repository<typeof baseDepartment>
  @InjectRepository(baseUser)
  userRepo: Repository<typeof baseUser>

  async listAll(onlyTrashed = false) {
    return this.deptRepo.find(
      undefined,
      onlyTrashed ? { onlyTrashed: true } : undefined,
    )
  }

  async modifyBefore(data: unknown, type: 'add' | 'update' | 'delete') {
    if (type !== 'delete') return
    const ids = (Array.isArray(data) ? data : [data])
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id))
    if (!ids.length) return

    // 含回收站：软删/彻底删都走 delete，须看到已软删的子部门与用户
    for (const id of ids) {
      const children = await this.deptRepo.find(
        eq(baseDepartment.parentId, id),
        { withTrashed: true },
      )
      if (children.length) {
        throw new CommException('存在子部门（含回收站），无法删除')
      }
      const users = await this.userRepo.find(
        eq(baseUser.departmentId, id),
        { withTrashed: true },
      )
      if (users.length) {
        throw new CommException('部门下存在用户（含回收站），无法删除')
      }
    }
  }
}

@Provide()
export class RoleService extends BaseService {
  @InjectRepository(baseRole)
  roleRepo: Repository<typeof baseRole>
  @InjectRepository(baseRoleMenu)
  roleMenuRepo: Repository<typeof baseRoleMenu>
  @InjectRepository(baseRoleDepartment)
  roleDeptRepo: Repository<typeof baseRoleDepartment>

  async getMenuIds(roleId: number) {
    const rows = await this.roleMenuRepo.find(eq(baseRoleMenu.roleId, roleId))
    return rows.map((r) => r.menuId)
  }

  async setMenus(roleId: number, menuIds: number[]) {
    const existing = await this.roleMenuRepo.find(eq(baseRoleMenu.roleId, roleId))
    if (existing.length) {
      await this.roleMenuRepo.forceDelete(
        inArray(
          baseRoleMenu.id,
          existing.map((e) => e.id),
        ),
      )
    }
    for (const menuId of menuIds) {
      await this.roleMenuRepo.create({ roleId, menuId })
    }
  }

  async getDepartmentIds(roleId: number) {
    const rows = await this.roleDeptRepo.find(eq(baseRoleDepartment.roleId, roleId))
    return rows.map((r) => r.departmentId)
  }

  async setDepartments(roleId: number, departmentIds: number[]) {
    const existing = await this.roleDeptRepo.find(eq(baseRoleDepartment.roleId, roleId))
    if (existing.length) {
      await this.roleDeptRepo.forceDelete(
        inArray(
          baseRoleDepartment.id,
          existing.map((e) => e.id),
        ),
      )
    }
    for (const departmentId of departmentIds) {
      await this.roleDeptRepo.create({ roleId, departmentId })
    }
  }
}

@Provide()
export class AdminUserService extends BaseService {
  @InjectRepository(baseUser)
  userRepo: Repository<typeof baseUser>
  @InjectRepository(baseUserRole)
  userRoleRepo: Repository<typeof baseUserRole>
  @InjectRepository(baseRole)
  roleRepo: Repository<typeof baseRole>
  @InjectRepository(baseDepartment)
  deptRepo: Repository<typeof baseDepartment>

  async getRoleIds(userId: number) {
    const rows = await this.userRoleRepo.find(eq(baseUserRole.userId, userId))
    return rows.map((r) => r.roleId)
  }

  async setRoles(userId: number, roleIds: number[]) {
    const existing = await this.userRoleRepo.find(eq(baseUserRole.userId, userId))
    if (existing.length) {
      await this.userRoleRepo.forceDelete(
        inArray(
          baseUserRole.id,
          existing.map((e) => e.id),
        ),
      )
    }
    for (const roleId of roleIds) {
      await this.userRoleRepo.create({ userId, roleId })
    }
  }

  /** userId → 角色名（逗号分隔） */
  async buildRoleNameMap() {
    const links = await this.userRoleRepo.find(isNull(baseUserRole.deletedAt))
    const roles = await this.roleRepo.find(isNull(baseRole.deletedAt))
    const roleName = new Map(roles.map((r) => [r.id, r.name]))
    const map: Record<string, string> = {}
    for (const link of links) {
      const name = roleName.get(link.roleId) ?? ''
      if (!name) continue
      const key = String(link.userId)
      map[key] = map[key] ? `${map[key]}, ${name}` : name
    }
    return map
  }

  /** 超管转让：目标设为超管，当前用户降级 */
  async transferSuper(fromAdminId: number, toUserId: number) {
    if (fromAdminId === toUserId) {
      throw new CommException('不能转让给自己')
    }

    const [from] = await this.userRepo.find(eq(baseUser.id, fromAdminId))
    if (!from?.isSuper) {
      throw new CommException('仅最高管理员可转让', { statusCode: 403 })
    }

    const [to] = await this.userRepo.find(
      and(eq(baseUser.id, toUserId), isNull(baseUser.deletedAt)),
    )
    if (!to || to.status !== 1) {
      throw new CommException('目标用户不存在或已禁用')
    }

    await this.userRepo.update(eq(baseUser.id, toUserId), { isSuper: true })
    await this.userRepo.update(eq(baseUser.id, fromAdminId), { isSuper: false })
  }

  /** 批量转移部门 */
  async moveDepartment(userIds: number[], departmentId: number) {
    const ids = [...new Set(userIds.map(Number).filter((id) => !Number.isNaN(id) && id > 0))]
    if (!ids.length) throw new CommException('请选择用户')

    const [dept] = await this.deptRepo.find(
      and(eq(baseDepartment.id, departmentId), isNull(baseDepartment.deletedAt)),
    )
    if (!dept) throw new CommException('部门不存在')

    await this.userRepo.update(ids.map((id) => ({ id, departmentId })))
  }

  async modifyBefore(data: any, type: 'add' | 'update' | 'delete') {
    if (type === 'add' && data.password) {
      data.password = await Bun.password.hash(String(data.password))
      data.passwordV = data.passwordV ?? 1
    }
    if (type === 'update' && data.password) {
      data.password = await Bun.password.hash(String(data.password))
      data.passwordV = (data.passwordV ?? 1) + 1
    }
    if (type === 'update' && (data.password === '' || data.password == null)) {
      delete data.password
    }
    if (type === 'add' || type === 'update') {
      if (data.tenantId === '' || data.tenantId == null) {
        data.tenantId = null
      } else {
        data.tenantId = Number(data.tenantId)
      }
      if (data.departmentId === '' || data.departmentId == null) {
        data.departmentId = null
      } else {
        data.departmentId = Number(data.departmentId)
      }
    }
  }
}
