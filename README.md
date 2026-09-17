# 人生规划

本地 Windows 人生规划工具。数据存在本机 SQLite。完整版包含人生目标、习惯挂目标、年复盘、五种主题、应用内提醒、ICS 日历导出，以及用户指定目录的文件夹同步（OneDrive / NAS）。不含托管账号云服务；安装包代码签名需要你自行购买证书。

可交互原型在 `prototype/`，当前仓库是正式工程。

## 开发

需要：Node.js 18+、Rust stable、Visual Studio 2022 的 C++ 生成工具。

```bash
cd D:\work\vibecoding\life-planner
npm install
npm run tauri dev
```

打包当前用户安装的 Windows 安装包（不需要管理员权限）：

```bash
npm run tauri:build
```

产物是 `src-tauri/target/release/bundle/nsis/` 下的 `setup.exe`。安装后数据在本机应用数据目录，不会进安装目录。

## 结构

- `src/` 前端，按功能模块划分，只通过 `src/lib/api.ts` 调后端
- `src-tauri/src/commands/` 暴露给前端的命令
- `src-tauri/src/db/` 连接、迁移、种子数据
- `src-tauri/migrations/` 版本化 SQL
- `src/shared/constants.ts` 与后端错误码、主题枚举对齐
