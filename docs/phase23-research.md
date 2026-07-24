# Vera Phase 2/3 — Fireworks + Daytona API research

Docs read 2026-07-24. Every snippet below is copied verbatim from the cited URL. No API calls were made to any provider.

---

## 1. FIREWORKS

### 1.1 Base URL + OpenAI-compatible SDK

Source: https://docs.fireworks.ai/tools-sdks/openai-compatibility

> **Base URL:** `https://api.fireworks.ai/inference/v1`
> (Anthropic-compatible base URL is `https://api.fireworks.ai/inference` — no `/v1`.)

TypeScript/JavaScript client construction (verbatim, https://docs.fireworks.ai/getting-started/quickstart):

```bash
npm install openai
```

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

const response = await client.chat.completions.create({
  model: "accounts/fireworks/models/deepseek-v3p1",
  messages: [{ role: "user", content: "Say hello in Spanish" }],
});

console.log(response.choices[0].message.content);
```

REST path confirmed by the curl tab on the same page: `POST https://api.fireworks.ai/inference/v1/chat/completions` with `-H "Authorization: Bearer $FIREWORKS_API_KEY"`.

Model ID format is `accounts/fireworks/models/<slug>` — confirmed in every doc example (e.g. `accounts/fireworks/models/glm-5p2`, `accounts/fireworks/models/kimi-k2p5`, `accounts/fireworks/models/deepseek-v3p1`).

### 1.2 Current recommended models (verbatim)

Source: https://docs.fireworks.ai/guides/recommended-models — page footer says *"Last updated: July 2026"*.

Row **Code & Development → "Code generation, reasoning & agentic tasks"**, verbatim link text + slug from the href:

| Display name (verbatim) | Slug from the doc's link | Full model ID (format confirmed elsewhere in docs) |
| --- | --- | --- |
| DeepSeek V4 Pro | `deepseek-v4-pro` | `accounts/fireworks/models/deepseek-v4-pro` |
| Kimi K2.7 Code | `kimi-k2p7-code` | `accounts/fireworks/models/kimi-k2p7-code` |
| GLM 5.2 | `glm-5p2` | `accounts/fireworks/models/glm-5p2` |
| MiniMax M2.7 | `minimax-m2p7` | `accounts/fireworks/models/minimax-m2p7` |

Other rows: **"General reasoning & planning"** → DeepSeek V4 Pro, Kimi K2.6 (`kimi-k2p6`), GLM 5.2, GPT-OSS 120B *(medium)* (`gpt-oss-120b`). **"AI agents with tool use"** → Kimi K2.6, DeepSeek V4 Pro, GLM 5.2, MiniMax M2.7. **"Fast extraction, classification & search"** → DeepSeek V4 Flash (`deepseek-v4-flash`), MiniMax M2.5 (`minimax-m2p5`), Kimi K2.5 (`kimi-k2p5`), Step 3.7 Flash (`step-3p7-flash-nvfp4`), GPT-OSS 20B *(small)* (`gpt-oss-20b`). Migration table, **Claude Opus 4.8 / Sonnet 4.6 → coding/agentic, high latency budget** → DeepSeek V4 Pro, Kimi K2.7 Code, GLM 5.2, MiniMax M2.7, Qwen3.6 Plus (`qwen3p6-plus`).

CAVEAT (important): the recommended-models page prints only display names and links to `app.fireworks.ai/models/fireworks/<slug>`. It never prints the `accounts/fireworks/models/...` string for these specific models. The prefix is inferred from the universally-used ID format shown in every other Fireworks doc page. `accounts/fireworks/models/glm-5p2` appears literally in the quickstart, so GLM 5.2 is fully verified; the other three are format-inferred. **Verify with a single `GET /v1/models` or the model page before shipping.**

**Cost** — https://docs.fireworks.ai/serverless/pricing ("Per 1 million tokens in US dollars", each cell is `input / cached input / output`):

| Model | Standard | Priority |
| --- | --- | --- |
| Kimi K2.7 Code | $0.95 / $0.19 / $4.00 | $1.425 / $0.285 / $6.00 |
| Kimi K2.6 | $0.95 / $0.16 / $4.00 | $1.50 / $0.22 / $6.00 |
| DeepSeek V4 Pro | $1.74 / $0.145 / $3.48 | $2.61 / $0.218 / $5.22 |
| DeepSeek V4 Flash | $0.14 / $0.028 / $0.28 | $0.21 / $0.042 / $0.42 |
| GLM 5.2 | $1.40 / $0.14 / $4.40 | $1.75 / $0.18 / $5.50 |
| MiniMax M2.7 | $0.30 / $0.06 / $1.20 | $0.45 / $0.09 / $1.80 |
| OpenAI GPT OSS 120B | $0.15 / $0.015 / $0.60 | $0.18 / $0.018 / $0.72 |
| OpenAI GPT OSS 20B | $0.07 / $0.035 / $0.30 | — |

("Fast" variants also listed: Kimi K2.7 Code Fast $1.90/$0.38/$8.00, GLM 5.2 Fast $2.10/$0.21/$6.60, Kimi K2.6 Fast $2.00/$0.30/$8.00.) Batch inference is billed at 50% of serverless pricing.

**Context windows: NOT FOUND IN DOCS.** No context-window figures for these models exist on the recommended-models, pricing, or querying-text-models pages. https://docs.fireworks.ai/guides/querying-text-models says only: *"Most models support up to their full context window (e.g., 128K for DeepSeek R1)"* and *"Check the model's context window in the [Model Library](https://fireworks.ai/models)"*.

### 1.3 Structured output (JSON schema)

Source: https://docs.fireworks.ai/getting-started/quickstart — the only JS/TS structured-output example in the docs, verbatim:

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

const response = await client.chat.completions.create({
  model: "accounts/fireworks/models/deepseek-v3p1",
  messages: [
    {
      role: "user",
      content: "Extract the name and age from: John is 30 years old",
    },
  ],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "person",
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name", "age"],
      },
    },
  },
});

