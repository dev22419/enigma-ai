// AI-assisted: Used Claude to write this file.
import { promises as fs } from "node:fs";
import path from "node:path";

import type { Sample } from "@/components/app/chat";

/** The team's synthetic demo documents in docs/demo. Every name and number in them is invented. */
const SAMPLES: Omit<Sample, "text">[] = [
  { key: "medical", label: "Clinic summary", task: "medical", fileName: "sample-medical-report.txt", blurb: "Diabetes follow-up with lab results, medication and a penicillin allergy." },
  { key: "legal", label: "Supply contract", task: "legal", fileName: "sample-legal-contract.txt", blurb: "Obligations, renewal terms and a liability cap to find." },
  { key: "financial", label: "Financial statement", task: "financial", fileName: "sample-financial-statement.txt", blurb: "Quarterly figures with trends and anomalies to flag." },
  { key: "injection", label: "Prompt-injection test", task: "medical", fileName: "sample-injection-test.txt", blurb: "A clinic note that tries to give the model orders. It should just get summarised." },
];

export async function loadSamples(): Promise<Sample[]> {
  "use cache";
  const dir = path.join(process.cwd(), "..", "docs", "demo");
  const out: Sample[] = [];
  for (const s of SAMPLES) {
    try {
      out.push({ ...s, text: await fs.readFile(path.join(dir, s.fileName), "utf8") });
    } catch {
      // sample missing from this checkout: leave it out
    }
  }
  return out;
}
