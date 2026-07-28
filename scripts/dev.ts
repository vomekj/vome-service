/**
 * dev 入口：每次进程启动（含 bun --watch 重启）先刷新 host-scan，再启动服务。
 * 与 core `scanHost` 的 disk 扫描互补：scan.ts 同步给 build；磁盘扫描保证 EPS 含新建实体。
 */
export {}
await import('./gen-host-scan.ts')
await import('../src/index.ts')