console.log(response.choices[0].message.content);
```

Exact parameter shape: `response_format: { type: "json_schema", json_schema: { name: <string>, schema: <JSON Schema object> } }`. The alternative is `response_format: { type: "json_object" }` (any valid JSON, no schema).

Rules from https://docs.fireworks.ai/structured-responses/structured-response-formatting:

- *"Include the schema in **both** your prompt and the `response_format` for best results. The model doesn't automatically 'see' the schema—it's enforced during generation."*
- *"Always instruct the model to produce JSON in your prompt. Without this, the model may generate whitespace indefinitely until hitting token limits."*
- *"If `finish_reason="length"`, the response may be truncated and invalid JSON. Increase `max_tokens` if needed."*
- *"Fireworks automatically prevents hallucinated fields by treating schemas with `properties` as if `"unevaluatedProperties": false` is set."*
- **Reasoning conflict:** *"Using `response_format` with `json_schema` disables reasoning output. To get both reasoning and structured JSON, include the schema in your prompt instead and omit the `response_format` parameter."*
- Supports JSON Schema 2020-12: types, `properties`/`required`/`additionalProperties`, `items`, length constraints, `pattern` (best-effort), `anyOf`/`allOf`/`oneOf`, `$defs`+`$ref`, recursion. **Not** supported: external `$ref` URIs. With Tool Calling, JSON mode is enabled automatically.
- Kimi-family note (https://docs.fireworks.ai/models/kimi-k2): *"always set `max_tokens` explicitly"* — suggested `1024–2048` for structured JSON output.

### 1.4 Auth / env vars

- Canonical env var: `FIREWORKS_API_KEY` (https://docs.fireworks.ai/getting-started/quickstart: `export FIREWORKS_API_KEY="your_api_key_here"`).
- REST header shape (https://docs.fireworks.ai/api-reference/introduction), verbatim:
  ```json
  authorization: Bearer <API_KEY>
  content-type: application/json
  ```
  *"All requests made to the Fireworks AI REST API must include an `Authorization` header with a valid `Bearer` token using your API key, along with the `Content-Type: application/json` header."*
- If you want the OpenAI SDK to pick up config implicitly, Fireworks documents overriding the OpenAI vars instead: `export OPENAI_API_BASE="https://api.fireworks.ai/inference/v1"` and `export OPENAI_API_KEY="<YOUR_FIREWORKS_API_KEY>"` (openai-compatibility page). For Vera, pass `apiKey`/`baseURL` explicitly — cleaner in a Next.js route.
- Keys are created at https://app.fireworks.ai/settings/users/api-keys or via `firectl api-key create`.

---

## 2. DAYTONA (TypeScript SDK — `@daytona/sdk`)

All Daytona citations: https://www.daytona.io/docs/llms-full.txt (mirrors https://www.daytona.io/docs/, generated 2026-07-24). Section anchors given per snippet.

### 2.1 Install + import + client construction

Section "Get started" / "TypeScript SDK Reference → Installation":

```bash
npm install @daytona/sdk
```

```typescript
// Import the Daytona SDK
import { Daytona } from '@daytona/sdk'

