# vault-core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared `vault-core` library that handles all vault git operations, approval record management, workflow config, and feature name inference — used by both the MCP server and desktop app.

**Architecture:** A pure TypeScript library with no UI dependencies. Wraps `simple-git` for all git operations. Exposes a `VaultManager` class as the primary entry point plus stateless helpers for approval and workflow logic.

**Tech Stack:** Node.js 20+, TypeScript 5+, simple-git 3+, vitest (tests), npm workspaces (monorepo)

## Global Constraints

- Node.js >= 20.0.0
- TypeScript strict mode enabled
- All approval history entries are append-only — never mutate existing entries
- Reviewer identity is always their git commit email (no separate user accounts)
- Vault is a standard git repo — no proprietary formats
- Feature names are kebab-case, inferred from source filename
- All dates are ISO 8601 UTC strings

---

## File Structure

```
signoff/
├── package.json                          # npm workspaces root
├── tsconfig.base.json                    # shared TS config
├── packages/
│   └── vault-core/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── types.ts                  # all shared TypeScript types
│       │   ├── feature.ts                # feature name inference from filename
│       │   ├── workflow.ts               # read/validate .signoff/workflows.json
│       │   ├── approval.ts               # read/write approval history JSON files
│       │   ├── git.ts                    # simple-git wrapper (init, commit, push, pull)
│       │   ├── vault.ts                  # VaultManager class (init vault, open, registry)
│       │   └── index.ts                  # public API re-exports
│       └── tests/
│           ├── feature.test.ts
│           ├── workflow.test.ts
│           ├── approval.test.ts
│           ├── git.test.ts
│           └── vault.test.ts
```

---

## Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `packages/vault-core/package.json`
- Create: `packages/vault-core/tsconfig.json`

**Interfaces:**
- Produces: working `npm install` + `npm run test` from repo root

- [ ] **Step 1: Create root package.json**

