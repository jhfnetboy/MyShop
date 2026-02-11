# 本地一键演示（A）

## 目标

一条命令跑通：

- 启动 anvil
- 部署 demo 合约并生成 `demo/demo.json`
- 启动 worker（监听 Purchased + 提供 permit API）
- 通过 worker 申请 `SerialPermit`，完成一次购买并看到 worker 输出

## 依赖

- foundry：`anvil` / `forge` / `cast`
- node + pnpm

## 运行

在仓库根目录：

```bash
bash scripts/demo_local.sh
```

脚本会使用 anvil 默认账户私钥（可通过环境变量覆盖）：

- `DEPLOYER_PK`
- `BUYER_PK`
- `RISK_SIGNER_PK`
- `SERIAL_SIGNER_PK`

并生成：

- `demo/demo.json`：包含本次演示的合约地址与 `itemId`

## 你会看到什么

脚本完成后，worker 会在 stdout 打印一条 JSON（Purchased + 链上补充的 item/shop 信息）。
