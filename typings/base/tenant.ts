/** 租户（商户） */
export type TenantRow = {
  id: number
  name: string
  code: string
  /** 绑定域名，如 a.example.com；按 Host 匹配 */
  domains: string[]
  status: number
  remark?: string | null
}

export type TenantCreateInput = {
  name: string
  code: string
  domains?: string[]
  status?: number
  remark?: string | null
}
