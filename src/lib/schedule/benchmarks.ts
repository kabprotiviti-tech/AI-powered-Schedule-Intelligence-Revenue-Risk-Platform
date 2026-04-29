// Schedule quality benchmarks — by project type and region.
//
// Sources (synthesised from public industry data — DCMA TAR programmes,
// AACE 67 surveys, GAO schedule audits, Acumen Fuse trend reports, regional
// PMI chapters). Numbers are realistic order-of-magnitude defaults; the
// architecture supports swapping in a live benchmark API later.

export type ProjectType =
  | "MixedUse"
  | "Residential"
  | "Commercial"
  | "Hospitality"
  | "Infrastructure"
  | "Industrial"
  | "Generic";

export type Region =
  | "MENA"      // Middle East & North Africa (UAE, KSA, Qatar, Egypt)
  | "Europe"
  | "Americas"
  | "AsiaPacific"
  | "Global";

export interface BenchmarkValues {
  dcmaScore:           { p25: number; p50: number; p75: number; best: number };  // higher is better
  criticalPathPct:     { p25: number; p50: number; p75: number; best: number };  // lower is better
  highFloatPct:        { p25: number; p50: number; p75: number; best: number };  // lower is better
  logicCompliancePct:  { p25: number; p50: number; p75: number; best: number };  // higher is better
  fsRelationshipPct:   { p25: number; p50: number; p75: number; best: number };  // higher is better
  hardConstraintPct:   { p25: number; p50: number; p75: number; best: number };  // lower is better
  scheduleSlipPctOfDur:{ p25: number; p50: number; p75: number; best: number };  // lower is better
  cpli:                { p25: number; p50: number; p75: number; best: number };  // higher is better
  bei:                 { p25: number; p50: number; p75: number; best: number };  // higher is better
}

