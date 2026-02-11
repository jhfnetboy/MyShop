# echoRank Community NFT Developer Guide 🚀 (CN/EN)

[中文版](#chinese-version) | [English Version](#english-version)

---

<a name="chinese-version"></a>
## 开发者指南 (Chinese Version)

本指南旨在帮助开发者快速上手 echoRank 的社区 NFT 体系，实现从“注册社区”到“通过 AI Agent 铸造 SBT”的完整闭环。

### 1. 核心合约地址 (Sepolia)

这些地址已经过审计并部署在 Sepolia 测试网。对于大多数开发者，这些是固定不变的：

| 合约名称 | 合约地址 | 说明 |
| :--- | :--- | :--- |
| **Registry** | `0x7Ba70C5bFDb3A4d0cBd220534f3BE177fefc1788` | 核心注册表，管理所有实体角色 |
| **NFT Factory** | `0x1D23352390FfA1634D5eE80ebD2c5C217250d8B9` | 用于一键 Clone 部署社区自己的 NFT 合约 |
| **Logic Impl** | `0xD18c88a9102cb61E2361240854b83e4E6D91539` | NFT 的核心逻辑实现合约 |

### 🚀 验证与试点 (Evidence of Success)

为了验证工厂与 SDK 逻辑，我们完成了安妮 (Anni) 社区的完整开通流程：
- **Anni 社区合约**: [`0x0c8EcCD5B98AfdBae8b282Ae98F4f4FFCcF9e560`](https://sepolia.etherscan.io/address/0x0c8EcCD5B98AfdBae8b282Ae98F4f4FFCcF9e560)
- **Token #0 (可转让)**: [`查看 Mint 记录`](https://sepolia.etherscan.io/tx/0x915c2ec5b086782ff1907b22a613568c04902cd909c063b40e796030999da8c9) —— 由安妮亲自铸造。
- **Token #3 (SBT)**: [`查看 Mint 记录`](https://sepolia.etherscan.io/tx/0x823755af5555be7d9d6ae5f0a9a302ca79a4c1088350738754806a8f6db4bbc2) —— 由 AI Agent 自动化铸造，永久不可转让。


---

### 2. 准备工作 (Onboarding)

在你部署自己的社区 NFT 之前，你（社区主人）必须在 `Registry` 中拥有 `ROLE_COMMUNITY` 角色。

#### Step A: 获取入场券 (Governance Tokens)
echoRank 使用质押治理模式。你首先需要通过 AAstar SDK 的 **Faucet** 获取测试网治理代币。
1.  参考 `aastar-sdk/scripts/test-faucet-and-gasless.ts`。
2.  使用 `SepoliaFaucetAPI.prepareTestAccount` 方法。
3.  这会为你的 EOA 账户充值测试 ETH 和用于质押的 Governance Tokens。

#### Step B: 注册社区
在拥有代币后，调用 `Registry.registerCommunity()`。成功后，你的地址将在链上被标记为受信任社区。

---

### 3. 快速发行你的社区 NFT

一旦你拥有了角色，你可以直接使用我们提供的原子化脚本进行发行（位于 `contracts/script/`）：

#### 第一步：部署社区合约
运行 `Step1_Anni_Deploy.s.sol`。
- **业务动作**: 通过 Factory 克隆出一个全新的 NFT 合约。
- **模式建议**: 选择 `HYBRID` 模式，以支持通用的可转让 NFT 和不可转让的 SBT。

#### 第二步：配置 AI Agent
运行 `Step2_Anni_AuthAgent.s.sol`。
- **业务动作**: 将你的 AI Agent 地址授权为 `MINTER_ROLE`。
- **意义**: 这样你的后端 Agent 就可以在无需你亲自干预的情况下，根据活动反馈自动为用户铸造 NFT。

#### 第三步：灵活铸造
使用 `Step3` 和 `Step4` 脚本进行测试：
- **可转让 NFT**: 用于奖励、门票。
- **SBT (Soulbound)**: 用于声誉证明。在铸造时将 `isSoulbound` 参数设为 `true`，合约将永久禁止该 Token 的转让。

---

### 4. 常见问题 (FAQ)

**Q: 为什么我无法调用 Factory 部署合约？**
A: 请确保你的地址已在 `Registry` 中注册。Factory 会实时校验身份角色。

**Q: 我可以直接修改 NFT 的逻辑吗？**
A: 如果你有特殊需求，可以修改 `src/CommunityNFT.sol` 并重新部署实现合约。

---

<a name="english-version"></a>
## Developer Guide (English Version)

This guide helps developers get started with the echoRank Community NFT system, covering the cycle from registration to automated SBT minting via AI Agents.

### 1. Core Contract Addresses (Sepolia)

These addresses are audited and deployed on the Sepolia Testnet.

| Contract Name | Address | Description |
| :--- | :--- | :--- |
| **Registry** | `0x7Ba70C5bFDb3A4d0cBd220534f3BE177fefc1788` | Core registry managing all entity roles |
| **NFT Factory** | `0x1D23352390FfA1634D5eE80ebD2c5C217250d8B9` | Used for one-click clone deployment of community NFTs |
| **Logic Impl** | `0xD18c88a9102cb61E2361240854b83e4E6D91539` | Core logic implementation for NFTs |

### 🚀 Evidence of Success (Sepolia Verified)

To verify the Factory & SDK logic, we completed Anni's community onboarding:
- **Anni Community NFT**: [`0x0c8EcCD5B98AfdBae8b282Ae98F4f4FFCcF9e560`](https://sepolia.etherscan.io/address/0x0c8EcCD5B98AfdBae8b282Ae98F4f4FFCcF9e560)
- **Token #0 (Movable)**: [`View Mint Tx`](https://sepolia.etherscan.io/tx/0x915c2ec5b086782ff1907b22a613568c04902cd909c063b40e796030999da8c9) —— Minted manually by Anni.
- **Token #1 (Soulbound)**: [`View Mint Tx`](https://sepolia.etherscan.io/tx/0x823755af5555be7d9d6ae5f0a9a302ca79a4c1088350738754806a8f6db4bbc2) —— Minted autonomously by AI Agent.

#### 📸 Live Demo Screenshots
**1. AI Analysis & Response**
![AI Response](../docs/images/bot_response.png)

**2. Auto-Mint Success**
![Mint Success](../docs/images/telegram_mint.png)

> **How to view the NFT Image?**
>
> **Method A: Web2 View (Visual)**
> Since OpenSea has deprecated testnets, please use these alternatives:
> 1. [**👀 View on Rarible Testnet**](https://testnet.rarible.com/token/sepolia/0x0c8EcCD5B98AfdBae8b282Ae98F4f4FFCcF9e560:3)
> 2. [**🔎 View on NFTScan**](https://sepolia.nftscan.com/0x0c8EcCD5B98AfdBae8b282Ae98F4f4FFCcF9e560/3)
> *(Both support dynamic SVG/Image rendering)*
>
> **Method B: Decentralized View (Source)**
> - **IPFS CID**: `bafkreihqmsnyn4s5rt6nnyrxbwaufzmrsr2xfbj4yeqgi6qdr35umzxiay`
> - **Gateway**: [ipfs.io/ipfs/baf...xiay](https://ipfs.io/ipfs/bafkreihqmsnyn4s5rt6nnyrxbwaufzmrsr2xfbj4yeqgi6qdr35umzxiay)



---

### 2. Onboarding Process

Before deploying your Community NFT, the owner must hold the `ROLE_COMMUNITY` role in the `Registry`.

#### Step A: Obtain Access (Governance Tokens)
echoRank uses a staking governance model. You must obtain testnet governance tokens via the AAstar SDK **Faucet**.
1.  Refer to `aastar-sdk/scripts/test-faucet-and-gasless.ts`.
2.  Use the `SepoliaFaucetAPI.prepareTestAccount` method.
3.  This funds your EOA with test ETH and governance tokens for staking.

#### Step B: Register Community
Once you have tokens, call `Registry.registerCommunity()`. Upon success, your address is marked as a trusted community on-chain.

---

### 3. Quick Launch for Your Community NFT

Once authorized, use our atomic scripts in `contracts/script/`:

#### Step 1: Deploy Community Contract
Run `Step1_Anni_Deploy.s.sol`.
- **Action**: Clone a brand new NFT contract via the Factory.
- **Recommended Mode**: Use `HYBRID` mode to support both standard NFTs and SBTs.

#### Step 2: Configure AI Agent
Run `Step2_Anni_AuthAgent.s.sol`.
- **Action**: Grant `MINTER_ROLE` to your AI Agent address.
- **Significance**: Allows your backend Agent to autonomously mint NFTs based on event feedback.

#### Step 3: Flexible Minting
Test with `Step3` and `Step4` scripts:
- **Transferable NFT**: For rewards, tickets, etc.
- **SBT (Soulbound)**: For reputation proofs. Set `isSoulbound` to `true` during minting to permanently disable transfers.

---

### 4. FAQ

**Q: Why can't I call the Factory to deploy?**
A: Ensure your address is registered in the `Registry`. The Factory verifies roles in real-time.

**Q: Can I modify the NFT logic?**
A: For custom requirements, modify `src/CommunityNFT.sol` and redeploy the implementation contract.
