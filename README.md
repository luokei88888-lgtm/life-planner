# 人生规划

Local life planner for Windows: goals, habits, weekly reviews, and a private journal. Data stays on your computer.

在本机做人生规划的 Windows 桌面应用。没有账号、没有云端服务器，数据写在你电脑上的 SQLite 里。

当前版本 **1.0.0**。仓库是正式工程；早期可交互原型在 [`prototype/`](prototype/)。

## 能做什么

- **维度**：人生几个方面的评分与雷达图，可归档
- **目标**：人生 → 年 → 季 → 月 → 周，可写「为什么重要」、进度、状态变更
- **本周计划**：任务挂在周目标下，每日最多 3 个焦点，未完成可顺延
- **习惯**：挂在维度下，也可再挂同一维度的目标；支持补打最近 7 天
- **随记**：感悟 / 日记 / 吐槽，时间线浏览，可选挂维度或目标；复盘会带出对应时段的随记
- **复盘**：周、月、年。提交后该周任务只读
- **备份**：本机 `.bak` 轮转、JSON 导入导出（schema 1–3）、指定文件夹同步（如 OneDrive / NAS）
- **日历**：导出 ICS；应用内提醒（不走系统通知中心）
- **主题**：墨夜 · 星钟、宣纸 · 朱砂、苔径 · 松烟、暮色 · 绛霞、素雪 · 青瓷

安装包不做代码签名。若要 SmartScreen 少拦截，需自行购买证书后重打。

## 数据放在哪

安装后数据库在本机应用数据目录，**不进安装目录**：

```text
%APPDATA%\com.lifeplanner.app\life-planner.db
```

备份默认在同一目录下的 `backups\`。JSON 导入会先打一份本机快照再覆盖数据。导入旧备份时，schema `1` 和 `2` 仍可用；当前导出为 schema `3`（含随记）。

## 给使用者

1. 用 NSIS 安装包安装（当前用户，一般不需要管理员）
2. 首次打开会引导打分并可选创建第一条目标 / 习惯
3. 日常从首页、本周计划、习惯、随记进入；周末做周复盘

打包产物路径：

```text
src-tauri/target/release/bundle/nsis/
```

文件名形如 `人生规划_1.0.0_x64-setup.exe`。系统需要 WebView2，安装包可在缺少时下载运行时。

## 给开发者

需要：

- Node.js 18+
- Rust stable
- Visual Studio 2022 **C++ 生成工具**（MSVC），64 位

```bash
npm install
npm run tauri dev
```

Windows 上若 `link.exe` 找不到，先打开 **x64 Native Tools Command Prompt**，或执行 VS 的 `vcvars64.bat` 后再跑上面的命令。

```bash
npm run tauri:build
```

Rust 测试：

```bash
cd src-tauri
cargo test
```

前端类型检查：

```bash
npx tsc --noEmit
```

## 目标怎么挂

| 层级 | 上级 | 进行中上限 |
| --- | --- | --- |
| 人生 | 无 | 3 |
| 年度 | 人生可选 | 5 |
| 季度 | 必须有年度 | 5 |
| 月度 | 季度或年度 | 5 |
| 周 | 月度、季度或年度 | 7 |

任务只能挂在**周目标**下。习惯必须先选维度，目标可选且须同一维度。

随记日期不能是未来；正文最多 5000 字。删除目标时随记上的目标会解开，正文保留。

## 仓库结构

```text
contracts/catalog.json     前后端共用：主题、上限、错误码、导出版本
src/                       React 前端（HashRouter）
  lib/api.ts               唯一调用 Tauri 命令的入口
  shared/                  类型与常量（从 catalog.json 生成）
  features/                按页面拆分
src-tauri/
  migrations/              0001 起版本化 SQL
  src/commands/            命令，返回 Result<T, AppError>
  src/db/                  连接、迁移、种子
  src/backup.rs            导出 / 导入 / 轮转
prototype/                 早期静态原型，不参与打包
```

约定：

- 身份与权限只在本机、不信任前端传来的身份字段（本应用无多用户账号）
- 密钥不进前端、不进仓库
- Tauri 2 顶层 invoke 参数用 camelCase；嵌套结构体可同时接受 snake_case
- 集合名、枚举、错误码以 `contracts/catalog.json` 为准

## 技术栈

[Tauri 2](https://tauri.app/) + React + TypeScript + SQLite（`rusqlite` bundled，WAL）。

## License

尚未指定开源许可证。代码目前按该 GitHub 仓库的可见性公开，使用前请自行确认。
