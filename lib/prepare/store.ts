import { getSandboxIdentity } from "../daytona/sandbox";
import type { PrepReport } from "./run";

const MAX_PREP_REPORTS = 8;
const reports = new Map<string, PrepReport>();
let reportsIdentity = getSandboxIdentity();

function syncSandboxIdentity(): void {
  const currentIdentity = getSandboxIdentity();
  if (currentIdentity === reportsIdentity) return;
  reports.clear();
  reportsIdentity = currentIdentity;
}

export function getPrep(hash: string): PrepReport | undefined {
  syncSandboxIdentity();
  return reports.get(hash);
}

export function setPrep(hash: string, report: PrepReport): void {
  syncSandboxIdentity();
  reports.set(hash, report);
  while (reports.size > MAX_PREP_REPORTS) {
    const oldestHash = reports.keys().next().value;
    if (oldestHash === undefined) return;
    reports.delete(oldestHash);
  }
}
