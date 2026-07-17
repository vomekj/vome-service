/** 菜单类型：0 菜单（原目录，展开下级）/ 1 页面（原菜单）/ 2 权限 */
export type MenuType = 0 | 1 | 2

export type AdminAuthz = {
  isSuper: boolean
  perms: string[]
  /** 可见菜单（含目录），按 orderNum */
  menus: MenuTreeNode[]
  /** 是否开启多租户 */
  tenantEnabled?: boolean
  /**
   * 数据范围：all=全部 / none=无可见部门 / custom=限定部门
   * 超管恒为 all
   */
  dataScope?: 'all' | 'none' | 'custom'
  /** custom 时已展开（含 relevance 子部门）的部门 ID */
  dataScopeDeptIds?: number[]
}

export type MenuTreeNode = {
  id: number
  parentId: number | null
  name: string
  router: string | null
  perms: string | null
  type: number
  icon: string | null
  orderNum: number
  viewPath: string | null
  remoteName: string | null
  remoteEntry: string | null
  remoteModule: string | null
  appKey: string | null
  keepAlive: boolean
  isShow: boolean
  children?: MenuTreeNode[]
}
