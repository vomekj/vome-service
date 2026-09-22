import { and, eq, inArray, isNull } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { CommException, Provide } from '@core/server'
import type { UserAuthz } from '../../../../typings/user/permission'
import { InjectRepository, type Repository } from '@core/server'
import { BaseService } from '@core/server'
import { userAccount } from '../entity/account'
import { userInfo } from '../entity/info'
import { parseUserRolePerms, userRole } from '../entity/role'
import { userInfoRole } from '../entity/info-role'
import type {
  CrudDeleteOptions,
  CrudDeleteWhere,
  CrudModifyType,
} from '@core/server'

@Provide()
export class UserPermissionService extends BaseService {
  @InjectRepository(userInfo)
  infoRepo: Repository<typeof userInfo>
  @InjectRepository(userInfoRole)
  infoRoleRepo: Repository<typeof userInfoRole>
  @InjectRepository(userRole)
  roleRepo: Repository<typeof userRole>

  /** 启动灌前端角色缓存 */
  override async init() {
    const [links, roles] = await Promise.all([
      this.infoRoleRepo.find(isNull(userInfoRole.deleteTime)),
      this.roleRepo.find(isNull(userRole.deleteTime)),
    ])
    await Promise.all([
      this.cacheSet('user_info_role', links ?? []),
      this.cacheSet('user_role', roles ?? []),
    ])
  }

  /**
   * 前端用户权限码汇总；未绑角色时 openAll=true。
   * @param userId 业务自增 user_info.userId
   */
  async getUserAuthz(userId: number): Promise<UserAuthz> {
    if (!Number.isInteger(userId) || userId <= 0) return { perms: [], openAll: true }
    const [links, roles] = await Promise.all([
      this.cacheGet('user_info_role', () => this.infoRoleRepo.find(isNull(userInfoRole.deleteTime))),
      this.cacheGet('user_role', () => this.roleRepo.find(isNull(userRole.deleteTime))),
    ])
    const roleIds = links.filter((link) => link.userId === userId).map((link) => link.roleId)
    if (!roleIds.length) return { perms: [], openAll: true }

    const rolePerms = new Map<number, string[]>()
    for (const role of roles) {
      if (role.status !== 1) continue
      rolePerms.set(role.id, parseUserRolePerms(role.perms))
    }
    const perms = new Set<string>()
    let hit = false
    for (const id of roleIds) {
      const codes = rolePerms.get(id)
      if (!codes) continue
      hit = true
      for (const code of codes) perms.add(code)
    }
    if (!hit) return { perms: [], openAll: false }
    return { perms: [...perms], openAll: false }
  }
}

@Provide()
export class UserRoleService extends BaseService {
  @InjectRepository(userRole)
  roleRepo: Repository<typeof userRole>

  private normalizePerms(data: Record<string, unknown>) {
    if (Array.isArray(data.perms)) {
      data.perms = JSON.stringify(data.perms)
    } else if (data.perms != null && typeof data.perms !== 'string') {
      data.perms = '[]'
    }
  }

  async modifyBefore(data: unknown, type: CrudModifyType) {
    if (type !== 'add' && type !== 'update') return
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      if (raw == null || typeof raw !== 'object') continue
      this.normalizePerms(raw as Record<string, unknown>)
    }
  }

  async modifyAfter(_data: unknown, type: CrudModifyType) {
    if (type === 'add' || type === 'update' || type === 'delete') {
      await this.cacheDel('user_role')
    }
  }

  async restore(whereOrIds: Parameters<BaseService['restore']>[0]) {
    const result = await super.restore(whereOrIds)
    await this.cacheDel('user_role')
    return result
  }
}

@Provide()
export class UserInfoService extends BaseService {
  @InjectRepository(userInfo)
  infoRepo: Repository<typeof userInfo>
  @InjectRepository(userInfoRole)
  infoRoleRepo: Repository<typeof userInfoRole>
  @InjectRepository(userRole)
  roleRepo: Repository<typeof userRole>
  @InjectRepository(userAccount)
  accountRepo: Repository<typeof userAccount>

  private pendingPassword: string | null = null

  async add(data: Record<string, unknown>) {
    const email = String(data.email ?? '').trim() || null
    const phone = String(data.phone ?? '').trim() || null
    const name = String(data.name ?? '').trim()
    const password = String(data.password ?? '')
    if (!password) throw new CommException('新增用户请填写密码')

    const userId = crypto.randomUUID()
    const row = await this.infoRepo.create({
      id: userId,
      name,
      email,
      phone,
      emailVerified: email ? Boolean(data.emailVerified ?? false) : false,
      phoneVerified: phone ? Boolean(data.phoneVerified ?? false) : false,
      image: data.image ? String(data.image) : null,
    })

    await this.accountRepo.create({
      id: crypto.randomUUID(),
      userId,
      accountId: email || phone || userId,
      providerId: 'credential',
      password: await hashPassword(password),
    })

    await this.modifyAfter(row, 'add')
    return row
  }

