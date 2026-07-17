/** 前端用户鉴权（无菜单树，仅权限码） */
export type UserAuthz = {
  perms: string[]
  /** 未绑定任何角色时为 true，客户端应放开全部 app 路由 */
  openAll: boolean
}
