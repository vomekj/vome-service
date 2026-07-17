/** data() 返回：类型 key → 扁平条目（含 parentId，前端/服务再组树） */
export type DictDataResult = Record<string, DictInfoItem[]>

/** 单条字典信息（name=展示名，value=存值） */
export type DictInfoItem = {
  id: number
  name: string
  /** 展示名 */
  label: string
  typeId: number
  parentId: number | null
  orderNum: number
  value: unknown
  children?: DictInfoItem[]
}
