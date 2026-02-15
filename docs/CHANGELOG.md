# Changelog

记录 MyShop 仓库的可读变更历史。

## [2026-02-15]

### Added
- 前端 Plaza：新增 community owner 过滤（可按 owner 地址筛选 Shop/Item）
- 购买记录视图：补充 action/nft/tokenURI 摘要展示；Item 详情页新增 actionData 摘要
- 文档验收：新增“5.6 广场社区过滤与动作/NFT 明细”验收步骤
- 诊断页：新增风险摘要面板，按 totalPurchases 显示绿色/黄色/红色色标
- Purchases 页面：在 meta 区增加风险简要标注（绿色/黄色/红色）
- 风控评估页：增加风险色标徽章，统一视觉表达
- 文档：Solution.md 增加“店铺 NFT + 积分卡商品”购买说明（配置字段、签名串号、原子执行）
- 文档：新增“常用商品模板与抽象”，并在店主后台提供模板按钮与 MintERC20 actionData 生成器
- 合约：新增 MintERC721Action（支持 tokenURI / templateId 两种模式）
- 前端：配置页新增 ITEMS_ACTION_ADDRESS（MintERC20Action 地址），模板直接可用
- 前端：新增 MintERC721 actionData 生成器（两种编码模式）
- Worker：新增 /serial-permit-demo 示例页面（测试串号 Permit）
- 前端：NFT+NFT 模板自动读取 ERC721_ACTION_ADDRESS 填充 action
- 前端：新增模板按钮“NFT+NFT（按模板）”，自动生成 templateId 的 actionData

### Changed
- 合约售卖风控：APNTsSale / GTokenSale 增加价格保护
  - 设置费率支持延时生效（24h timelock）
  - 购买时增加最大滑点校验（100 bps）
- 测试用例：补充 timelock 与滑点相关断言（Sales.t.sol）
- Worker API：/purchases 增加来源切换（index/chain）与风险汇总摘要（topBuyers/topItems 等）

### Notes
- 前端新增 eslint 配置文件以统一浏览器全局声明
- 对齐 docs/acceptance_md.md 的产品验收路径，确保 Plaza/Item/Purchases 三视图一致输出
