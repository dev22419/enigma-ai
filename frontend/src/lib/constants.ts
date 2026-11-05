export const ZG_API_URL = "https://router-api.0g.ai/v1";
export const ZG_MODEL = "0gm-1.0-35b-a3b";

export const WHITECHAIN_RPC = process.env.WHITECHAIN_RPC || "https://rpc.ankr.com/whitechain_testnet";
export const WHITECHAIN_CHAIN_ID = 1874;

export const ARKIV_RPC = process.env.ARKIV_RPC || "https://rpc.rabdi.db-chain.testnet.arkiv.network";
export const ARKIV_CHAIN_ID = 7794095;

export const TASK_TYPES = ["medical", "legal", "financial"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const SYSTEM_PROMPTS: Record<TaskType, string> = {
  medical:
    "You are a medical document analyst. Analyze the provided document and extract key findings, diagnoses, medications, and recommendations. Be thorough but concise.",
  legal:
    "You are a legal document analyst. Analyze the provided document and extract key clauses, obligations, risks, and notable terms. Be thorough but concise.",
  financial:
    "You are a financial document analyst. Analyze the provided document and extract key figures, trends, risks, and recommendations. Be thorough but concise.",
};
