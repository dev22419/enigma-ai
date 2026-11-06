// AI-assisted: Used Claude to write this file.
import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { guessTask } from "../src/lib/guess-task";

describe("guessTask", () => {
  it("reads a medical record", () => {
    expect(guessTask("Patient follow-up. Diagnosis: diabetes. HbA1c 8.2. Medication unchanged.")).toBe("medical");
  });

  it("reads a contract", () => {
    expect(guessTask("Supply agreement. Clause 14.2 caps liability. Either party may seek termination.")).toBe("legal");
  });

  it("reads a financial statement", () => {
    expect(guessTask("Quarterly revenue rose, profit fell, and cash flow stayed flat.")).toBe("financial");
  });

  it("uses the file name when that is all there is", () => {
    expect(guessTask("sample-legal-contract.txt")).toBe("legal");
  });

  it("leaves the choice alone when nothing matches", () => {
    expect(guessTask("helo")).toBeNull();
    expect(guessTask("download (1).jpeg")).toBeNull();
  });

  it("leaves the choice alone on a tie", () => {
    expect(guessTask("the patient signed a contract")).toBeNull();
  });

  it("matches whole words only", () => {
    expect(guessTask("taxi account")).toBe("financial");
    expect(guessTask("taxi")).toBeNull();
  });
});

describe("guessTask on the demo documents", () => {
  const demo = (name: string) => readFileSync(new URL(`../../docs/demo/${name}`, import.meta.url), "utf8");

  it.each(readdirSync(new URL("../../docs/demo/", import.meta.url)).filter((n) => /\.(txt|md)$/.test(n)))("%s", (name) => {
    const expected = /legal|contract/i.test(name) ? "legal" : /financ/i.test(name) ? "financial" : "medical";
    expect(guessTask(`${name} ${demo(name)}`)).toBe(expected);
  });
});
