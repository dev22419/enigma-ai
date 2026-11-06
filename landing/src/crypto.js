// AI-assisted: Used Claude for the landing page visuals and animation
// Fictional sample. Braces mark the terms the enclave window highlights.
export const SAMPLE_DOC = `MASTER SERVICES AGREEMENT
Between Harbourline Diagnostics Pvt. Ltd. ("Client") and Vantara Clinical Systems LLP ("Provider").
Effective date {14 January 2026}. Governing law: India. Courts of {Mumbai} have exclusive jurisdiction.

1. SERVICES. Provider shall process laboratory records for the Client under each Statement of Work.
2. FEES. Client shall pay {INR 18,40,000} per quarter within 30 days of a valid tax invoice.
3. CONFIDENTIALITY. Each party shall hold the other's records in confidence for {seven years}.
4. PERSONAL DATA. Provider acts as data processor and shall follow documented instructions only.
5. SECURITY. Provider shall report any personal data breach to the Client within {six hours}.
6. AUDIT. Client may audit Provider's controls once per year on fifteen business days' notice.
7. {AUTO-RENEWAL}. This Agreement renews for {24 months} unless notice is given {90 days} before expiry.
8. LIABILITY. Aggregate liability is capped at the fees paid in the preceding {twelve months}.
9. TERMINATION. Either party may terminate for material breach not cured within thirty days.
10. PATIENT RECORDS. Records of {Ward 4B} shall not leave the Client's systems unencrypted.
11. SUBPROCESSORS. Provider shall not appoint a subprocessor without prior written consent.
12. RETURN OF DATA. On termination Provider shall delete all Client data within {30 days}.
`;

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
};

export async function sha256Hex(bytes) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}
