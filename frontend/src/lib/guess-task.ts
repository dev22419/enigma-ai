// AI-assisted: Used Claude to write this file.
import type { TaskType } from "./constants";

const WORDS: Record<TaskType, string[]> = {
  medical: ["patient", "diagnosis", "clinic", "hospital", "doctor", "prescription", "medication", "dosage", "allergy", "blood", "haemoglobin", "hemoglobin", "hba1c", "glucose", "lab report", "symptom", "referral", "medical", "health"],
  legal: ["contract", "agreement", "clause", "liability", "indemnity", "party", "parties", "termination", "supplier", "jurisdiction", "governing law", "obligation", "lease", "court", "legal", "nda", "renewal"],
  financial: ["revenue", "profit", "loss", "balance sheet", "cash flow", "invoice", "bank statement", "account", "transaction", "expense", "tax", "gst", "quarterly", "dividend", "financial", "income", "salary"],
};

/** Enough to tell a document's kind without walking through a whole long file. */
const SCAN = 20_000;

/**
 * Picks the kind of document from its words, in the browser, so the model gets the right instructions.
 * Returns null when nothing matches or two kinds tie, and the caller keeps its current choice.
 */
export function guessTask(text: string): TaskType | null {
  const haystack = text.slice(0, SCAN).toLowerCase();
  const scores = (Object.keys(WORDS) as TaskType[])
    .map((task) => ({
      task,
      hits: WORDS[task].reduce((sum, word) => sum + (haystack.match(new RegExp(`\\b${word}\\b`, "g"))?.length ?? 0), 0),
    }))
    .sort((a, b) => b.hits - a.hits);
  return scores[0].hits > scores[1].hits ? scores[0].task : null;
}
