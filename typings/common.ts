/**
 * 宽松对象类型：在固定字段基础上允许追加任意属性
 */
export type Loose<T extends object> = T & { [key: string]: any }
