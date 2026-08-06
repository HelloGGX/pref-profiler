# perf-profiler

从 Claude Code 源码快照（`claude-wiki`）中提取的性能检测代码，打包成零运行时依赖的独立 CLI 工具 + TypeScript 库。

提取自以下原始模块（逻辑保持原样，仅替换了 Claude 内部依赖）：

| 独立模块 | 原始文件 | 用途 |
| --- | --- | --- |
| `base.ts` | `src/utils/profilerBase.ts` | 共享 perf_hooks 时间线、报告行格式化 |
| `startup.ts` | `src/utils/startupProfiler.ts` | 启动阶段检测（`profileCheckpoint` / `profileReport`），含内存快照 |
| `query.ts` | `src/utils/queryProfiler.ts` | 查询管线检测（输入到首 token / TTFT），含阶段分解与慢操作告警 |
| `headless.ts` | `src/utils/headlessProfiler.ts` | 非交互（headless）模式逐轮延迟检测 |

## 构建与运行

```bash
# 依赖 Node.js >= 18，TypeScript 编译器取自仓库根目录的 node_modules
node_modules/.bin/tsc.exe -p perf-profiler
node perf-profiler/dist/cli.js --help
```

也可以 `npm link`（或 `npm install -g` 本目录）后将 `perf-profiler` 加入 PATH。

## CLI 用法

### demo - 生成演示报告

演示三种检测场景，输出与原始格式一致：

```bash
node perf-profiler/dist/cli.js demo                       # 启动检测演示（默认）
node perf-profiler/dist/cli.js demo --query               # 查询管线演示（TTFT 分解）
node perf-profiler/dist/cli.js demo --headless            # 非交互模式逐轮延迟演示
node perf-profiler/dist/cli.js demo --session-id test1 --out /tmp/perf
```

### report - 读取检测报告

详细模式写入的报告（`<config-home>/startup-perf/<sessionId>.txt`）可直接查看：

```bash
node perf-profiler/dist/cli.js report                     # 扫描默认输出目录
node perf-profiler/dist/cli.js report --dir /tmp/perf     # 指定目录（按修改时间倒序）
node perf-profiler/dist/cli.js report /path/to/a.txt      # 直接指定文件
```

### run - 检测任意命令

用同一条 perf_hooks 时间线包裹任意命令，输出时间线 + 汇总：

```bash
node perf-profiler/dist/cli.js run -- node script.js arg1
node perf-profiler/dist/cli.js run -- npm test
```

命令直接以 `spawn(..., { shell: false })` 执行（不经过 shell，参数不做二次解析）。Windows 上如需 shell 特性或 `.cmd`/`.bat` 包装脚本，请显式使用 `cmd /c` 或 `powershell -Command`。子进程退出码会原样透传给工具本身。CPU/峰值 RSS 仅在 Linux 上通过 `/proc` 采样，其他平台显示 `n/a (Linux only)`。

## 作为库使用

```ts
import { profileCheckpoint, profileReport } from 'perf-profiler'
// 任意初始化阶段打点（需先启用详细模式，见下方环境变量）
profileCheckpoint('app_entry')
profileCheckpoint('app_imports_loaded')
profileReport() // 写入 <output-dir>/<sessionId>.txt 并打印
```

```ts
import { startQueryProfile, queryCheckpoint, endQueryProfile } from 'perf-profiler'
startQueryProfile()
queryCheckpoint('query_context_loading_start')
// ... 查询管线各阶段
queryCheckpoint('query_first_chunk_received') // TTFT
endQueryProfile()
```

```ts
import {
  setNonInteractiveSession,
  headlessProfilerStartTurn,
  headlessProfilerCheckpoint,
  getHeadlessTurnMetrics,
} from 'perf-profiler'
setNonInteractiveSession(true)
headlessProfilerStartTurn()
headlessProfilerCheckpoint('query_started')
headlessProfilerCheckpoint('first_chunk')
console.log(getHeadlessTurnMetrics())
```

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `PERF_PROFILE_STARTUP=1` | 开启详细启动/headless 检测（别名：`CLAUDE_CODE_PROFILE_STARTUP=1`，与原版兼容） |
| `PERF_PROFILE_QUERY=1` | 开启查询检测（别名：`CLAUDE_CODE_PROFILE_QUERY=1`） |
| `PERF_OUTPUT_DIR=<dir>` | 详细报告输出目录（默认 `<config-home>/startup-perf`） |
| `PERF_CONFIG_DIR=<dir>` | 配置目录（默认 `$CLAUDE_CONFIG_DIR` 或 `~/.claude`） |
| `PERF_DEBUG=1` / `--debug` | 调试日志输出到 stderr |

详细报告格式与原版一致：

```
================================================================================
STARTUP PROFILING REPORT
================================================================================

[+  34.158ms] (+ 34.158ms) profiler_initialized | RSS: 50.8MB, Heap: 5.7MB
[+  34.320ms] (+  0.162ms) cli_entry | RSS: 50.8MB, Heap: 5.7MB
...
Total startup time: 387.934ms
================================================================================
```

## 与原版的差异

- **遥测**：原版通过 `services/analytics`（Statsig）上报，且有采样率；本工具默认完全不发任何数据，保留采样决策逻辑，可通过 `setAnalyticsSink()` 挂接自己的上报函数接收 `tengu_startup_perf` / `tengu_headless_latency` 指标。
- **调试日志**：原版写入 `~/.claude/debug/<sessionId>.txt` 并受 `USER_TYPE=ant` / `--debug` 控制；本工具改为写入 stderr（`PERF_DEBUG=1` 或 `--debug`）。
- **会话 ID**：原版来自 `bootstrap/state.ts`；本工具用 `crypto.randomUUID()` 生成，可用 `setSessionId()` 覆盖（例如 CLI 的 `--session-id`）。
- **headless 判定**：原版由全局会话状态决定；本工具需显式调用 `setNonInteractiveSession(true)`。
- **文件写入**：原版 `writeFileSync_DEPRECATED`（带 fsync）等价替换为 `openSync + writeFileSync + fsyncSync + closeSync`。
- **入口点**：原版 `CLAUDE_CODE_ENTRYPOINT` 语义保留为 `PERF_ENTRYPOINT`。
- **符号**：`⚠️`、`█` 等字符保持原字节（原仓库文件本身是正确的 UTF-8，仅为终端显示乱码）。
- **新增**：`getQueryProfileReport()`、`getHeadlessTurnMetrics()` 从私有改为公开导出，便于直接嵌入；CLI 的 `run` / `report` / `demo` 子命令。

## 测试

```bash
node --test perf-profiler/test/smoke.test.js
```