// Initialize the Daytona client
const daytona = new Daytona({ apiKey: 'YOUR_API_KEY' }) // Replace with your API key

// Create the Sandbox instance
const sandbox = await daytona.create()

// Run code
const response = await sandbox.process.codeRun('print("Hello World")')
console.log(response.result)
```

Config / env vars (section "TypeScript SDK Reference → Configuration"), verbatim:

```typescript
// Using environment variables (DAYTONA_API_KEY, DAYTONA_API_URL, DAYTONA_TARGET)
const daytona = new Daytona();

// Using explicit configuration
const daytona = new Daytona({
  apiKey: 'YOUR_API_KEY',
  apiUrl: 'https://app.daytona.io/api',
  target: 'us'
});
```

`DaytonaConfig` fields: `apiKey?`, `apiUrl?` (*"Defaults to 'https://app.daytona.io/api'"*), `jwtToken?`, `organizationId?`, `target?`, `otelEnabled?`, `useDeprecatedPolling?` (deprecated), `_experimental?`.

### 2.2 Create a sandbox (Python image / pandas)

**pandas is already preinstalled in the default snapshots.** Section "Snapshots → Default snapshots": *"Default snapshots include pre-installed Python and Node.js packages"* — the pip table lists `pandas v2.3.3`, `numpy v2.4.1`, `matplotlib v3.10.8`, `scipy v1.17.0`, `scikit-learn v1.8.0`, `seaborn v0.13.2`. **For Vera, no custom image is needed** — `daytona.create()` with the default (python) language gets pandas.

Default create + snapshot selection — `const sandbox = await daytona.create({ snapshot: 'daytona-small' })`. Default snapshots: `daytona-small` (1 vCPU / 1GiB / 3GiB), `daytona-medium` (2 / 4GiB / 8GiB), `daytona-large` (4 / 8GiB / 10GiB).

Language runtime (section "Create sandboxes → Languages"): *"The `language` parameter controls which programming language runtime is used for the sandbox. If omitted, it defaults to `python`."* Values: `python`, `typescript`, `javascript`. This is the runtime `codeRun` uses — leave it unset for Vera. Other create params of interest: `envVars: { ... }`, `labels: { ... }`.

Custom image + resources (`import { Daytona, Image } from '@daytona/sdk'`):

```typescript
const sandbox = await daytona.create({
  image: Image.base('ubuntu:22.04'),
  resources: { cpu: 2, memory: 4, disk: 8 },
})
```

Declarative image with extra pip packages (section "Declarative Builder → Build declarative images"), verbatim:

```typescript
// Define a declarative image with python packages
const declarativeImage = Image.debianSlim('3.12')
  .pipInstall(['requests', 'pytest'])
  .workdir('/home/daytona')

