# ENS 集成（独立设计文档）

## 设计目标

- 为社区与店铺提供可读域名入口，提升可读性与可信度
- 对外不影响现有服务流程；作为加分项独立推进
- 统一以 contenthash 指向 IPFS 页面，前端可直接打开

## 命名与分配

- 平台基域：`aastar.eth`（示例）
- 社区子域：`<community>.aastar.eth`
- 店铺子域：`<shop>.aastar.eth` 或 `<community>-<shop>.aastar.eth`

## 解析策略

- resolver 设置 `contenthash` → 对应店铺主页或前端路由的 IPFS CID
- `text` 记录（可选）：`shopId`, `itemsAddress`, `workerUrl`, `docs` 等键值
- 服务入口：可为 `worker.<community>.aastar.eth` 设置 CNAME/ALIAS 指向 Worker 域

## 集成方式

- 合约：MyShops 的 `metadataHash` 可包含 ENS 名称（未来扩展字段，不影响现有流程）
- 前端：店主后台展示并链接 ENS 名称；解析 `contenthash` 打开 IPFS 页面
- 文档：类别元数据与验收文档采用 ENS/IPFS 作为首选入口

## 运维流程

1. 平台注册与配置基域 resolver
2. 社区申请子域并配置 `contenthash` 指向社区主页 CID
3. 店主申请子域并配置 `contenthash` 指向店铺主页 CID
4. CI 发布后更新对应域名的 `contenthash`

## 注意事项

- contenthash 的 CID 变更需跟随页面发布流程
- 保障 resolver 与域名管理权限的安全与审计
- 不影响现有 HTTP 与 IPFS 网关访问路径
