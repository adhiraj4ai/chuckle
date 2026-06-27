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
import { documentPath, documentRelPath, approvalRelPath } from "./layout.js";

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

function chuckleHome(): string {
  return process.env.CHUCKLE_HOME ?? path.join(os.homedir(), ".chuckle");
}

function registryPath(): string {
  return path.join(chuckleHome(), "vaults.json");
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
    await fs.mkdir(path.join(vaultPath, "specs"), { recursive: true });
    await fs.mkdir(path.join(vaultPath, "plans"), { recursive: true });
    await fs.mkdir(path.join(vaultPath, "approvals"), { recursive: true });

    const config: VaultConfig = {
      name,
      org,
      created_at: new Date().toISOString(),
    };

    // config + workflows live at the vault root (the vault dir is the project's
    // .chuckle/ directory).
    await fs.writeFile(
      path.join(vaultPath, "config.json"),
      JSON.stringify(config, null, 2) + "\n"
    );

    await fs.writeFile(
      path.join(vaultPath, "workflows.json"),
      JSON.stringify(DEFAULT_WORKFLOWS, null, 2) + "\n"
    );

    await fs.writeFile(
      path.join(vaultPath, "README.md"),
      `# ${name} — Chuckle Vault\n\nManaged by [Chuckle](https://github.com/chuckle).\n`
    );

    await initVaultRepo(vaultPath);

    await stageAndCommit(
      vaultPath,
      ["config.json", "workflows.json", "README.md"],
      "chore: initialize vault scaffold",
      "chuckle@local",
      "Chuckle"
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
      throw new Error(`${vaultPath} is not a Chuckle vault (missing config.json)`);
    }
  }

  async publish(
    sourcePath: string,
    featureName: string,
    type: DocumentType,
    authorEmail: string,
    authorName: string
  ): Promise<PublishResult> {
    const destFile = documentPath(this._vaultPath, featureName, type);
    await fs.mkdir(path.dirname(destFile), { recursive: true });
    // copy only when publishing from an external source (no-op if already in place)
    if (path.resolve(sourcePath) !== path.resolve(destFile)) {
      await fs.copyFile(sourcePath, destFile);
    }

    const sha = await this.recordSubmission(featureName, type, authorEmail, authorName);
    return {
      vault_path: this._vaultPath,
      document_path: destFile,
      commit_sha: sha,
    };
  }

  /**
   * Submit a document that already lives in the vault (specs/ or plans/) for
   * review — no copy. Creates/updates the approval record and commits.
   */
  async submitForReview(
    featureName: string,
    type: DocumentType,
    authorEmail: string,
    authorName: string
  ): Promise<PublishResult> {
    const sha = await this.recordSubmission(featureName, type, authorEmail, authorName);
    return {
      vault_path: this._vaultPath,
      document_path: documentPath(this._vaultPath, featureName, type),
      commit_sha: sha,
    };
  }

  private async recordSubmission(
    featureName: string,
    type: DocumentType,
    authorEmail: string,
    authorName: string
  ): Promise<string> {
    const existing = await readApproval(this._vaultPath, featureName, type);
    const now = new Date().toISOString();

    const record = existing
      ? {
          ...existing,
          status: "pending" as const,
          history: [
            ...existing.history,
            { action: "resubmitted" as const, by: authorEmail, at: now, message: null },
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

    return stageAndCommit(
      this._vaultPath,
      [documentRelPath(featureName, type), approvalRelPath(featureName, type)],
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
    await fs.mkdir(chuckleHome(), { recursive: true });
    await fs.writeFile(registryPath(), JSON.stringify(registry, null, 2) + "\n");
  }
}