// Create a new sandbox with the declarative image and stream the build logs
const sandbox = await daytona.create(
  {
    image: declarativeImage,
  },
  {
    timeout: 0,
    onSnapshotCreateLogs: console.log,
  }
)
```

*"Declarative images are cached for 24 hours, and are automatically reused when running the same script."* Note this path goes through Building Snapshot → slow first run; prefer the default snapshot for Vera.

`create()` signature (TypeScript SDK Reference → Daytona → create()):

```ts
create(params?: CreateSandboxFromSnapshotParams, options?: {
  timeout: number;
}): Promise<Sandbox>
```

`CreateSandboxBaseParams` fields worth knowing: `autoStopInterval?`, `autoDeleteInterval?`, `autoArchiveInterval?`, `autoPauseInterval?`, `envVars?`, `labels?`, `language?`, `name?`, `ephemeral?`, `secrets?`, `ttlMinutes?`, `volumes?`, `networkBlockAll?`, `networkAllowList?`, `domainAllowList?`, `public?`, `user?`, `resources?` (image variant only), `snapshot?` (snapshot variant only).

### 2.3 Write a file into the sandbox

Signature (TypeScript SDK Reference → FileSystem → uploadFile()):

```ts
uploadFile(
   file: Buffer, 
   remotePath: string, 
timeout?: number): Promise<void>
```

- *"`remotePath` — Destination path in the Sandbox. Relative paths are resolved based on the sandbox working directory."*
- *"`timeout?` — Timeout for the upload operation in seconds. 0 means no timeout. Default is 30 minutes."*
- *"This method loads the entire file into memory, so it is not recommended for uploading large files."* (A `uploadFile(localPath: string, remotePath: string, timeout?)` overload streams from local disk; `uploadFiles(files: FileUpload[], timeout?)` batches.)

Verbatim examples:

```typescript
// Upload a single file
const fileContent = Buffer.from('Hello, World!')
await sandbox.fs.uploadFile(fileContent, 'data.txt')
```

Absolute paths work too — from the Daytona + Vercel AI SDK guide in the same docs:

```typescript
const path = `/tmp/_run_${randomUUID()}.${ext}`
await sandbox!.fs.uploadFile(Buffer.from(code, 'utf-8'), path)
```

Path convention: relative paths resolve against the sandbox working directory / user home (*"Git operations assume you are operating in the sandbox user's home directory (e.g. `workspace` implies `/home/[username]/workspace`). Use a leading `/` when providing absolute paths."*). Reading back: `const buf = await sandbox.fs.downloadFile(path)` → Buffer.

### 2.4 Execute code / shell command and read results

`codeRun` (runs in the sandbox's `language` runtime — python by default):

```ts
codeRun(
   code: string, 
   params?: CodeRunParams, 
timeout?: number): Promise<ExecuteResponse>
```

```typescript
// Run code with argv and environment variables
response = await sandbox.process.codeRun(
    `console.log(\`Hello, \${process.argv[2]}!\`);`,
    { 
      argv: ["Daytona"],
      env: { FOO: "BAR" }
    }
);
console.log(response.result);

// Run code with timeout (5 seconds)
response = await sandbox.process.codeRun(
    'setTimeout(() => console.log("Done"), 2000);',
    undefined,
    5
);
```

`executeCommand`:

```ts
executeCommand(
   command: string, 
   cwd?: string, 
   env?: Record<string, string>, 
timeout?: number): Promise<ExecuteResponse>
```

```typescript
// Execute any shell command
const response = await sandbox.process.executeCommand("ls -la");
console.log(response.result);

// Setting a working directory and a timeout
const response2 = await sandbox.process.executeCommand("sleep 3", "workspace/src", undefined, 5);

// Passing environment variables
const response3 = await sandbox.process.executeCommand("echo $CUSTOM_SECRET", ".", {
        "CUSTOM_SECRET": "DAYTONA"
    }
);
```

**What `response.result` contains** — `ExecuteResponse` type reference, verbatim properties:
`exitCode` _number_ — *"The exit code from the command execution"*; `result` _string_ — *"The output from the command execution"*; `artifacts?` _ExecutionArtifacts_ — which has `charts?` _Chart[]_ (*"List of chart metadata from matplotlib"*) and `stdout` _string_ (*"Standard output from the command, same as `result` in `ExecuteResponse`"*).

So: `result` === `artifacts.stdout`. **There is no separate `stderr` field on `ExecuteResponse`** — the docs' own error-handling example reads `response.result` as *"Error output"*, and the session-command API describes its `output` as *"Combined command output (stdout and stderr)"*. Treat `result` as combined output and branch on `exitCode`. Whether stderr is interleaved into `result` for `executeCommand` specifically: NOT FOUND IN DOCS — if you need clean separation, redirect inside the command (`2>/tmp/err`) and read the file back.

Error-handling pattern, verbatim:

```typescript
import { DaytonaError } from '@daytona/sdk'

