# perf-profiler

> 基于检查点的性能分析器，将计时数据转化为可操作、AI 友好的报告。

[English](README.md) | 简体中文

![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=nodedotjs&logoColor=white)
![ESM](https://img.shields.io/badge/ESM-supported-4fc921)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)

**perf-profiler** 是一款零依赖的、专为 harness 与 agent 工程设计的性能分析器。它用轻量的 `perf_hooks` 检查点对管道的慢速阶段进行插桩——包括启动、查询（首 token 时间）以及无头模式下的每轮延迟——然后输出：

- 一份**人类可读的时间线**，包含 RSS/堆内存快照与慢操作警告；
- 一份**AI 友好的 JSON 报告**（`perf-profiler/report@1`），其中包含检测到的异常、排序后的瓶颈以及 AI agent 可以直接执行的、具体的修复建议。

无遥测、无隐藏采样、无运行时依赖——只是一个精简的 ESM 包。

## 特性

- **AI 原生输出** —— 固定 JSON schema，包含严重级别、阈值、原因和修复建议，设计用于直接管道式输入 AI agent 或 harness。
- **三种分析器，一个工具** —— 启动阶段、查询管道（TTFT）和无头模式每轮延迟共用同一套 perf_hooks 时间线和报告格式。
- **内存感知** —— 在详细模式下，每个检查点都会记录 RSS 与堆快照。
- **零依赖** —— 使用 TypeScript 编译为纯 ESM；可在 Node ≥ 18 和 Bun 上运行。
- **确定性** —— 通过 `PERF_PROFILE_*` 环境变量显式启用；无隐藏采样、无后台遥测。
- **harness 友好** —— 原始 JSON 管道输出（`--json`）、退出码透传、以及统一目录下的稳定文件输出。

## 目录

- [安装](#安装)
- [快速上手](#快速上手)
- [CLI 参考](#cli-参考)
- [AI 友好报告](#ai-友好报告)
- [库 API](#库-api)
- [配置](#配置)
- [工作原理](#工作原理)
- [贡献](#贡献)
- [许可证](#许可证)

## 安装

### 在项目中使用（推荐）

作为项目级开发依赖安装，这样 `perf` 命令就可以供脚本和 CI 使用，而不会污染全局环境：

```bash
npm install --save-dev perf-profiler
```

然后直接使用，或通过 `npx` 使用：

```bash
npx perf --help
perf run -- npm test
```

会安装两个命令名：日常使用用 `perf`，而 `perf-profiler` 是无冲突的全名——如果你的 PATH 中已有 `perf`（例如 Linux 的内核分析器），请使用全名。如果你愿意，也可以全局安装：`npm install -g perf-profiler`。

### 从源码构建

```bash
git clone https://github.com/HelloGGX/pref-profiler.git
cd pref-profiler
npm install
npm run build                     # 通过 TypeScript 生成 dist/
node dist/cli.js --help
```

### 作为库使用

```bash
npm install perf-profiler
```

该包附带编译好的 ESM 与 TypeScript 声明文件（`dist/`），因此库 API 可在 Node ≥ 18 和 Bun 中使用。

## 快速上手

### 分析任意命令

```bash
perf run -- npm test
perf run --json -- npm test    # AI 友好 JSON 报告
```

```text
task done
================================================================================
COMMAND PROFILE REPORT - node
================================================================================

[+     0.000ms] (+    0.000ms) run_start
[+  1878.300ms] (+ 1878.300ms) run_spawned
[+  2100.798ms] (+  222.498ms) run_exit

Wall time:        2100.798ms
Child CPU:        n/a (Linux only)
Exit code:        0
================================================================================
```

### 分析应用中的各个阶段

在启动或查询管道中放入检查点，然后读取报告：

```ts
import {
  profileCheckpoint,
  profileReport,
  getStartupAiReport,
} from 'perf-profiler'

// 在导入分析器模块之前设置 PERF_PROFILE_STARTUP=1
profileCheckpoint('app_entry')
profileCheckpoint('app_imports_loaded')
profileCheckpoint('app_ready')

profileReport() // 写入 <output-dir>/<sessionId>.txt 和 .json
const report = getStartupAiReport() // 供 harness 使用的结构化数据
```

运行并检查 JSON：

```bash
PERF_PROFILE_STARTUP=1 node your-app.js
perf report --dir ~/.perf-profiler/reports
```

## CLI 参考

```text
perf <command> [options]
```

| 命令 | 说明 |
| --- | --- |
| `demo` | 运行脚本化的分析演示：`--startup`（默认）、`--query` 或 `--headless` |
| `report` | 从输出目录打印报告文件（`.txt` / `.json`） |
| `run -- <cmd>` | 以时间线和摘要分析任意命令 |
| `help` | 显示帮助 |

### 全局 / 命令选项

| 选项 | 适用范围 | 说明 |
| --- | --- | --- |
| `--json` | `demo`、`report`、`run` | 输出 AI 友好 JSON 报告（`report` 时为原始输出，无表头） |
| `--out <dir>` | `demo` | 报告输出目录 |
| `--session-id <id>` | `demo` | 稳定的报告文件名 |
| `--dir <dir>` | `report` | 扫描指定目录，而非默认输出目录 |

### 示例

```bash
perf demo --query                     # 带 TTFT 拆分的文本报告
perf demo --query --json              # 同样的演示，AI 友好 JSON
perf demo --headless                  # 每轮延迟指标
perf report --dir /tmp/perf --json    # 原始 JSON，管道输入 AI agent
perf run -- node script.js arg1       # 分析一条命令
```

`run` 通过 `spawn(..., { shell: false })` 直接执行命令——不做 shell 重新解析，并且会透传子进程的退出码。在 Windows 上，如果需要 shell 特性或 `.cmd`/`.bat` shim，请使用 `cmd /c` 或 `powershell -Command`。子进程 CPU 时间与峰值 RSS 在 Linux 上从 `/proc` 采样；其他平台显示 `n/a (Linux only)`。

## AI 友好报告

JSON 报告是该工具与你的 AI agent 或 harness 之间的契约。它稳定、带版本号（`perf-profiler/report@1`），并且包含排查性能问题所需的一切，无需阅读原始日志。

```json
{
  "schema": "perf-profiler/report@1",
  "generatedAt": "2026-08-06T12:00:00.000Z",
  "sessionId": "abc-123",
  "mode": "query",
  "totals": { "totalMs": 733.7, "checkpointCount": 19 },
  "checkpoints": [
    {
      "name": "query_user_input_received",
      "totalMs": 0,
      "deltaMs": 0,
      "rssBytes": 52848230,
      "heapUsedBytes": 6029304
    }
  ],
  "phases": [
    {
      "name": "Tool schemas",
      "start": "query_tool_schema_build_start",
      "end": "query_tool_schema_build_end",
      "durationMs": 78,
      "sharePct": 10.6
    }
  ],
  "anomalies": [
    {
      "severity": "warning",
      "checkpoint": "query_tool_schema_build_end",
      "durationMs": 78,
      "thresholdMs": 50,
      "reason": "Known bottleneck \"query_tool_schema_build_end\" exceeds 50ms",
      "suggestion": "Cache tool schemas or build them lazily instead of regenerating per query."
    }
  ],
  "bottlenecks": [
    {
      "name": "Network TTFB",
      "durationMs": 171,
      "sharePct": 23.3,
      "suggestion": "Check endpoint latency, connection keep-alive, compression, and request timeouts."
    }
  ],
  "summary": "TTFT 437.8ms: pre-request overhead 268.6ms (61.4%), network latency 169.2ms (38.6%)",
  "suggestions": [
    "Cache tool schemas or build them lazily instead of regenerating per query.",
    "Check endpoint latency, connection keep-alive, compression, and request timeouts."
  ]
}
```

### 报告字段

| 字段 | 说明 |
| --- | --- |
| `checkpoints` | 每个检查点的累计时间、增量以及内存快照（详细模式） |
| `phases` | 语义化阶段（上下文加载、工具 schema、网络 TTFB……），包含耗时与占比 |
| `anomalies` | 检测到的问题：严重级别、原因、阈值以及具体的修复建议 |
| `bottlenecks` | 按耗时排序的前 5 个阶段，每个都带有针对性的建议 |
| `summary` | 一句话结论（例如 TTFT 在本地开销与网络延迟之间的拆分） |
| `suggestions` | 去重后的可执行建议，AI 可以按顺序执行 |

### 异常阈值

| 条件 | 严重级别 |
| --- | --- |
| 检查点增量 > 1000ms | `critical` |
| 检查点增量 > 100ms | `warning` |
| 已知瓶颈（工具 schema / 客户端创建 / git status）> 50ms | `warning` |
| 网络延迟 > 1000ms（query） | `critical` |
| 网络延迟 > 300ms（query） | `warning` |
| 首次响应时间 > 2000ms（headless） | `critical` |
| 查询开销 > 500ms（headless） | `warning` |
| 堆使用 > 512MB | `warning` |
| 非零退出码（run） | `critical` |

阈值和建议文本位于 [`src/analyze.ts`](src/analyze.ts)，你可以根据工作负载轻松调整。

### 错误报告

失败时命令一定以非零退出码结束；配合 `--json`，CLI 会输出可解析的错误文档，而不是临时拼凑的文本。这是失败命令的契约：

```json
{
  "schema": "perf-profiler/error@1",
  "errorType": "spawn_failed",
  "message": "Failed to start command: spawn ./missing ENOENT",
  "location": "run -- ./missing",
  "exitCode": 1,
  "suggestion": "Check that the command exists and is executable (e.g. `command -v <cmd>`)."
}
```

| `errorType` | 含义 |
| --- | --- |
| `invalid_args` | 未知命令/选项，或选项缺少值 |
| `spawn_failed` | 无法启动被分析的命令 |
| `file_not_found` | 请求的报告文件不存在 |
| `internal` | CLI 内部意外异常 |

每份错误报告都回答同一个三连问：`message`（错误是什么）、`location`（错误在哪里）、捕获到的 `stdoutTail`/`stderrTail` 加 `suggestion`（为什么错、下一步怎么做）。对于 `run`，子进程非零退出时仍然输出正常的 `perf-profiler/report@1`，并把捕获到的子进程输出挂在 `report.error` 上；`--json` 模式下子进程的 stdout/stderr 被转发到 stderr，保证 stdout 始终是干净的机器可读输出。

## 库 API

### 启动分析器

```ts
import { profileCheckpoint, profileReport, getStartupAiReport } from 'perf-profiler'

profileCheckpoint('app_entry')
profileCheckpoint('app_ready')
profileReport()
const report = getStartupAiReport() // AiReport | null
```

### 查询分析器

```ts
import {
  startQueryProfile,
  queryCheckpoint,
  endQueryProfile,
  getQueryAiReport,
} from 'perf-profiler'

startQueryProfile()
queryCheckpoint('query_context_loading_start')
// ... 管道各阶段 ...
queryCheckpoint('query_first_chunk_received') // TTFT
endQueryProfile()
const report = getQueryAiReport()
```

### 无头分析器

```ts
import {
  setNonInteractiveSession,
  headlessProfilerStartTurn,
  headlessProfilerCheckpoint,
  getHeadlessAiReport,
} from 'perf-profiler'

setNonInteractiveSession(true)
headlessProfilerStartTurn()
headlessProfilerCheckpoint('query_started')
headlessProfilerCheckpoint('first_chunk')
const report = getHeadlessAiReport()
```

### 遥测接收器

遥测默认关闭。你可以挂载自己的接收器来接收阶段指标：

```ts
import { setAnalyticsSink } from 'perf-profiler'

setAnalyticsSink((event, metadata) => {
  // event: "startup_perf" | "headless_latency"
  console.log(event, metadata)
})
```

## 配置

所有配置都基于环境变量，因此在 CI 与本地 harness 中表现一致：

| 变量 | 说明 |
| --- | --- |
| `PERF_PROFILE_STARTUP=1` | 启用启动 / 无头分析（确定性，无采样） |
| `PERF_PROFILE_QUERY=1` | 启用查询分析 |
| `PERF_OUTPUT_DIR=<dir>` | 报告输出目录（默认 `<config-home>/reports`） |
| `PERF_CONFIG_DIR=<dir>` | 配置主目录（默认 `~/.perf-profiler`） |
| `PERF_DEBUG=1` / `--debug` | 向 stderr 写入调试日志 |

## 工作原理

```text
插桩                           分析                          报告
────────────────────────      ──────────────────────────       ───────────────────────────
profileCheckpoint(name)   →   checkpoints + phases        →   <sessionId>.txt  (人类可读)
       │                       anomalies (severity,             <sessionId>.json (AI)
       ▼                       thresholds, suggestions)
perf_hooks marks +        →   bottlenecks (top 5)         →   perf-profiler/report@1
memory snapshots
```

三种分析器共用同一条 perf_hooks 时间线（[`src/base.ts`](src/base.ts) 中的 `getPerformance()`），并馈入同一套分析管道（[`src/analyze.ts`](src/analyze.ts)），因此无论分析启动、查询还是无头轮次，输出格式都保持一致。

## 贡献

欢迎贡献！请保持简洁：

1. Fork 本仓库并创建功能分支。
2. 提交前运行 `npm run build` 和 `npm test`。
3. 提交 pull request，并在说明中描述改动以及任何阈值 / schema 更新。

## 许可证

[MIT](LICENSE)
