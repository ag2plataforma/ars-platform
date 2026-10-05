export const CLAIM_PRIORITIES = ['URGENTE', 'ALTA', 'NORMAL', 'BAJA'] as const;
export type ClaimPriority = (typeof CLAIM_PRIORITIES)[number];

export const CLAIM_COMPLEXITIES = ['SIMPLE', 'MEDIA', 'COMPLEJA'] as const;
export type ClaimComplexity = (typeof CLAIM_COMPLEXITIES)[number];

/** Estados de `TClaimFile` en los que tiene sentido pedir (o repetir) el triage. */
export const TRIAGE_ALLOWED_STATES = new Set(['DECLARADO', 'EN_REVISION_REQUISITOS', 'EN_EVALUACION']);

/** Fila de `TClaimTriage` tal como la devuelve la API (columnas en PascalCase, como el resto). */
export interface ClaimTriageRow {
  IdeClaimTriage: string;
  IdeClaimFile: string;
  IdeAiRequest: string | null;
  CodPriority: ClaimPriority;
  CodComplexity: ClaimComplexity;
  DesSummary: string;
  DesReasons: string[];
  DesNextSteps: string[];
  DesModel: string | null;
  CodPriorityFinal: ClaimPriority | null;
  DesDecisionNote: string | null;
  UsrDecision: string | null;
  TstDecision: Date | null;
  UsrCreation: string;
  TstCreation: Date;
}

export const TRIAGE_COLUMNS = `"IdeClaimTriage", "IdeClaimFile", "IdeAiRequest", "CodPriority", "CodComplexity", "DesSummary",
  "DesReasons", "DesNextSteps", "DesModel", "CodPriorityFinal", "DesDecisionNote", "UsrDecision", "TstDecision",
  "UsrCreation", "TstCreation"`;
