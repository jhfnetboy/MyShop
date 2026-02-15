# Changelog

记录 MyShop 仓库的可读变更历史。

## [2026-02-15]

### Added
- 前端 Plaza：新增 community owner 过滤（可按 owner 地址筛选 Shop/Item）
- 购买记录视图：补充 action/nft/tokenURI 摘要展示；Item 详情页新增 actionData 摘要
- 文档验收：新增“5.6 广场社区过滤与动作/NFT 明细”验收步骤

### Changed
- 合约售卖风控：APNTsSale / GTokenSale 增加价格保护
  - 设置费率支持延时生效（24h timelock）
  - 购买时增加最大滑点校验（100 bps）
- 测试用例：补充 timelock 与滑点相关断言（Sales.t.sol）
- Worker API：/purchases 增加来源切换（index/chain）与风险汇总摘要（topBuyers/topItems 等）

### Notes
- 前端新增 eslint 配置文件以统一浏览器全局声明
- 对齐 docs/acceptance_md.md 的产品验收路径，确保 Plaza/Item/Purchases 三视图一致输出
