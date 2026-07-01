import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type {
  VaultConfig,
  VaultInfo,
  VaultsRegistry,
  PublishResult,
  DocumentType,
  ApprovalRecord,
} from "./types.js";
import { initVaultRepo, stageAndCommit } from "./git.js";
import { writeApproval, readApproval } from "./approval.js";
import { approvalRelPath } from "./layout.js";
import {
  readManifest,
  writeManifest,
  setFeatureDoc,
  resolveDocPath,
  hashContent,
  manifestRelPath,
  projectRootOf,
  ensureCategory,
  setFeatureCategory,
  setFeatureTags,
  setFeatureTier,
  setFeatureTicket,
} from "./manifest.js";
import type { Tier } from "./tiers.js";
import type { Ticket } from "./ticket.js";

const DEFAULT_WORKFLOWS = {
  spec: {
    required_approvers: [] as string[],
    min_approvals: 1,
    approval_mode: "unanimous" as const,
    require_diagram: true,
  },
  plan: {
    required_approvers: [] as string[],
    min_approvals: 1,
    approval_mode: "unanimous" as const,
  },
  adr: {
    required_approvers: [] as string[],
    min_approvals: 1,
    approval_mode: "unanimous" as const,
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

  static async create(vaultPath: string, name: string, org?: string): Promise<VaultManager> {
    await fs.mkdir(path.join(vaultPath, "approvals"), { recursive: true });

    const config: VaultConfig = {
      name,
      created_at: new Date().toISOString(),
      doc_roots: ["docs"],
      ...(org ? { org } : {}),
    };

    await fs.writeFile(path.join(vaultPath, "config.json"), JSON.stringify(config, null, 2) + "\n");
    await fs.writeFile(path.join(vaultPath, "workflows.json"), JSON.stringify(DEFAULT_WORKFLOWS, null, 2) + "\n");
    await writeManifest(vaultPath, { version: 2, categories: [], features: {} });
    await fs.writeFile(
      path.join(vaultPath, "README.md"),
      `# ${name} — Signoff Vault\n\nApproval state for this project's specs & plans.\n`
    );

    await initVaultRepo(vaultPath);
    await stageAndCommit(
      vaultPath,
      ["config.json", "workflows.json", "index.json", "README.md"],
      "chore: initialize vault scaffold",
      "signoff@local",
      "Signoff"
    );

    return new VaultManager(vaultPath, config);
  }

  static async open(vaultPath: string): Promise<VaultManager> {
    const configPath = path.join(vaultPath, "config.json");
    try {
      const raw = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(raw) as VaultConfig;
      return new VaultManager(vaultPath, config);
    } catch {
      throw new Error(`${vaultPath} is not a SignOff vault (missing config.json)`);
    }
  }

  /**
   * Register an in-project document (at srcRelPath, relative to the project
   * root) for review and record a pending approval pinned to its content hash.
   * No copy is made.
   */
  async submitForReview(
    featureName: string,
    type: DocumentType,
    srcRelPath: string,
    authorEmail: string,
    authorName: string,
    opts?: { category?: string; tags?: string[]; tier?: Tier; ticket?: Ticket }
  ): Promise<PublishResult> {
    let manifest = setFeatureDoc(await readManifest(this._vaultPath), featureName, type, srcRelPath);
    // Author suggestions: category only when unset (reviewer wins); tags union in.
    if (opts?.category && !manifest.features[featureName]?.category) {
      const ensured = ensureCategory(manifest, opts.category);
      manifest = setFeatureCategory(ensured.manifest, featureName, ensured.id);
    }
    if (opts?.tags?.length) {
      const current = manifest.features[featureName]?.tags ?? [];
      manifest = setFeatureTags(manifest, featureName, [...current, ...opts.tags]);
    }
    if (opts?.tier && !manifest.features[featureName]?.tier) {
      manifest = setFeatureTier(manifest, featureName, opts.tier);
    }
    if (opts?.ticket && !manifest.features[featureName]?.ticket) {
      manifest = setFeatureTicket(manifest, featureName, opts.ticket);
    }
    await writeManifest(this._vaultPath, manifest);
    const sha = await this.recordSubmission(featureName, type, srcRelPath, authorEmail, authorName);
    return {
      vault_path: this._vaultPath,
      document_path:
        resolveDocPath(this._vaultPath, manifest, featureName, type) ??
        path.join(projectRootOf(this._vaultPath), srcRelPath),
      commit_sha: sha,
    };
  }

  async publish(
    srcRelPath: string,
    featureName: string,
    type: DocumentType,
    authorEmail: string,
    authorName: string,
    opts?: { category?: string; tags?: string[]; tier?: Tier; ticket?: Ticket }
  ): Promise<PublishResult> {
    return this.submitForReview(featureName, type, srcRelPath, authorEmail, authorName, opts);
  }

  private async recordSubmission(
    featureName: string,
    type: DocumentType,
    srcRelPath: string,
    authorEmail: string,
    authorName: string
  ): Promise<string> {
    const abs = path.join(projectRootOf(this._vaultPath), srcRelPath);
    let contentHash: string | undefined;
    try {
      contentHash = hashContent(await fs.readFile(abs));
    } catch {
      contentHash = undefined; // doc not present yet; staleness simply unknown
    }
    const existing = await readApproval(this._vaultPath, featureName, type);
    const now = new Date().toISOString();

    const record: ApprovalRecord = existing
      ? {
          ...existing,
          document: srcRelPath,
          status: "pending",
          reviewers: existing.reviewers ?? {},
          history: [
            ...existing.history,
            { action: "resubmitted", by: authorEmail, at: now, message: null, content_hash: contentHash },
          ],
        }
      : {
          document: srcRelPath,
          feature: featureName,
          type,
          workflow: type,
          status: "pending",
          reviewers: {},
          history: [{ action: "submitted", by: authorEmail, at: now, message: null, content_hash: contentHash }],
        };

    await writeApproval(this._vaultPath, record);

    return stageAndCommit(
      this._vaultPath,
      [manifestRelPath, approvalRelPath(featureName, type)],
      `chore: submit ${featureName}/${type} for review`,
      authorEmail,
      authorName
    );
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

  /** Remove a vault from the recent-projects registry. Does not touch the vault on disk. */
  static async removeVault(vaultPath: string): Promise<void> {
    const existing = await VaultManager.listVaults();
    const registry: VaultsRegistry = { vaults: existing.filter((v) => v.path !== vaultPath) };
    await fs.mkdir(signoffHome(), { recursive: true });
    await fs.writeFile(registryPath(), JSON.stringify(registry, null, 2) + "\n");
  }
}