// Library: type → region → values
const LIB: Record<ProjectType, Partial<Record<Region, BenchmarkValues>>> = {
  MixedUse: {
    MENA: {
      dcmaScore:            { p25: 58, p50: 71, p75: 84, best: 95 },
      criticalPathPct:      { p25: 28, p50: 18, p75: 11, best: 7 },
      highFloatPct:         { p25: 18, p50: 11, p75: 6,  best: 2 },
      logicCompliancePct:   { p25: 78, p50: 88, p75: 95, best: 99 },
      fsRelationshipPct:    { p25: 76, p50: 86, p75: 92, best: 97 },
      hardConstraintPct:    { p25: 9,  p50: 5,  p75: 2,  best: 0.5 },
      scheduleSlipPctOfDur: { p25: 18, p50: 9,  p75: 3,  best: -2 },
      cpli:                 { p25: 0.82, p50: 0.92, p75: 0.97, best: 1.02 },
      bei:                  { p25: 0.78, p50: 0.88, p75: 0.95, best: 1.00 },
    },
    Global: {
      dcmaScore:            { p25: 60, p50: 73, p75: 86, best: 96 },
      criticalPathPct:      { p25: 26, p50: 17, p75: 10, best: 6 },
      highFloatPct:         { p25: 16, p50: 10, p75: 5,  best: 2 },
      logicCompliancePct:   { p25: 80, p50: 89, p75: 96, best: 99 },
      fsRelationshipPct:    { p25: 78, p50: 88, p75: 94, best: 98 },
      hardConstraintPct:    { p25: 8,  p50: 4,  p75: 2,  best: 0.3 },
      scheduleSlipPctOfDur: { p25: 16, p50: 7,  p75: 1,  best: -3 },
      cpli:                 { p25: 0.84, p50: 0.93, p75: 0.98, best: 1.03 },
      bei:                  { p25: 0.80, p50: 0.90, p75: 0.96, best: 1.01 },
    },
  },
  Residential: {
    MENA: {
      dcmaScore:            { p25: 62, p50: 74, p75: 86, best: 95 },
      criticalPathPct:      { p25: 24, p50: 15, p75: 9,  best: 5 },
      highFloatPct:         { p25: 14, p50: 8,  p75: 4,  best: 1 },
      logicCompliancePct:   { p25: 82, p50: 90, p75: 96, best: 99 },
      fsRelationshipPct:    { p25: 80, p50: 89, p75: 94, best: 98 },
      hardConstraintPct:    { p25: 7,  p50: 4,  p75: 1.5,best: 0.3 },
      scheduleSlipPctOfDur: { p25: 12, p50: 5,  p75: 0,  best: -3 },
      cpli:                 { p25: 0.86, p50: 0.94, p75: 0.98, best: 1.02 },
      bei:                  { p25: 0.82, p50: 0.91, p75: 0.96, best: 1.00 },
    },
    Global: {
      dcmaScore:            { p25: 64, p50: 76, p75: 87, best: 96 },
      criticalPathPct:      { p25: 22, p50: 14, p75: 8,  best: 4 },
      highFloatPct:         { p25: 12, p50: 7,  p75: 3,  best: 1 },
      logicCompliancePct:   { p25: 84, p50: 91, p75: 97, best: 99 },
      fsRelationshipPct:    { p25: 82, p50: 90, p75: 95, best: 98 },
      hardConstraintPct:    { p25: 6,  p50: 3,  p75: 1,  best: 0.2 },
      scheduleSlipPctOfDur: { p25: 10, p50: 4,  p75: -1, best: -4 },
      cpli:                 { p25: 0.88, p50: 0.95, p75: 0.99, best: 1.03 },
      bei:                  { p25: 0.84, p50: 0.92, p75: 0.97, best: 1.01 },
    },
  },
  Commercial: {
    Global: {
      dcmaScore:            { p25: 58, p50: 70, p75: 83, best: 94 },
      criticalPathPct:      { p25: 26, p50: 17, p75: 10, best: 6 },
      highFloatPct:         { p25: 17, p50: 11, p75: 5,  best: 2 },
      logicCompliancePct:   { p25: 78, p50: 88, p75: 95, best: 98 },
      fsRelationshipPct:    { p25: 76, p50: 86, p75: 93, best: 97 },
      hardConstraintPct:    { p25: 9,  p50: 5,  p75: 2,  best: 0.5 },
      scheduleSlipPctOfDur: { p25: 14, p50: 6,  p75: 0,  best: -3 },
      cpli:                 { p25: 0.83, p50: 0.92, p75: 0.97, best: 1.02 },
      bei:                  { p25: 0.79, p50: 0.89, p75: 0.96, best: 1.00 },
    },
  },
  Hospitality: {
    Global: {
      dcmaScore:            { p25: 56, p50: 68, p75: 81, best: 92 },
      criticalPathPct:      { p25: 30, p50: 20, p75: 12, best: 7 },
      highFloatPct:         { p25: 20, p50: 13, p75: 7,  best: 3 },
      logicCompliancePct:   { p25: 75, p50: 85, p75: 93, best: 98 },
      fsRelationshipPct:    { p25: 74, p50: 84, p75: 91, best: 96 },
      hardConstraintPct:    { p25: 11, p50: 6,  p75: 3,  best: 0.8 },
      scheduleSlipPctOfDur: { p25: 22, p50: 12, p75: 4,  best: -1 },
      cpli:                 { p25: 0.78, p50: 0.88, p75: 0.95, best: 1.00 },
      bei:                  { p25: 0.74, p50: 0.85, p75: 0.93, best: 0.99 },
    },
  },
  Infrastructure: {
    MENA: {
      dcmaScore:            { p25: 64, p50: 75, p75: 86, best: 94 },
      criticalPathPct:      { p25: 22, p50: 14, p75: 8,  best: 5 },
      highFloatPct:         { p25: 13, p50: 7,  p75: 3,  best: 1 },
      logicCompliancePct:   { p25: 84, p50: 92, p75: 97, best: 99 },
      fsRelationshipPct:    { p25: 82, p50: 90, p75: 95, best: 98 },
      hardConstraintPct:    { p25: 6,  p50: 3,  p75: 1,  best: 0.2 },
      scheduleSlipPctOfDur: { p25: 14, p50: 6,  p75: 0,  best: -4 },
      cpli:                 { p25: 0.86, p50: 0.94, p75: 0.98, best: 1.02 },
      bei:                  { p25: 0.82, p50: 0.91, p75: 0.97, best: 1.01 },
    },
    Global: {
      dcmaScore:            { p25: 66, p50: 77, p75: 88, best: 95 },
      criticalPathPct:      { p25: 20, p50: 13, p75: 7,  best: 4 },
      highFloatPct:         { p25: 11, p50: 6,  p75: 2,  best: 0.5 },
      logicCompliancePct:   { p25: 86, p50: 93, p75: 97, best: 99 },
      fsRelationshipPct:    { p25: 84, p50: 92, p75: 96, best: 99 },
      hardConstraintPct:    { p25: 5,  p50: 2.5,p75: 0.8,best: 0.1 },
      scheduleSlipPctOfDur: { p25: 12, p50: 4,  p75: -1, best: -5 },
      cpli:                 { p25: 0.88, p50: 0.95, p75: 0.99, best: 1.03 },
      bei:                  { p25: 0.84, p50: 0.93, p75: 0.98, best: 1.01 },
    },
  },
  Industrial: {
    Global: {
      dcmaScore:            { p25: 62, p50: 74, p75: 85, best: 95 },
      criticalPathPct:      { p25: 24, p50: 15, p75: 9,  best: 5 },
      highFloatPct:         { p25: 14, p50: 8,  p75: 4,  best: 1 },
      logicCompliancePct:   { p25: 82, p50: 90, p75: 96, best: 99 },
      fsRelationshipPct:    { p25: 80, p50: 89, p75: 94, best: 98 },
      hardConstraintPct:    { p25: 7,  p50: 4,  p75: 1.5,best: 0.3 },
      scheduleSlipPctOfDur: { p25: 13, p50: 5,  p75: -1, best: -4 },
      cpli:                 { p25: 0.86, p50: 0.94, p75: 0.98, best: 1.02 },
      bei:                  { p25: 0.82, p50: 0.92, p75: 0.97, best: 1.01 },
    },
  },
  Generic: {
    Global: {
      dcmaScore:            { p25: 60, p50: 73, p75: 85, best: 95 },
      criticalPathPct:      { p25: 25, p50: 16, p75: 9,  best: 5 },
      highFloatPct:         { p25: 15, p50: 9,  p75: 4,  best: 1 },
      logicCompliancePct:   { p25: 80, p50: 89, p75: 96, best: 99 },
      fsRelationshipPct:    { p25: 78, p50: 88, p75: 94, best: 98 },
      hardConstraintPct:    { p25: 8,  p50: 4,  p75: 2,  best: 0.5 },
      scheduleSlipPctOfDur: { p25: 14, p50: 6,  p75: 0,  best: -3 },
      cpli:                 { p25: 0.85, p50: 0.93, p75: 0.98, best: 1.02 },
      bei:                  { p25: 0.81, p50: 0.91, p75: 0.96, best: 1.00 },
    },
  },
};

export function getBenchmark(type: ProjectType, region: Region): BenchmarkValues {
  return (
    LIB[type][region] ??
    LIB[type].Global ??
    LIB.Generic[region] ??
    LIB.Generic.Global!
  );
}

export const PROJECT_TYPES: { id: ProjectType; label: string }[] = [
  { id: "MixedUse",       label: "Mixed-Use Development" },
  { id: "Residential",    label: "Residential" },
  { id: "Commercial",     label: "Commercial" },
  { id: "Hospitality",    label: "Hospitality / Leisure" },
  { id: "Infrastructure", label: "Infrastructure" },
  { id: "Industrial",     label: "Industrial / Manufacturing" },
  { id: "Generic",        label: "Generic" },
];

export const REGIONS: { id: Region; label: string }[] = [
  { id: "MENA",        label: "MENA (Middle East & N. Africa)" },
  { id: "Europe",      label: "Europe" },
  { id: "Americas",    label: "Americas" },
  { id: "AsiaPacific", label: "Asia-Pacific" },
  { id: "Global",      label: "Global" },
];
