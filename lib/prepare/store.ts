import type { PrepReport } from "./run";

const MAX_PREP_REPORTS = 8;
const reports = new Map<string, PrepReport>();

export function getPrep(hash: string): PrepReport | undefined {
  return reports.get(hash);
}

export function setPrep(hash: string, report: PrepReport): void {
  reports.set(hash, report);
  while (reports.size > MAX_PREP_REPORTS) {
    const oldestHash = reports.keys().next().value;
    if (oldestHash === undefined) return;
    reports.delete(oldestHash);
  }
}
