import path from "node:path";
import { isClearedForCode, type ApprovalStatus, type DocumentType, type Tier } from "@signoff/vault-core";

export interface CheckResult {
  ok: boolean;
  tier: Tier;
  artifact: DocumentType;
  status: ApprovalStatus | "not_found";
  message: string;
}

/** Run the tier-aware gate against the cloned vault at <projectRoot>/.signoff.
 *  ok iff isClearedForCode says the feature is cleared (tier decides which
 *  artifact is required). Never throws — any failure is a closed gate. */
export async function runCheck(opts: { projectRoot: string; feature: string }): Promise<CheckResult> {
  const vaultPath = path.join(opts.projectRoot, ".signoff");
  try {
    const c = await isClearedForCode(vaultPath, opts.feature);
    const message = c.cleared
      ? `SignOff: "${opts.feature}" (${c.tier}) is cleared — ${c.artifact} approved.`
      : `SignOff: "${opts.feature}" (${c.tier}) is NOT cleared — ${c.artifact} status: ${c.status}. Get sign-off in SignOff before merging.`;
    return { ok: c.cleared, tier: c.tier, artifact: c.artifact, status: c.status, message };
  } catch (err) {
    return {
      ok: false,
      tier: "standard",
      artifact: "plan",
      status: "not_found",
      message: `SignOff: could not verify approval (${err instanceof Error ? err.message : String(err)}) — failing closed.`,
    };
  }
}
