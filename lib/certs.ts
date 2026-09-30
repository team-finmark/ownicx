// Certifications and assurance claims the Security page can show. Managers switch them on in
// Settings; only switch one on when the certificate or test report exists — it's a public claim.

export const CERTS = [
  { key: "iso27001", name: "ISO/IEC 27001", what: "Information security management", onLabel: "Certified" },
  { key: "iso9001", name: "ISO 9001", what: "Quality management", onLabel: "Certified" },
  { key: "gdpr", name: "GDPR & India DPDP Act", what: "Consent, access, erasure, purpose limitation", onLabel: "Compliant" },
  { key: "owasp", name: "OWASP Top 10", what: "Periodic third-party penetration testing", onLabel: "Tested" },
  { key: "cwe", name: "CWE/SANS Top 25", what: "Software-error testing by specialised partners", onLabel: "Tested" },
] as const;

export type CertKey = (typeof CERTS)[number]["key"];

export interface CertState {
  on: boolean;
  evidence: string | null; // link to certificate / report, or a certificate number
  updated_at: string | null;
}

export type Certifications = Partial<Record<CertKey, CertState>>;

export const certState = (c: Certifications | null | undefined, key: CertKey): CertState => c?.[key] ?? { on: false, evidence: null, updated_at: null };
