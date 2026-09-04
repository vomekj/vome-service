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

@Provide()
export class UserPermissionService extends BaseService {
  @InjectRepository(userInfo)
  infoRepo: Repository<typeof userInfo>
  @InjectRepository(userInfoRole)
  infoRoleRepo: Repository<typeof userInfoRole>
  @InjectRepository(userRole)
  roleRepo: Repository<typeof userRole>

  /**
   * 前端用户权限码汇总；未绑角色时 openAll=true。
   * @param userId 业务自增 user_info.userId
   */
  async getUserAuthz(userId: number): Promise<UserAuthz> {
    if (!Number.isInteger(userId) || userId <= 0) return { perms: [], openAll: true }
    const links = await this.infoRoleRepo.find(eq(userInfoRole.userId, userId))
    if (!links.length) return { perms: [], openAll: true }

    const roleIds = links.map((l) => l.roleId)
    const roles = await this.roleRepo.find(
      and(
        inArray(userRole.id, roleIds),
        eq(userRole.status, 1),
        isNull(userRole.deleteTime),
      ),
    )
    if (!roles.length) return { perms: [], openAll: false }

    const perms = [
      ...new Set(roles.flatMap((r) => parseUserRolePerms(r.perms))),
    ]
    return { perms, openAll: false }
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

  override async add(data: unknown, options?: Parameters<BaseService['add']>[1]) {
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      if (raw != null && typeof raw === 'object') {
        this.normalizePerms(raw as Record<string, unknown>)
      }
    }
    return super.add(data, options)
  }

  override async update(
    whereOrData: Parameters<BaseService['update']>[0],
    data?: unknown,
  ) {
    if (data !== undefined) {
      if (data != null && typeof data === 'object' && !Array.isArray(data)) {
        this.normalizePerms(data as Record<string, unknown>)
      }
      return super.update(whereOrData as never, data)
    }
    const rows = Array.isArray(whereOrData)
      ? whereOrData
      : [whereOrData as Record<string, unknown>]
    for (const row of rows) {
      this.normalizePerms(row)
    }
    return super.update(whereOrData)
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
      tenantId:
        data.tenantId == null || data.tenantId === ''
          ? null
          : Number(data.tenantId),
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
    if (data.tenantId === '' || data.tenantId == null) {
      data.tenantId = null
    } else if (data.tenantId != null) {
      data.tenantId = Number(data.tenantId)
    }
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

  override async update(
    whereOrData: Parameters<BaseService['update']>[0],
    data?: unknown,
  ) {
    if (data !== undefined) {
      if (data != null && typeof data === 'object' && !Array.isArray(data)) {
        this.prepareUserUpdate(data as Record<string, unknown>)
      }
      return super.update(whereOrData as never, data)
    }
    const rows = Array.isArray(whereOrData)
      ? whereOrData
      : [whereOrData as Record<string, unknown>]
    for (const row of rows) {
      this.prepareUserUpdate(row)
    }
    return super.update(whereOrData)
  }

  async delete(
    whereOrIds: Parameters<BaseService['delete']>[0],
    options?: Parameters<BaseService['delete']>[1],
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
    for (const roleId of roleIds) {
      await this.infoRoleRepo.create({ userId, roleId })
    }
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

  async modifyAfter(data: any, type: 'add' | 'update' | 'delete') {
    if (type !== 'update' || !this.pendingPassword || !data?.id) return

    const baUserId = String(data.id)
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
      accountId: String(data.email ?? baUserId),
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