try {
    const response = await sandbox.process.codeRun("invalid typescript code");
    if (response.exitCode !== 0) {
        console.error("Exit code:", response.exitCode);
        console.error("Error output:", response.result);
    }
} catch (e) {
    if (e instanceof DaytonaError) {
        console.error("Execution failed:", e);
    }
}
```

Matplotlib charts are stripped out of `result` into `artifacts.charts` (*"the SDK strips chart metadata from `result` and returns it in the `artifacts.charts` field"*) — relevant if Vera ever plots: `if (response.artifacts?.charts?.length) { const chart = response.artifacts.charts[0] }`.

### 2.5 Reusing a warm sandbox across requests

Get by id or name:

```typescript
const sandbox = await daytona.get('my-sandbox-id-or-name')
```

The docs' own reference pattern for per-session reattach-or-create (Daytona + Pi guide, verbatim):

```typescript
pi.on("session_start", async (event, ctx) => {
  const prev = lastSandboxFor(ctx); // recorded in a session entry on first run
  active = prev
    ? await daytona.get(prev.sandboxId) // resume → reattach
    : await daytona.create({
        labels: { "created-by": "pi-daytona", "session-id": sessionId },
      }); // new → create
});
```

Label-based discovery + reaping (same guide) — note `daytona.list()` is an **async iterable**, not an array, and `sandbox.labels` is readable:

```typescript
for await (const sandbox of daytona.list({ labels: { "created-by": "pi-daytona" } })) {
  const sessionId = sandbox.labels?.["session-id"];
  if (sessionId && !live.has(sessionId)) await sandbox.delete();
}
```

`await sandbox.setLabels({ team: 'platform', env: 'staging' })` updates labels after creation.

Lifecycle knobs (section "Automated lifecycle management") — lines below are verbatim, merged from the two adjacent auto-stop and auto-delete examples:

```typescript
const sandbox = await daytona.create({
  snapshot: 'my-snapshot-name',
  // Disables the auto-stop feature - default is 15 minutes
  autoStopInterval: 0,
  // Auto-delete after a sandbox has been stopped for 1 hour
  autoDeleteInterval: 60,
})

// Delete the sandbox immediately after it has been stopped
await sandbox.setAutoDeleteInterval(0)

// Disable auto-deletion
await sandbox.setAutoDeleteInterval(-1)
```

Semantics, verbatim from the param reference:
- `autoStopInterval` — minutes; `0` = disabled; **default 15 minutes**. *"The auto-stop triggers even if there are internal processes running in the sandbox."*
- `autoDeleteInterval` — minutes after being **stopped**; negative = disabled; `0` = delete immediately on stop; **by default auto-delete is disabled**.
- `autoArchiveInterval` — `0` = max interval; **default 7 days**.
- `autoPauseInterval` — VM sandboxes only, mutually exclusive with auto-stop.
- `ttlMinutes` — wall-clock TTL since creation regardless of state; `0` = disabled.
- `ephemeral: true` — *"autoDeleteInterval will be set to 0"* (deleted the moment it stops).

Teardown:

```typescript
await sandbox.delete()