```json
// package.json
{
  "name": "signoff",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Create shared TypeScript base config**

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Create vault-core package.json**

```json
// packages/vault-core/package.json
{
  "name": "@signoff/vault-core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "simple-git": "^3.27.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 4: Create vault-core tsconfig.json**

```json
// packages/vault-core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Create placeholder src/index.ts**

```typescript
// packages/vault-core/src/index.ts
export const VERSION = "0.1.0";
```

- [ ] **Step 6: Install dependencies and verify**

```bash
cd /path/to/signoff
npm install
```

Expected: `node_modules` created, no errors.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd packages/vault-core && npm run typecheck
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.base.json packages/vault-core/
git commit -m "chore: scaffold monorepo and vault-core package"
```

---

## Task 2: Types

**Files:**
- Create: `packages/vault-core/src/types.ts`

**Interfaces:**
- Produces: all shared types used across every other task — import from `./types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// packages/vault-core/src/types.ts

export type DocumentType = "spec" | "plan";

export type ApprovalAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "resubmitted";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "not_found";

export interface ApprovalHistoryEntry {
  action: ApprovalAction;
  by: string;       // git commit email of the actor
  at: string;       // ISO 8601 UTC
  message: string | null;
}

export interface ApprovalRecord {
  document: string;           // e.g. "spec.md"
  feature: string;            // e.g. "user-auth"
  type: DocumentType;
  workflow: string;           // workflow key used, e.g. "spec"
  status: ApprovalStatus;
  history: ApprovalHistoryEntry[];
}

export interface WorkflowConfig {
  required_approvers: string[];   // git emails
  optional_approvers?: string[];
  min_approvals: number;
}

export interface VaultWorkflows {
  spec: WorkflowConfig;
  plan: WorkflowConfig;
}

export interface VaultConfig {
  name: string;
  org: string;
  created_at: string;   // ISO 8601 UTC
}

export interface VaultInfo {
  name: string;
  path: string;           // absolute path to vault directory
  last_opened: string;    // ISO 8601 UTC
}

export interface VaultsRegistry {
  vaults: VaultInfo[];
}

export interface PublishResult {
  vault_path: string;
  commit_sha: string;
}

export interface CheckApprovalResult {
  status: ApprovalStatus;
  approved_by?: string;
  approved_at?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/vault-core && npm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/vault-core/src/types.ts
git commit -m "feat(vault-core): add shared types"
```

---

## Task 3: Feature Name Inference

**Files:**
- Create: `packages/vault-core/src/feature.ts`
- Create: `packages/vault-core/tests/feature.test.ts`

**Interfaces:**
- Produces: `inferFeatureName(filename: string): string`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/vault-core/tests/feature.test.ts
import { describe, it, expect } from "vitest";
import { inferFeatureName } from "../src/feature.js";

describe("inferFeatureName", () => {
  it("extracts feature from dated design filename", () => {
    expect(inferFeatureName("2026-06-27-user-auth-design.md")).toBe("user-auth");
  });

  it("extracts feature from dated plan filename", () => {
    expect(inferFeatureName("2026-06-27-payment-gateway.md")).toBe("payment-gateway");
  });

  it("handles filename without date prefix", () => {
    expect(inferFeatureName("user-auth-design.md")).toBe("user-auth");
  });

  it("handles plain feature name", () => {
    expect(inferFeatureName("user-auth.md")).toBe("user-auth");
  });

  it("handles absolute paths by using only the basename", () => {
    expect(inferFeatureName("/home/dev/project/docs/specs/2026-06-27-user-auth-design.md")).toBe("user-auth");
  });

  it("lowercases the result", () => {
    expect(inferFeatureName("2026-06-27-UserAuth-design.md")).toBe("userauth");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/vault-core && npm test -- tests/feature.test.ts
```

Expected: FAIL — `inferFeatureName` not found.

- [ ] **Step 3: Implement feature.ts**

```typescript
// packages/vault-core/src/feature.ts
import path from "node:path";

// Strips date prefix (YYYY-MM-DD-), trailing -design/-spec/-plan suffix, and .md extension
export function inferFeatureName(filename: string): string {
  const basename = path.basename(filename, ".md");
  // Remove leading date prefix: YYYY-MM-DD-
  const withoutDate = basename.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  // Remove trailing -design, -spec, -plan suffixes
  const withoutSuffix = withoutDate.replace(/-(design|spec|plan)$/, "");
  return withoutSuffix.toLowerCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/vault-core && npm test -- tests/feature.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vault-core/src/feature.ts packages/vault-core/tests/feature.test.ts
git commit -m "feat(vault-core): add feature name inference"
```

---

## Task 4: Workflow Config Reader

**Files:**
- Create: `packages/vault-core/src/workflow.ts`
- Create: `packages/vault-core/tests/workflow.test.ts`

**Interfaces:**
- Consumes: `VaultWorkflows`, `WorkflowConfig` from `./types.js`
- Produces:
  - `readWorkflows(vaultPath: string): Promise<VaultWorkflows>`
  - `getWorkflowForType(workflows: VaultWorkflows, type: DocumentType): WorkflowConfig`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/vault-core/tests/workflow.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readWorkflows, getWorkflowForType } from "../src/workflow.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-test-"));
  await fs.mkdir(path.join(tmpDir, ".signoff"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const sampleWorkflows = {
  spec: {
    required_approvers: ["arch@org.com"],
    min_approvals: 1,
  },
  plan: {
    required_approvers: ["lead@org.com"],
    optional_approvers: ["pm@org.com"],
    min_approvals: 1,
  },
};

describe("readWorkflows", () => {
  it("reads and parses workflows.json", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".signoff", "workflows.json"),
      JSON.stringify(sampleWorkflows)
    );
    const result = await readWorkflows(tmpDir);
    expect(result.spec.required_approvers).toEqual(["arch@org.com"]);
    expect(result.plan.optional_approvers).toEqual(["pm@org.com"]);
  });

  it("throws if workflows.json does not exist", async () => {
    await expect(readWorkflows(tmpDir)).rejects.toThrow("workflows.json not found");
  });
});

describe("getWorkflowForType", () => {
  it("returns spec workflow for spec type", () => {
    const wf = getWorkflowForType(sampleWorkflows, "spec");
    expect(wf.required_approvers).toEqual(["arch@org.com"]);
  });

  it("returns plan workflow for plan type", () => {
    const wf = getWorkflowForType(sampleWorkflows, "plan");
    expect(wf.required_approvers).toEqual(["lead@org.com"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/vault-core && npm test -- tests/workflow.test.ts
```

Expected: FAIL — `readWorkflows` not found.

- [ ] **Step 3: Implement workflow.ts**

```typescript
// packages/vault-core/src/workflow.ts
import fs from "node:fs/promises";
import path from "node:path";
import type { VaultWorkflows, WorkflowConfig, DocumentType } from "./types.js";

export async function readWorkflows(vaultPath: string): Promise<VaultWorkflows> {
  const filePath = path.join(vaultPath, ".signoff", "workflows.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as VaultWorkflows;
  } catch {
    throw new Error(`workflows.json not found at ${filePath}`);
  }
}

export function getWorkflowForType(
  workflows: VaultWorkflows,
  type: DocumentType
): WorkflowConfig {
  return workflows[type];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/vault-core && npm test -- tests/workflow.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vault-core/src/workflow.ts packages/vault-core/tests/workflow.test.ts
git commit -m "feat(vault-core): add workflow config reader"
```

---

## Task 5: Approval File Manager

**Files:**
- Create: `packages/vault-core/src/approval.ts`
- Create: `packages/vault-core/tests/approval.test.ts`

**Interfaces:**
- Consumes: `ApprovalRecord`, `ApprovalHistoryEntry`, `ApprovalStatus`, `DocumentType`, `CheckApprovalResult` from `./types.js`
- Produces:
  - `approvalFilePath(vaultPath: string, feature: string, type: DocumentType): string`
  - `readApproval(vaultPath: string, feature: string, type: DocumentType): Promise<ApprovalRecord | null>`
  - `writeApproval(vaultPath: string, record: ApprovalRecord): Promise<void>`
  - `appendHistory(record: ApprovalRecord, entry: ApprovalHistoryEntry): ApprovalRecord`
  - `getApprovalStatus(vaultPath: string, feature: string, type: DocumentType): Promise<CheckApprovalResult>`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/vault-core/tests/approval.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  approvalFilePath,
  readApproval,
  writeApproval,
  appendHistory,
  getApprovalStatus,
} from "../src/approval.js";
import type { ApprovalRecord } from "../src/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-approval-"));
  await fs.mkdir(path.join(tmpDir, "features", "user-auth"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const baseRecord: ApprovalRecord = {
  document: "spec.md",
  feature: "user-auth",
  type: "spec",
  workflow: "spec",
  status: "pending",
  history: [
    { action: "submitted", by: "dev@org.com", at: "2026-06-27T10:00:00Z", message: null },
  ],
};

describe("approvalFilePath", () => {
  it("returns correct path for spec", () => {
    const p = approvalFilePath(tmpDir, "user-auth", "spec");
    expect(p).toBe(path.join(tmpDir, "features", "user-auth", "spec.approval.json"));
  });

  it("returns correct path for plan", () => {
    const p = approvalFilePath(tmpDir, "user-auth", "plan");
    expect(p).toBe(path.join(tmpDir, "features", "user-auth", "plan.approval.json"));
  });
});

describe("readApproval", () => {
  it("returns null when approval file does not exist", async () => {
    const result = await readApproval(tmpDir, "user-auth", "spec");
    expect(result).toBeNull();
  });

  it("reads existing approval file", async () => {
    await fs.writeFile(
      path.join(tmpDir, "features", "user-auth", "spec.approval.json"),
      JSON.stringify(baseRecord)
    );
    const result = await readApproval(tmpDir, "user-auth", "spec");
    expect(result?.status).toBe("pending");
    expect(result?.history).toHaveLength(1);
  });
});

describe("writeApproval", () => {
  it("writes approval record as pretty-printed JSON", async () => {
    await writeApproval(tmpDir, baseRecord);
    const raw = await fs.readFile(
      path.join(tmpDir, "features", "user-auth", "spec.approval.json"),
      "utf-8"
    );
    const parsed = JSON.parse(raw);
    expect(parsed.status).toBe("pending");
  });
});

describe("appendHistory", () => {
  it("appends entry without mutating original", () => {
    const entry = { action: "approved" as const, by: "arch@org.com", at: "2026-06-27T12:00:00Z", message: "LGTM" };
    const updated = appendHistory(baseRecord, entry);
    expect(updated.history).toHaveLength(2);
    expect(baseRecord.history).toHaveLength(1); // original unchanged
    expect(updated.status).toBe("approved");
  });

  it("sets status to rejected on rejected action", () => {
    const entry = { action: "rejected" as const, by: "arch@org.com", at: "2026-06-27T12:00:00Z", message: "Needs work" };
    const updated = appendHistory(baseRecord, entry);
    expect(updated.status).toBe("rejected");
  });

  it("sets status to pending on resubmitted action", () => {
    const entry = { action: "resubmitted" as const, by: "dev@org.com", at: "2026-06-27T13:00:00Z", message: null };
    const updated = appendHistory(baseRecord, entry);
    expect(updated.status).toBe("pending");
  });
});

describe("getApprovalStatus", () => {
  it("returns not_found when no approval file exists", async () => {
    const result = await getApprovalStatus(tmpDir, "user-auth", "spec");
    expect(result.status).toBe("not_found");
  });

  it("returns approved status with approver details", async () => {
    const approvedRecord: ApprovalRecord = {
      ...baseRecord,
      status: "approved",
      history: [
        ...baseRecord.history,
        { action: "approved", by: "arch@org.com", at: "2026-06-27T12:00:00Z", message: "LGTM" },
      ],
    };
    await writeApproval(tmpDir, approvedRecord);
    const result = await getApprovalStatus(tmpDir, "user-auth", "spec");
    expect(result.status).toBe("approved");
    expect(result.approved_by).toBe("arch@org.com");
    expect(result.approved_at).toBe("2026-06-27T12:00:00Z");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/vault-core && npm test -- tests/approval.test.ts
```

Expected: FAIL — `approvalFilePath` not found.

- [ ] **Step 3: Implement approval.ts**

```typescript
// packages/vault-core/src/approval.ts
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ApprovalRecord,
  ApprovalHistoryEntry,
  ApprovalStatus,
  DocumentType,
  CheckApprovalResult,
} from "./types.js";

export function approvalFilePath(
  vaultPath: string,
  feature: string,
  type: DocumentType
): string {
  return path.join(vaultPath, "features", feature, `${type}.approval.json`);
}

export async function readApproval(
  vaultPath: string,
  feature: string,
  type: DocumentType
): Promise<ApprovalRecord | null> {
  const filePath = approvalFilePath(vaultPath, feature, type);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ApprovalRecord;
  } catch {
    return null;
  }
}

export async function writeApproval(
  vaultPath: string,
  record: ApprovalRecord
): Promise<void> {
  const filePath = approvalFilePath(vaultPath, record.feature, record.type);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(record, null, 2) + "\n", "utf-8");
}

const actionToStatus: Record<ApprovalHistoryEntry["action"], ApprovalStatus> = {
  submitted: "pending",
  resubmitted: "pending",
  approved: "approved",
  rejected: "rejected",
};

export function appendHistory(
  record: ApprovalRecord,
  entry: ApprovalHistoryEntry
): ApprovalRecord {
  return {
    ...record,
    status: actionToStatus[entry.action],
    history: [...record.history, entry],
  };
}

export async function getApprovalStatus(
  vaultPath: string,
  feature: string,
  type: DocumentType
): Promise<CheckApprovalResult> {
  const record = await readApproval(vaultPath, feature, type);
  if (!record) return { status: "not_found" };

  if (record.status === "approved") {
    const approvedEntry = [...record.history]
      .reverse()
      .find((e) => e.action === "approved");
    return {
      status: "approved",
      approved_by: approvedEntry?.by,
      approved_at: approvedEntry?.at,
    };
  }

  return { status: record.status };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/vault-core && npm test -- tests/approval.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vault-core/src/approval.ts packages/vault-core/tests/approval.test.ts
git commit -m "feat(vault-core): add approval file manager"
```

---

## Task 6: Git Operations Wrapper

**Files:**
- Create: `packages/vault-core/src/git.ts`
- Create: `packages/vault-core/tests/git.test.ts`

**Interfaces:**
- Produces:
  - `initVaultRepo(vaultPath: string): Promise<void>`
  - `stageAndCommit(vaultPath: string, files: string[], message: string, authorEmail: string, authorName: string): Promise<string>` — returns commit SHA
  - `pullLatest(vaultPath: string): Promise<void>`
  - `pushToRemote(vaultPath: string): Promise<void>`
  - `getHeadSha(vaultPath: string): Promise<string>`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/vault-core/tests/git.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initVaultRepo,
  stageAndCommit,
  getHeadSha,
} from "../src/git.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-git-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("initVaultRepo", () => {
  it("initializes a git repo with a .git directory", async () => {
    await initVaultRepo(tmpDir);
    const stat = await fs.stat(path.join(tmpDir, ".git"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("is idempotent — calling twice does not throw", async () => {
    await initVaultRepo(tmpDir);
    await expect(initVaultRepo(tmpDir)).resolves.not.toThrow();
  });
});

describe("stageAndCommit", () => {
  it("creates a commit and returns a SHA", async () => {
    await initVaultRepo(tmpDir);
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "hello");

    const sha = await stageAndCommit(
      tmpDir,
      ["test.txt"],
      "test: initial commit",
      "dev@org.com",
      "Developer"
    );

    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("getHeadSha returns the same SHA as the commit", async () => {
    await initVaultRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, "file.txt"), "content");

    const sha = await stageAndCommit(
      tmpDir,
      ["file.txt"],
      "test: commit",
      "dev@org.com",
      "Developer"
    );

    const head = await getHeadSha(tmpDir);
    expect(head).toBe(sha);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/vault-core && npm test -- tests/git.test.ts
```

Expected: FAIL — `initVaultRepo` not found.

- [ ] **Step 3: Implement git.ts**

```typescript
// packages/vault-core/src/git.ts
import simpleGit from "simple-git";

export async function initVaultRepo(vaultPath: string): Promise<void> {
  const git = simpleGit(vaultPath);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    await git.init();
  }
}

export async function stageAndCommit(
  vaultPath: string,
  files: string[],
  message: string,
  authorEmail: string,
  authorName: string
): Promise<string> {
  const git = simpleGit(vaultPath);
  await git.addConfig("user.email", authorEmail, false, "local");
  await git.addConfig("user.name", authorName, false, "local");
  await git.add(files);
  await git.commit(message);
  return getHeadSha(vaultPath);
}

export async function pullLatest(vaultPath: string): Promise<void> {
  const git = simpleGit(vaultPath);
  await git.pull();
}

export async function pushToRemote(vaultPath: string): Promise<void> {
  const git = simpleGit(vaultPath);
  await git.push();
}

export async function getHeadSha(vaultPath: string): Promise<string> {
  const git = simpleGit(vaultPath);
  const log = await git.log({ maxCount: 1 });
  return log.latest?.hash ?? "";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/vault-core && npm test -- tests/git.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vault-core/src/git.ts packages/vault-core/tests/git.test.ts
git commit -m "feat(vault-core): add git operations wrapper"
```

---

## Task 7: VaultManager

**Files:**
- Create: `packages/vault-core/src/vault.ts`
- Create: `packages/vault-core/tests/vault.test.ts`

**Interfaces:**
- Consumes: `initVaultRepo`, `stageAndCommit` from `./git.js`; `VaultConfig`, `VaultWorkflows`, `VaultInfo`, `VaultsRegistry`, `PublishResult`, `DocumentType` from `./types.js`; `inferFeatureName` from `./feature.js`; `approvalFilePath`, `readApproval`, `writeApproval` from `./approval.js`
- Produces: `VaultManager` class with methods:
  - `static create(vaultPath: string, name: string, org: string): Promise<VaultManager>`
  - `static open(vaultPath: string): Promise<VaultManager>`
  - `publish(sourcePath: string, featureName: string, type: DocumentType, authorEmail: string, authorName: string): Promise<PublishResult>`
  - `get vaultPath(): string`
  - `get config(): VaultConfig`
  - `static listVaults(): Promise<VaultInfo[]>`
  - `static registerVault(info: VaultInfo): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/vault-core/tests/vault.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VaultManager } from "../src/vault.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;
let registryDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-vault-"));
  registryDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-registry-"));
  process.env.SIGNOFF_HOME = registryDir;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(registryDir, { recursive: true, force: true });
  delete process.env.SIGNOFF_HOME;
});

describe("VaultManager.create", () => {
  it("initializes vault structure", async () => {
    const vm = await VaultManager.create(tmpDir, "test-project", "acme");
    const signoffStat = await fs.stat(path.join(tmpDir, ".signoff"));
    expect(signoffStat.isDirectory()).toBe(true);
  });

  it("writes config.json", async () => {
    await VaultManager.create(tmpDir, "test-project", "acme");
    const raw = await fs.readFile(path.join(tmpDir, ".signoff", "config.json"), "utf-8");
    const config = JSON.parse(raw);
    expect(config.name).toBe("test-project");
    expect(config.org).toBe("acme");
  });

  it("writes default workflows.json", async () => {
    await VaultManager.create(tmpDir, "test-project", "acme");
    const raw = await fs.readFile(path.join(tmpDir, ".signoff", "workflows.json"), "utf-8");
    const wf = JSON.parse(raw);
    expect(wf.spec.min_approvals).toBe(1);
    expect(wf.plan.min_approvals).toBe(1);
  });
});

describe("VaultManager.open", () => {
  it("opens existing vault", async () => {
    await VaultManager.create(tmpDir, "test-project", "acme");
    const vm = await VaultManager.open(tmpDir);
    expect(vm.config.name).toBe("test-project");
    expect(vm.vaultPath).toBe(tmpDir);
  });

  it("throws if not a vault", async () => {
    await expect(VaultManager.open(tmpDir)).rejects.toThrow("not a SignOff vault");
  });
});

describe("VaultManager.publish", () => {
  it("copies doc into vault features folder and commits", async () => {
    const vm = await VaultManager.create(tmpDir, "test-project", "acme");
    const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-src-"));
    const srcFile = path.join(srcDir, "2026-06-27-user-auth-design.md");
    await fs.writeFile(srcFile, "# User Auth Spec\n\nContent here.");

    const result = await vm.publish(srcFile, "user-auth", "spec", "dev@org.com", "Developer");

    const destStat = await fs.stat(path.join(tmpDir, "features", "user-auth", "spec.md"));
    expect(destStat.isFile()).toBe(true);
    expect(result.commit_sha).toMatch(/^[0-9a-f]{40}$/);

    await fs.rm(srcDir, { recursive: true, force: true });
  });

  it("creates approval record with submitted status", async () => {
    const vm = await VaultManager.create(tmpDir, "test-project", "acme");
    const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-src2-"));
    const srcFile = path.join(srcDir, "2026-06-27-user-auth-design.md");
    await fs.writeFile(srcFile, "# Spec");

    await vm.publish(srcFile, "user-auth", "spec", "dev@org.com", "Developer");

    const { readApproval } = await import("../src/approval.js");
    const record = await readApproval(tmpDir, "user-auth", "spec");
    expect(record?.status).toBe("pending");
    expect(record?.history[0].action).toBe("submitted");

    await fs.rm(srcDir, { recursive: true, force: true });
  });
});

describe("VaultManager registry", () => {
  it("registers and lists vaults", async () => {
    await VaultManager.registerVault({
      name: "test-project",
      path: tmpDir,
      last_opened: new Date().toISOString(),
    });

    const vaults = await VaultManager.listVaults();
    expect(vaults.some((v) => v.path === tmpDir)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/vault-core && npm test -- tests/vault.test.ts
```

Expected: FAIL — `VaultManager` not found.

- [ ] **Step 3: Implement vault.ts**

```typescript
// packages/vault-core/src/vault.ts
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type {
  VaultConfig,
  VaultInfo,
  VaultsRegistry,
  PublishResult,
  DocumentType,
} from "./types.js";
import { initVaultRepo, stageAndCommit } from "./git.js";
import { writeApproval, readApproval } from "./approval.js";

const DEFAULT_WORKFLOWS = {
  spec: {
    required_approvers: [] as string[],
    min_approvals: 1,
  },
  plan: {
    required_approvers: [] as string[],
    min_approvals: 1,
  },
};

function signoffHome(): string {
  return process.env.SIGNOFF_HOME ?? path.join(os.homedir(), ".signoff");
}

function registryPath(): string {
  return path.join(signoffHome(), "vaults.json");
}

export class VaultManager {
  private _config: VaultConfig;
  private _vaultPath: string;

  private constructor(vaultPath: string, config: VaultConfig) {
    this._vaultPath = vaultPath;
    this._config = config;
  }

  get vaultPath(): string {
    return this._vaultPath;
  }

  get config(): VaultConfig {
    return this._config;
  }

  static async create(vaultPath: string, name: string, org: string): Promise<VaultManager> {
    await fs.mkdir(path.join(vaultPath, ".signoff"), { recursive: true });
    await fs.mkdir(path.join(vaultPath, "features"), { recursive: true });

    const config: VaultConfig = {
      name,
      org,
      created_at: new Date().toISOString(),
    };

    await fs.writeFile(
      path.join(vaultPath, ".signoff", "config.json"),
      JSON.stringify(config, null, 2) + "\n"
    );

    await fs.writeFile(
      path.join(vaultPath, ".signoff", "workflows.json"),
      JSON.stringify(DEFAULT_WORKFLOWS, null, 2) + "\n"
    );

    await fs.writeFile(
      path.join(vaultPath, "README.md"),
      `# ${name} — SignOff Vault\n\nManaged by [SignOff](https://github.com/signoff).\n`
    );

    await initVaultRepo(vaultPath);

    return new VaultManager(vaultPath, config);
  }

  static async open(vaultPath: string): Promise<VaultManager> {
    const configPath = path.join(vaultPath, ".signoff", "config.json");
    try {
      const raw = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(raw) as VaultConfig;
      return new VaultManager(vaultPath, config);
    } catch {
      throw new Error(`${vaultPath} is not a SignOff vault (missing .signoff/config.json)`);
    }
  }

  async publish(
    sourcePath: string,
    featureName: string,
    type: DocumentType,
    authorEmail: string,
    authorName: string
  ): Promise<PublishResult> {
    const featureDir = path.join(this._vaultPath, "features", featureName);
    await fs.mkdir(featureDir, { recursive: true });

    const destFile = path.join(featureDir, `${type}.md`);
    await fs.copyFile(sourcePath, destFile);

    const existing = await readApproval(this._vaultPath, featureName, type);
    const now = new Date().toISOString();
    const action = existing ? "resubmitted" : "submitted";

    const record = existing
      ? {
          ...existing,
          status: "pending" as const,
          history: [
            ...existing.history,
            { action: action as "resubmitted", by: authorEmail, at: now, message: null },
          ],
        }
      : {
          document: `${type}.md`,
          feature: featureName,
          type,
          workflow: type,
          status: "pending" as const,
          history: [{ action: "submitted" as const, by: authorEmail, at: now, message: null }],
        };

    await writeApproval(this._vaultPath, record);

    const approvalFile = path.join("features", featureName, `${type}.approval.json`);
    const docFile = path.join("features", featureName, `${type}.md`);

    const sha = await stageAndCommit(
      this._vaultPath,
      [docFile, approvalFile],
      `chore: publish ${featureName}/${type} for review`,
      authorEmail,
      authorName
    );

    return {
      vault_path: destFile,
      commit_sha: sha,
    };
  }

  static async listVaults(): Promise<VaultInfo[]> {
    try {
      const raw = await fs.readFile(registryPath(), "utf-8");
      const registry = JSON.parse(raw) as VaultsRegistry;
      return registry.vaults;
    } catch {
      return [];
    }
  }

  static async registerVault(info: VaultInfo): Promise<void> {
    const existing = await VaultManager.listVaults();
    const filtered = existing.filter((v) => v.path !== info.path);
    const registry: VaultsRegistry = { vaults: [...filtered, info] };
    await fs.mkdir(signoffHome(), { recursive: true });
    await fs.writeFile(registryPath(), JSON.stringify(registry, null, 2) + "\n");
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/vault-core && npm test -- tests/vault.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vault-core/src/vault.ts packages/vault-core/tests/vault.test.ts
git commit -m "feat(vault-core): add VaultManager"
```

---

## Task 8: Public API + Full Test Suite

**Files:**
- Modify: `packages/vault-core/src/index.ts`

**Interfaces:**
- Produces: complete public API — everything downstream packages import from `@signoff/vault-core`

- [ ] **Step 1: Write the full public API in index.ts**

```typescript
// packages/vault-core/src/index.ts

// Types
export type {
  DocumentType,
  ApprovalAction,
  ApprovalStatus,
  ApprovalHistoryEntry,
  ApprovalRecord,
  WorkflowConfig,
  VaultWorkflows,
  VaultConfig,
  VaultInfo,
  VaultsRegistry,
  PublishResult,
  CheckApprovalResult,
} from "./types.js";

// Feature inference
export { inferFeatureName } from "./feature.js";

// Workflow
export { readWorkflows, getWorkflowForType } from "./workflow.js";

// Approval
export {
  approvalFilePath,
  readApproval,
  writeApproval,
  appendHistory,
  getApprovalStatus,
} from "./approval.js";

// Git
export {
  initVaultRepo,
  stageAndCommit,
  pullLatest,
  pushToRemote,
  getHeadSha,
} from "./git.js";

// VaultManager
export { VaultManager } from "./vault.js";
```

- [ ] **Step 2: Run full test suite**

```bash
cd packages/vault-core && npm test
```

Expected: All tests PASS across all test files.

- [ ] **Step 3: Build the package**

```bash
cd packages/vault-core && npm run build
```

Expected: `dist/` directory created with `.js` and `.d.ts` files, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/vault-core/src/index.ts packages/vault-core/dist/
git commit -m "feat(vault-core): publish complete public API"
```

---

## Self-Review Notes

- All types from `types.ts` are used consistently across tasks — no name drift
- `appendHistory` is pure/immutable — safe for both app and MCP server to use
- `SIGNOFF_HOME` env var allows test isolation of the registry
- `pullLatest` and `pushToRemote` have no unit tests (require a real remote) — integration tested in mcp-server plan
- Feature name inference strips `-design`, `-spec`, `-plan` suffixes — covers all superpowers skill output patterns
