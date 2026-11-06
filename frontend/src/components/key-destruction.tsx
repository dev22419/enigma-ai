"use client";
// AI-assisted: Used Claude for the key destruction diagram

export type KeyStage = "live" | "destroying" | "destroyed";

/** Ciphertext, key and plaintext as one diagram. Destroying the key breaks the path; the ciphertext stays. */
export function KeyDestruction({ stage, ciphertext }: { stage: KeyStage; ciphertext?: string | null }) {
  return (
    <figure className="kd" data-stage={stage} aria-label={stage === "live" ? "The key can decrypt the ciphertext" : "The key is destroyed. The ciphertext remains but cannot be decrypted"}>
      <div className="kd-node">
        <span className="kd-label">Ciphertext</span>
        {ciphertext
          ? <code className="kd-cipher">{ciphertext.slice(0, 72)}</code>
          : <span className="kd-note">No longer on Arkiv</span>}
        {ciphertext && <span className="kd-note">Persists</span>}
      </div>

      <svg className="kd-link" viewBox="0 0 220 90" aria-hidden="true">
        <path className="kd-line" d="M0 45 H88" />
        <path className="kd-line kd-line-after" d="M132 45 H220" />
        <g className="kd-key">
          <circle cx="100" cy="45" r="11" />
          <path d="M111 45 H132 M125 45 V54 M131 45 V52" />
        </g>
        <path className="kd-break" d="M96 28 L124 62 M124 28 L96 62" />
      </svg>

      <div className="kd-node kd-out">
        <span className="kd-label">Decryption</span>
        <strong>{stage === "live" ? "Readable" : "Failed"}</strong>
        <span className="kd-note">{stage === "live" ? "Key active" : "Key destroyed"}</span>
      </div>
    </figure>
  );
}