// Block until the sandbox is destroyed
await sandbox.delete(60, true)
```

*"By default `delete` is fire-and-forget: it returns as soon as the API accepts the deletion request... Pass the `wait` flag to block until the sandbox reaches the destroyed state."* Also available: `sandbox.stop()`, `daytona.start(sandbox)` — a Stopped container sandbox keeps its filesystem on the runner and restarts into `Started`.

Recommended Vera shape: one long-lived sandbox with `autoStopInterval` set to a few minutes and `autoDeleteInterval` set, id cached in your app; `daytona.get(id)` per request, fall back to `create()` if it throws or reports a dead state (states include `Started`, `Stopped`, `Archived`, `Deleted`, `Error`).

### 2.6 Timeouts

| Operation | Default | How to set |
| --- | --- | --- |
| `daytona.create(params, options)` | **60 seconds** (*"Timeout in seconds (0 means no timeout, default is 60)"*) | `await daytona.create(params, { timeout: 120 })` |
| `process.executeCommand` | **10 seconds** (*"The default timeout is 10 seconds when not specified."*) | 4th arg, seconds: `executeCommand(cmd, undefined, undefined, 60)` |
| `process.codeRun` | NOT FOUND IN DOCS (reference says only *"Maximum time in seconds to wait"*) | 3rd arg, seconds: `codeRun(code, undefined, 30)` |
| `fs.uploadFile` | **30 minutes**; `0` = no timeout | 3rd arg, seconds |
| `sandbox.delete(timeout, wait)` | — | `await sandbox.delete(60, true)` |
| Stateful interpreter (`process/interpreter/execute`) | 600 seconds, `0` disables | `timeout` field in the WS message |

**The 10-second `executeCommand` default is the #1 footgun for Vera** — pandas on a non-trivial CSV will blow through it. Always pass an explicit timeout.

---

## 3. GOTCHAS FOR A NEXT.JS SERVER ROUTE

1. **Next.js is explicitly supported; Edge is not.** Verbatim (TypeScript SDK Reference → Multiple runtime support): *"The TypeScript SDK ships as a dual ESM/CJS package and works out of the box in **Node.js**, **Bun**, **Next.js**, **Nuxt.js**, **Remix**, **Vite SSR**, **AWS Lambda**, and **Azure Functions** without any extra configuration."* But: *"The SDK uses Node's `Buffer` for binary data (downloaded files, multipart bodies)"* and *"Some runtimes don't expose the full set of Node.js APIs (browsers and edge runtimes have no filesystem, no `crypto`, etc.). Methods that depend on those APIs throw a clear runtime error."* → **set `export const runtime = 'nodejs'` on the route**. (Cloudflare Workers needs `compatibility_flags = ["nodejs_compat"]`.)

2. **The SDK opens a WebSocket.** *"Starting with SDK version 0.198.0, the SDK streams sandbox state changes over a WebSocket (Socket.IO) connection by default... Each `Daytona` client opens a single WebSocket connection shared by all of its sandboxes."* Mitigations documented: *"The connection never keeps Node.js or Bun processes alive"* and it *"falls back to polling automatically"* if blocked, with *"Connection setup runs in the background and never throws."* Still — **construct one module-level `Daytona` client and reuse it**, don't `new Daytona()` per request, or you'll open a socket per invocation. `DAYTONA_USE_DEPRECATED_POLLING=true` / `new Daytona({ useDeprecatedPolling: true })` exists but is deprecated.

3. **Serverless request budget vs. sandbox timeouts.** Cold `create()` can take up to its 60s default (longer with a declarative image build: states `Pending Build → Building Snapshot → Creating → Started`). Combined with a pandas run this can exceed a platform function limit. Keep a warm sandbox (§2.5) and reserve `create()` for the miss path.

4. **Auto-stop kills long tasks.** Verbatim: *"If you run a long-running task like LLM inference that takes more than 15 minutes to complete without any external interaction, the sandbox may auto-stop mid-process because the process itself doesn't count as 'activity', therefore the timer is not reset."*

5. **Fireworks streaming usage stats** differ from OpenAI: *"For streaming responses, the `usage` field is returned in the very last chunk"*, and the OpenAI SDK types don't declare it — the docs' own TS workaround is `console.log((chunk as any).usage);`. For Vera's codegen call, non-streaming + `response_format` is simpler; note `json_schema` **disables reasoning output** on reasoning models.

6. **`max_tokens` truncation → invalid JSON.** With `response_format`, a `finish_reason: "length"` yields unparseable JSON. Set `max_tokens` explicitly (Kimi guide suggests 1024–2048 for structured JSON) and check `finish_reason` before `JSON.parse`.

7. **`daytona.list()` is an async iterable**, not an array — `for await (const sandbox of daytona.list(...))`. Easy TS mistake.

8. **Network egress from sandboxes is allow-listable** (`networkBlockAll`, `networkAllowList`, `domainAllowList`). Daytona's default allow-list already includes `api.fireworks.ai` and `api.elevenlabs.io` if you later lock a sandbox down.

9. **No stderr field.** Plan the error path around `exitCode !== 0` + `result`, not around a `stderr` property that doesn't exist (§2.4).

10. **SDK versions referenced in docs:** `@daytona/sdk` WebSocket streaming since **0.198.0**; Java SDK `io.daytona:sdk-java:0.1.0`; the Fireworks **Python** SDK is *"currently in alpha"* (`pip install --pre fireworks-ai`) — there is no first-party Fireworks TypeScript SDK, use `openai` (or `@anthropic-ai/sdk`) against the compatible endpoint.
