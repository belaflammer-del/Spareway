import type { AnalysisReport } from "../domain/schemas";
import { buildDemoReport } from "./build";
import { DEMO_DEFINITIONS } from "./definitions";

let cache: Map<string, AnalysisReport> | null = null;

export function getDemoReports(): Map<string, AnalysisReport> {
  if (!cache) cache = new Map(DEMO_DEFINITIONS.map((d) => [d.slug, buildDemoReport(d)]));
  return cache;
}

export function getDemoReport(slug: string): AnalysisReport | null {
  return getDemoReports().get(slug) ?? null;
}

export function listDemos() {
  const reports = getDemoReports();
  return DEMO_DEFINITIONS.map((d) => ({ slug: d.slug, teaser: d.teaser, report: reports.get(d.slug)! }));
}