  private prepareUserUpdate(data: Record<string, unknown>) {
    const pwd = data.password
    if (pwd != null && String(pwd).trim()) {
      this.pendingPassword = String(pwd)
    }
    delete data.password
    if (data.emailVerified != null) {
      data.emailVerified = Boolean(data.emailVerified)
    }
    if (data.phoneVerified != null) {
      data.phoneVerified = Boolean(data.phoneVerified)
    }
    if (data.email != null) {
      const e = String(data.email).trim()
      data.email = e || null
      if (!e) data.emailVerified = false
    }
    if (data.phone != null) {
      const p = String(data.phone).trim()
      data.phone = p || null
      if (!p) data.phoneVerified = false
    }
  }

  async modifyBefore(data: unknown, type: CrudModifyType) {
    if (type !== 'update') return
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      if (raw == null || typeof raw !== 'object') continue
      this.prepareUserUpdate(raw as Record<string, unknown>)
    }
  }

  async delete(
    whereOrIds: CrudDeleteWhere,
    options?: CrudDeleteOptions,
  ) {
    if (options?.force) {
      await this.cleanupUserRelations(whereOrIds)
    }
    return super.delete(whereOrIds, options)
  }

  private async cleanupUserRelations(whereOrIds: unknown) {
    const baIds = this.resolveBaUserIds(whereOrIds)
    if (!baIds.length) return
    const users = await this.infoRepo.find(inArray(userInfo.id, baIds))
    const serialIds = users
      .map((u) => u.userId)
      .filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)
    if (!serialIds.length) return
    await this.infoRoleRepo.forceDelete(inArray(userInfoRole.userId, serialIds))
    await this.cacheDel('user_info_role')
  }

  /** @param userId 业务自增 user_info.userId */
  async getRoleIds(userId: number) {
    const rows = await this.infoRoleRepo.find(eq(userInfoRole.userId, userId))
    return rows.map((r) => r.roleId)
  }

  /** @param userId 业务自增 user_info.userId */
  async setRoles(userId: number, roleIds: number[]) {
    const existing = await this.infoRoleRepo.find(eq(userInfoRole.userId, userId))
    if (existing.length) {
      await this.infoRoleRepo.forceDelete(
        inArray(
          userInfoRole.id,
          existing.map((e) => e.id),
        ),
      )
    }
    if (roleIds.length) {
      await this.infoRoleRepo.create(
        roleIds.map((roleId) => ({ userId, roleId })),
      )
    }
    await this.cacheDel('user_info_role')
  }

  /** 业务 userId → 角色名（逗号分隔） */
  async buildRoleNameMap() {
    const links = await this.infoRoleRepo.find(isNull(userInfoRole.deleteTime))
    const roles = await this.roleRepo.find(isNull(userRole.deleteTime))
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

  async modifyAfter(data: unknown, type: CrudModifyType) {
    if (type !== 'update' || !this.pendingPassword) return
    const row = data as { id?: unknown; email?: unknown } | null | undefined
    const id = row?.id
    if (id == null) return

    const baUserId = String(id)
    const hashed = await hashPassword(this.pendingPassword)
    this.pendingPassword = null

    const accounts = await this.accountRepo.find(
      and(
        eq(userAccount.userId, baUserId),
        eq(userAccount.providerId, 'credential'),
      ),
    )
    if (accounts[0]) {
      await this.accountRepo.update(eq(userAccount.id, accounts[0].id), {
        password: hashed,
      })
      return
    }

    await this.accountRepo.create({
      id: crypto.randomUUID(),
      userId: baUserId,
      accountId: String(row?.email ?? baUserId),
      providerId: 'credential',
      password: hashed,
    })
  }

  /** 删除入参 → Better Auth user_info.id 列表 */
  private resolveBaUserIds(whereOrIds: unknown): string[] {
    if (Array.isArray(whereOrIds)) {
      return whereOrIds
        .map((item) => {
          if (item != null && typeof item === 'object' && 'id' in item) {
            return String((item as { id: unknown }).id)
          }
          return String(item)
        })
        .filter(Boolean)
    }
    if (whereOrIds && typeof whereOrIds === 'object') {
      const o = whereOrIds as Record<string, unknown>
      if (Array.isArray(o.ids)) return o.ids.map((id) => String(id)).filter(Boolean)
      if (o.id != null) return [String(o.id)]
    }
    if (whereOrIds != null && whereOrIds !== '') return [String(whereOrIds)]
    return []
  }
}
