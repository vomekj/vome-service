import { and, eq, inArray, isNull } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { CommException, Provide } from '/#/server'
import type { UserAuthz } from '../../../../typings/user/permission'
import { InjectRepository, type Repository } from '/#/server'
import { BaseService } from '/#/server'
import { userAccount } from '../entity/account'
import { userInfo } from '../entity/info'
import { parseUserRolePerms, userRole } from '../entity/role'
import { userInfoRole } from '../entity/info-role'

@Provide()
export class UserPermissionService extends BaseService {
  @InjectRepository(userInfoRole)
  infoRoleRepo: Repository<typeof userInfoRole>
  @InjectRepository(userRole)
  roleRepo: Repository<typeof userRole>

  /** 前端用户权限码汇总；未绑角色时 openAll=true */
  async getUserAuthz(userId: string): Promise<UserAuthz> {
    const links = await this.infoRoleRepo.find(eq(userInfoRole.userId, userId))
    if (!links.length) return { perms: [], openAll: true }

    const roleIds = links.map((l) => l.roleId)
    const roles = await this.roleRepo.find(
      and(
        inArray(userRole.id, roleIds),
        eq(userRole.status, 1),
        isNull(userRole.deletedAt),
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

  async modifyBefore(data: any, type: 'add' | 'update' | 'delete') {
    if (type === 'add' || type === 'update') {
      if (Array.isArray(data.perms)) {
        data.perms = JSON.stringify(data.perms)
      } else if (data.perms != null && typeof data.perms !== 'string') {
        data.perms = '[]'
      }
    }
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
    await this.modifyBefore(data, 'add')

    const email = String(data.email ?? '').trim()
    const name = String(data.name ?? '').trim()
    const password = String(data.password ?? '')
    if (!email) throw new CommException('邮箱不能为空')
    if (!name) throw new CommException('名称不能为空')
    if (!password) throw new CommException('新增用户请填写密码')

    const userId = crypto.randomUUID()
    const row = await this.infoRepo.create({
      id: userId,
      name,
      email,
      emailVerified: Boolean(data.emailVerified ?? false),
      image: data.image ? String(data.image) : null,
      tenantId:
        data.tenantId == null || data.tenantId === ''
          ? null
          : Number(data.tenantId),
    })

    await this.accountRepo.create({
      id: crypto.randomUUID(),
      userId,
      accountId: email,
      providerId: 'credential',
      password: await hashPassword(password),
    })

    await this.modifyAfter(row, 'add')
    return row
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
    const ids = this.resolveUserIds(whereOrIds)
    if (!ids.length) return
    await this.infoRoleRepo.forceDelete(inArray(userInfoRole.userId, ids))
  }

  async getRoleIds(userId: string) {
    const rows = await this.infoRoleRepo.find(eq(userInfoRole.userId, userId))
    return rows.map((r) => r.roleId)
  }

  async setRoles(userId: string, roleIds: number[]) {
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

  /** userId → 角色名（逗号分隔） */
  async buildRoleNameMap() {
    const links = await this.infoRoleRepo.find(isNull(userInfoRole.deletedAt))
    const roles = await this.roleRepo.find(isNull(userRole.deletedAt))
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

  async modifyBefore(data: any, type: 'add' | 'update' | 'delete') {
    if (type === 'add') return

    if (type === 'update') {
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
      return
    }
  }

  async modifyAfter(data: any, type: 'add' | 'update' | 'delete') {
    if (type !== 'update' || !this.pendingPassword || !data?.id) return

    const userId = String(data.id)
    const hashed = await hashPassword(this.pendingPassword)
    this.pendingPassword = null

    const accounts = await this.accountRepo.find(
      and(eq(userAccount.userId, userId), eq(userAccount.providerId, 'credential')),
    )
    if (accounts[0]) {
      await this.accountRepo.update(eq(userAccount.id, accounts[0].id), {
        password: hashed,
      })
      return
    }

    await this.accountRepo.create({
      id: crypto.randomUUID(),
      userId,
      accountId: String(data.email ?? userId),
      providerId: 'credential',
      password: hashed,
    })
  }

  private resolveUserIds(whereOrIds: unknown): string[] {
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
