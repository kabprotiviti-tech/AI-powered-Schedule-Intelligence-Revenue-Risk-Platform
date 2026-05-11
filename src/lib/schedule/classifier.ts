// Project Classifier — reads project name + WBS + activity names from a parsed
// Primavera / MSP schedule and infers what the project IS:
//
//   • Asset type     — High-Rise Residential, Office Tower, Mall, Hotel, Villa,
//                       Hospital, School, Bridge, Road, Tunnel, Airport, etc.
//   • Tier           — A (mega), B (mid), C (small) by combined scale signals
//   • Floor structure — basement / podium / typical / mezz / penthouse / roof
//   • Components     — civil · structural · facade · MEP · fit-out · external · marine
//
// All inference is heuristic (keyword + structural pattern) over schedule text.
// Each fact carries a confidence so the UI can show "?" when low-signal.
//
// Standards alignment:
//   - Asset taxonomy mirrors RICS NRM / RIBA Plan of Work asset classification
//   - Tier thresholds derived from AACE 17R-97 estimate-class size bands
//   - Component segmentation aligns with NRM 1 cost-plan elemental hierarchy

import type { Schedule } from "./types";

// ── Source-weighted corpus ─────────────────────────────────────────────────
// Different parts of a schedule carry different signal quality:
//   project name / code  → curated, intentional, high signal
//   top-level WBS        → scope decomposition, planner-authored
//   deep WBS / activities → operational detail, noisy
// Each text gets a weight; weighted match counts beat raw match counts because
// 200 activity hits on "junction box" (electrical) should not outweigh one
// project-name hit on "Residential Tower".
type SourceText = { text: string; weight: number };

// ── Asset type taxonomy ─────────────────────────────────────────────────────
// Scoped to real-estate developer portfolios. A developer like ALDAR / Emaar /
// Aldar Properties builds buildings (residential, commercial, hospitality,
// civic) plus the masterplan-level packages around them (roads inside the
// development, utilities, landscape). Pure infrastructure contractor work
// (bridges, tunnels, airports, rail, ports) is intentionally NOT here — those
// belong to a different tool. Marine works survive as a component (used on
// waterfront villas/hotels), not as a top-level asset type.
export type AssetType =
  | "HighRiseResidential"
  | "MidRiseResidential"
  | "Villa"
  | "OfficeTower"
  | "MixedUseTower"
  | "RetailMall"
  | "Hospitality"
  | "Industrial"            // logistics / warehouse — developers do these
  | "Healthcare"
  | "Education"
  | "Government"
  | "Cultural"              // mosque, church, museum, theatre, community centre
  | "SiteInfrastructure"    // masterplan roads, utilities, district cooling — standalone packages
  | "Landscape"             // standalone landscape / public realm phase
  | "Generic";

export const ASSET_LABELS: Record<AssetType, string> = {
  HighRiseResidential:  "High-Rise Residential",
  MidRiseResidential:   "Mid-Rise Residential",
  Villa:                "Villa / Townhouse",
  OfficeTower:          "Office / Commercial",
  MixedUseTower:        "Mixed-Use Development",
  RetailMall:           "Retail / Mall",
  Hospitality:          "Hotel / Hospitality",
  Industrial:           "Industrial / Logistics",
  Healthcare:           "Healthcare",
  Education:            "Education",
  Government:           "Government / Civic",
  Cultural:             "Cultural / Religious",
  SiteInfrastructure:   "Site Infrastructure",
  Landscape:            "Landscape / Public Realm",
  Generic:              "Generic / Unclassified",
};

export type Tier = "A" | "B" | "C";
export const TIER_LABELS: Record<Tier, string> = {
  A: "Tier A — Mega / Complex",
  B: "Tier B — Mid-Scale",
  C: "Tier C — Small / Simple",
};

export type Component =
  | "Civil"          // earthworks, excavation, piling
  | "Structural"     // concrete, steel, post-tension, columns, slabs
  | "Facade"         // cladding, curtain wall, glazing
  | "MEP"            // mechanical, electrical, plumbing, HVAC, fire, BMS
  | "FitOut"         // partitions, ceilings, joinery, finishes, FF&E
  | "External"       // landscape, hardscape, roads internal, utilities external
  | "Marine"         // breakwater, jetty, piling marine
  | "VerticalTransport" // lifts, escalators
  | "Specialty";     // pool, gym, kitchen equipment, lab fitouts

export interface FloorBreakdown {
  basements: number;          // B1, B2, …
  basementNumbers: number[];  // [1, 2, 3] for audit
  podiumLevels: number;       // P1, P2 (often parking / retail)
  podiumNumbers: number[];    // [1, 2, 3, 4]
  typicalFloors: number;      // standard residential / office floors
  typicalNumbers: number[];   // [1, 2, ... 11]
  mezzanines: number;
  hasLowerGround: boolean;    // LG / LGF — counts as ground variant
  hasGroundFloor: boolean;
  hasUpperGround: boolean;    // UG — sits between GF and podium in some conventions
  hasRoof: boolean;
  hasPenthouse: boolean;
  hasPlantLevel: boolean;     // dedicated MEP / service floor
  totalAboveGrade: number;    // GF + podium + typical + mezz + penthouse + plant
  // Evidence: each detected level/marker with the WBS node text it came from.
  // Lets the UI render "L05 — found in 'Tower 1 > Superstructure > L05 Slab'"
  // and lets a reviewer audit whether the count is right.
  evidence: { marker: string; bucket: string; source: string }[];
}

// Alternates — runner-up asset classifications. A mixed-use hospital tower
// is plausibly Healthcare AND MixedUseTower; rather than force a single label
// we surface the next 2-3 contenders so reviewers can see the ambiguity.
export interface AssetAlternate {
  type:       AssetType;
  label:      string;
  confidence: number;     // 0..1 relative to the dominant
}

export interface ProjectSnapshot {
  // Asset / type
  assetType:        AssetType;
  assetLabel:       string;
  assetConfidence:  number;         // 0..1
  assetEvidence:    string[];       // matched keywords + WBS paths
  alternates:       AssetAlternate[]; // runner-ups; first 2-3, may be empty

  // Tier
  tier:             Tier;
  tierLabel:        string;
  tierConfidence:   number;
  tierRationale:    string;
  tierStandard:     string;         // e.g. "AACE 17R-97 Class 3 · PMI complexity: Mid"

  // Override — true when a manual reclassification is pinned
  overridden:       boolean;

  // Floors
  floors:           FloorBreakdown;

  // Components / scope
  components:       Component[];
  componentDetails: Record<Component, { detected: boolean; matches: number }>;

  // Scale signals (for transparency)
  scale: {
    activities:        number;
    wbsNodes:          number;
    durationDays:      number;
    estimatedFloorArea?: string;     // qualitative ("large", "small") until cost data lands
  };

  // Summary line
  headline:         string;          // e.g. "High-Rise Residential · 38 floors"
}

// Manual reclassification supplied by a reviewer. Wins over heuristic output.
export interface ClassifierOverrideInput {
  assetType: AssetType;
  tier:      Tier;
}

// ── Keyword sets ────────────────────────────────────────────────────────────
// Tuned for real-estate developer schedules. Keywords reflect names commonly
// found in P6/MSP WBS for residential/commercial/hospitality projects in the
// GCC and similar markets.
const ASSET_KEYWORDS: Record<AssetType, RegExp[]> = {
  HighRiseResidential: [
    /\b(residential\s+tower|apartment\s+tower|tower\s+block|residences)\b/i,
    /\b(condo|condominium|apartments|flats|dwellings|units)\b/i,
  ],
  MidRiseResidential: [
    /\b(low[-\s]rise\s+residential|mid[-\s]rise\s+residential|residential\s+block|residential\s+building)\b/i,
    /\b(walk-up|townhomes|housing\s+complex)\b/i,
  ],
  Villa: [
    /\b(villa|villas|townhouse|townhouses|duplex|triplex|beachfront\s+home|family\s+home|garden\s+home)\b/i,
    /\b(single[-\s]family|standalone\s+residence)\b/i,
  ],
  OfficeTower: [
    /\b(office\s+(tower|building|park|complex)|commercial\s+tower|headquarters|corporate\s+(tower|building|HQ))\b/i,
    /\b(business\s+(park|center|centre|hub)|workspace\s+tower)\b/i,
  ],
  MixedUseTower: [
    /\b(mixed[-\s]use|hybrid\s+(tower|building)|integrated\s+development|live[-\s]work[-\s]play)\b/i,
  ],
  RetailMall: [
    /\b(mall|shopping\s+(center|centre|complex)|retail\s+(complex|destination)|outlet|souk|marketplace|department\s+store)\b/i,
    /\b(hypermarket|supermarket\s+anchor|food\s+court)\b/i,
  ],
  Hospitality: [
    /\b(hotel|resort|hospitality|guest\s+(room|house)|key\s+count|branded\s+residence|serviced\s+apartment|aparthotel)\b/i,
    /\b(spa|wellness\s+center|banquet|ballroom)\b/i,
  ],
  Industrial: [
    /\b(warehouse|distribution\s+center|logistics\s+(hub|park)|factory|plant|manufacturing|industrial\s+(unit|park)|cold\s+storage)\b/i,
    /\b(loading\s+dock|silo|production\s+line)\b/i,
  ],
  Healthcare: [
    /\b(hospital|clinic|medical\s+(center|centre|facility)|healthcare|polyclinic|dialysis|surgical\s+(suite|center)|ICU)\b/i,
    /\b(operating\s+(theatre|room)|patient\s+(room|ward)|pharmacy)\b/i,
  ],
  Education: [
    /\b(school|university|college|campus|academy|institute|kindergarten|nursery|classroom|laboratory|lab\s+block)\b/i,
    /\b(lecture\s+hall|library|auditorium)\b/i,
  ],
  Government: [
    /\b(government|municipal|ministry|embassy|consulate|civic\s+(center|centre)|courthouse|police\s+(station|HQ)|customs)\b/i,
  ],
  Cultural: [
    /\b(mosque|church|cathedral|synagogue|temple|museum|gallery|theatre|theater|opera|concert\s+hall|cultural\s+center|cultural\s+centre|community\s+(center|centre))\b/i,
  ],
  // Standalone masterplan packages: roads/utilities/district cooling that are
  // contracted as their own project rather than as scope within a building.
  SiteInfrastructure: [
    /\b(masterplan|master\s+plan|site\s+infrastructure|infrastructure\s+(works|package)|enabling\s+works)\b/i,
    /\b(internal\s+road\s+network|spine\s+road|primary\s+road|secondary\s+road|service\s+road\s+network)\b/i,
    /\b(district\s+cooling|district\s+heating|chiller\s+plant\s+package|substation\s+package|main\s+substation)\b/i,
    /\b(water\s+treatment|sewage\s+treatment|STP|WTP|switchyard|pumping\s+station\s+package|reservoir|deep\s+sewer)\b/i,
    /\b(utilities\s+(diversion|package)|trunk\s+(main|sewer|cable))\b/i,
  ],
  Landscape: [
    /\b(landscape\s+(only|package|works)|public\s+realm|plaza|hardscape\s+package|softscape\s+package|community\s+park|botanical|streetscape|park\s+(package|development))\b/i,
  ],
  Generic: [],
};

// ── Suppression patterns ───────────────────────────────────────────────────
// Each asset type has phrases that, when matched, indicate the keyword is
// being used in a *non-asset* context — typically a sub-feature of a building
// rather than the building's primary type. Suppressed matches are subtracted
// from that asset's raw hit count before weighting.
//
// This is the core fix for the "8-floor schedule classified as highway" bug:
// every building has "internal road", "junction box", "loading dock", and
// those should not fire infrastructure classifications.
const SUPPRESS_CONTEXT: Partial<Record<AssetType, RegExp[]>> = {
  // Site infrastructure: a building has internal roads / junction boxes / a
  // chiller plant room / a building substation — those are sub-scope of a
  // building project, not a standalone site-works package.
  SiteInfrastructure: [
    /\b(internal|service|access|site|perimeter|fire|emergency|loop|main|ring|approach)\s+road\b/i,
    /\b(electrical\s+)?junction\s+box(es)?\b/i,
    /\bj[-\s]?box\b/i,
    /\b(road|kerb|curb)\s+stones?\b/i,
    /\bdriveway\s+(asphalt|paving)\b/i,
    /\b(building|main|electrical|mv|hv|lv)\s+substation\b/i,
    /\b(chiller|district\s+cooling|cooling)\s+plant\s+room\b/i,
    /\b(domestic|booster)\s+pumping\s+station\b/i,
  ],
  Healthcare: [
    /\b(prayer|wellness|staff|fitness|first\s+aid)\s+(room|clinic|center|centre)\b/i,
    /\bmedical\s+room\b/i,
  ],
  Cultural: [
    /\bprayer\s+room\b/i,
  ],
  Education: [
    /\btraining\s+room\b/i,
    /\bschool\s+furniture\b/i,
  ],
  Industrial: [
    /\b(plant|equipment)\s+room\b/i,
  ],
  Landscape: [
    // Internal landscape inside a building scope isn't a Landscape *project*
    /\b(internal|courtyard|atrium|lobby)\s+landscape\b/i,
  ],
};

// Strong signals that override otherwise ambiguous matches.
// Patterns are tightened to require asset-context anchors so common English
// words ("OR", "key milestones") don't trigger false classifications.
// Pure-infrastructure overrides (airport/marine/bridge/tunnel/rail) removed
// with the taxonomy slimdown — those asset types no longer exist.
const STRONG_OVERRIDES: { test: RegExp; type: AssetType }[] = [
  // "350 keys" only counts when adjacent to hotel context, not "12 key milestones"
  { test: /\b\d+\s+keys?\s+(hotel|resort|hospitality|room|suite)|\b(hotel|resort)\s+\d+\s+keys?\b/i, type: "Hospitality" },
  // ICU / operating theatre only — bare "OR" was matching the English conjunction
  { test: /\b(ICU|NICU|PICU|operating\s+theatre|operating\s+room|surgical\s+suite)\b/i, type: "Healthcare" },
  // OR with a number suffix (OR-1, OR1, OR 5) — actual operating-room codes
  { test: /\bOR[-\s]?\d+\b/,                         type: "Healthcare" },
];

// ── Component keyword sets ─────────────────────────────────────────────────
const COMPONENT_KEYWORDS: Record<Component, RegExp> = {
  Civil:              /\b(earthwork|excavation|cut\s+and\s+fill|backfill|piling|pile\s+cap|shoring|sheet\s+pile|dewatering|grading|surveying|setting\s+out|substructure|raft\s+foundation|mat\s+foundation|footing|pile\s+integrity)\b/i,
  Structural:         /\b(reinforced\s+concrete|RC|post[-\s]tension|PT\s+slab|formwork|rebar|reinforcement|columns?|beams?|slabs?|shear\s+wall|core\s+wall|structural\s+steel|composite\s+(slab|deck)|superstructure)\b/i,
  Facade:             /\b(facade|curtain\s+wall|cladding|glazing|aluminium\s+(cladding|panel)|GRC|GRP|stone\s+cladding|unitised|spider\s+glazing|skylight|window\s+(install|wall))\b/i,
  MEP:                /\b(MEP|HVAC|chiller|FCU|AHU|VRF|VRV|cooling\s+tower|fire[-\s]fighting|fire\s+alarm|sprinkler|electrical\s+(panel|distribution)|MV\s+room|LV\s+room|plumbing|drainage|sanitary|BMS|ELV|CCTV|access\s+control|public\s+address|nurse\s+call)\b/i,
  FitOut:             /\b(fit[-\s]out|finishes|partitions?|gypsum|drywall|ceilings?|tiles?|flooring|paint(ing)?|joinery|millwork|cabinetry|wardrobe|kitchen\s+(cabinet|fit)|FF&E|furniture)\b/i,
  External:           /\b(landscape|hardscape|softscape|external\s+works|paving\s+(block|stone)|sidewalk|kerb|curb|street\s+lighting|external\s+drainage|stormwater|irrigation|planting)\b/i,
  Marine:             /\b(breakwater|seawall|jetty|piling\s+marine|caisson|dredg(e|ing)|reclamation|quay\s+wall|coastal)\b/i,
  VerticalTransport:  /\b(lift|elevator|escalator|moving\s+walkway|dumbwaiter)\b/i,
  Specialty:          /\b(swimming\s+pool|spa\s+equipment|gym\s+equipment|kitchen\s+equipment|laboratory\s+(equipment|fitout)|theatre\s+lighting|cinema\s+seating|ride\s+(install|commissioning))\b/i,
};

// ── Floor markers ──────────────────────────────────────────────────────────
// Patterns require explicit anchors (Level/Floor/Lvl/L##/B##/P##) so activity
// text like "F4 grade concrete" doesn't pollute floor counts.
//
// Two-stage matching:
//  1. Whole-text patterns (single-shot, scan full WBS strings) catch compound
//     phrases like "Basement Level 2", "Lower Ground", "Service Floor 5",
//     "Plant Room Level", "Tower Floor 12".
//  2. Token-level patterns (per whitespace-split token) catch compact forms
//     "B01", "P-2", "L12", "12F".
type Bucket = "basement" | "podium" | "ground" | "lowerGround" | "upperGround" |
              "mezz" | "typical" | "penthouse" | "roof" | "plant";

const WHOLE_TEXT_PATTERNS: { re: RegExp; bucket: Bucket }[] = [
  { re: /\b(basement|bsmt)\s+(level\s+|lvl\s+)?(\d{1,2})\b/i,            bucket: "basement" },
  { re: /\b(podium|pod)\s+(level\s+|lvl\s+)?(\d{1,2})\b/i,                bucket: "podium" },
  { re: /\b(lower\s+ground|lgf|lg\b)/i,                                   bucket: "lowerGround" },
  { re: /\b(upper\s+ground|ugf|ug\b)/i,                                   bucket: "upperGround" },
  { re: /\b(ground\s+floor|gf|g\.f\.?)\b/i,                               bucket: "ground" },
  { re: /\b(mezzanine|mezz)\s*\d?/i,                                      bucket: "mezz" },
  { re: /\b(penthouse|pent[-\s]?house)\b/i,                               bucket: "penthouse" },
  { re: /\b(roof\s+top|rooftop|roof\s+level|roof\s+slab|roof\s+plant)\b/i,bucket: "roof" },
  { re: /\b(plant\s+room\s+level|plant\s+level|mep\s+(floor|level)|service\s+floor)\b/i, bucket: "plant" },
  // "Level 12", "Lvl 01", "Floor 12", "12th Floor", "Tower Floor 5", "Guest Floor 8"
  { re: /\b(tower\s+|guest\s+|typical\s+)?(level|lvl|floor|fl)\s+(\d{1,2})\b/i, bucket: "typical" },
  { re: /\b(\d{1,2})(st|nd|rd|th)\s+floor\b/i,                            bucket: "typical" },
];

// Token-level patterns (each WBS token tested individually after split)
const TOKEN_PATTERNS: { re: RegExp; bucket: Bucket; captureIdx: number }[] = [
  { re: /^B(\d{1,2})$/,           bucket: "basement", captureIdx: 1 },  // B01
  { re: /^B-(\d{1,2})$/,          bucket: "basement", captureIdx: 1 },  // B-01
  { re: /^P(\d{1,2})$/,           bucket: "podium",   captureIdx: 1 },  // P01
  { re: /^P-(\d{1,2})$/,          bucket: "podium",   captureIdx: 1 },
  { re: /^L(\d{1,2})$/,           bucket: "typical",  captureIdx: 1 },  // L01
  { re: /^L-(\d{1,2})$/,          bucket: "typical",  captureIdx: 1 },
  { re: /^F(\d{1,2})$/,           bucket: "typical",  captureIdx: 1 },  // F12
  { re: /^(\d{1,2})F$/,           bucket: "typical",  captureIdx: 1 },  // 12F
  { re: /^M(\d{1,2})$/,           bucket: "mezz",     captureIdx: 1 },  // M01 numbered mezz
  { re: /^MZ(\d{1,2})$/,          bucket: "mezz",     captureIdx: 1 },
];

// ── Asset-type groupings for the vertical-vs-flat gate ─────────────────────
const BUILDING_TYPES: AssetType[] = [
  "HighRiseResidential", "MidRiseResidential", "Villa", "OfficeTower",
  "MixedUseTower", "RetailMall", "Hospitality", "Industrial",
  "Healthcare", "Education", "Government", "Cultural",
];
// Flat / horizontal scope — site-wide infrastructure or landscape packages.
// If a schedule has clear building evidence (floors/podium/basement) these
// can only win by dominating building evidence by ≥3× (vertical-vs-flat gate).
const FLAT_INFRA_TYPES: AssetType[] = [
  "SiteInfrastructure", "Landscape",
];

// ── Helpers ────────────────────────────────────────────────────────────────
// Build a source-weighted corpus. Each text fragment carries the weight of
// its origin (project name = 10, top WBS = 5, deep WBS = 1, activity = 0.2).
// This is what stops a few "internal road" activities outweighing a clear
// "Residential Tower" project name.
function buildCorpus(s: Schedule): SourceText[] {
  const out: SourceText[] = [];
  if (s.project.name) out.push({ text: s.project.name, weight: 10 });
  if (s.project.code) out.push({ text: s.project.code, weight: 5 });

  // Compute WBS depth via parent chain
  const byId = new Map(s.wbs.map((w) => [w.id, w]));
  const depthCache = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id);
    if (!node || !node.parentId || !byId.has(node.parentId)) {
      depthCache.set(id, 0);
      return 0;
    }
    const d = 1 + depthOf(node.parentId);
    depthCache.set(id, d);
    return d;
  };
  for (const w of s.wbs) {
    const d = depthOf(w.id);
    const weight = d <= 1 ? 5 : d <= 3 ? 2 : 1;
    if (w.name) out.push({ text: w.name, weight });
    if (w.code) out.push({ text: w.code, weight: weight * 0.4 });
  }

  // Activity names — capped, low weight. Activity codes are skipped (they're
  // mostly opaque IDs and contribute pure noise).
  const ACT_LIMIT = 2000;
  for (let i = 0; i < Math.min(ACT_LIMIT, s.activities.length); i++) {
    const a = s.activities[i];
    if (a.name) out.push({ text: a.name, weight: 0.2 });
  }
  return out;
}

function detectAsset(
  corpus: SourceText[],
  floors: FloorBreakdown,
): { type: AssetType; confidence: number; evidence: string[]; alternates: AssetAlternate[] } {
  // Strong overrides — but only on high-weight sources (project name + top WBS).
  // Activity-level overrides cause too many false positives.
  const strongText = corpus.filter((s) => s.weight >= 2).map((s) => s.text).join(" \n ");
  for (const o of STRONG_OVERRIDES) {
    const m = strongText.match(o.test);
    if (m) {
      return { type: o.type, confidence: 0.95, evidence: [m[0]], alternates: [] };
    }
  }

  // Weighted scoring with per-source suppression
  const scores: Partial<Record<AssetType, { weighted: number; rawHits: number; samples: string[] }>> = {};

  for (const src of corpus) {
    for (const [type, regexes] of Object.entries(ASSET_KEYWORDS) as [AssetType, RegExp[]][]) {
      if (regexes.length === 0) continue;

      let hits = 0;
      const localSamples: string[] = [];
      for (const re of regexes) {
        const found = src.text.match(new RegExp(re.source, re.flags + "g"));
        if (found) {
          hits += found.length;
          for (const h of found.slice(0, 2)) localSamples.push(h);
        }
      }
      if (hits === 0) continue;

      // Subtract suppression matches in the same source text
      const suppressors = SUPPRESS_CONTEXT[type] ?? [];
      let suppressed = 0;
      for (const sre of suppressors) {
        const sfound = src.text.match(new RegExp(sre.source, sre.flags + "g"));
        if (sfound) suppressed += sfound.length;
      }
      const netHits = Math.max(0, hits - suppressed);
      if (netHits === 0) continue;

      const entry = scores[type] ?? { weighted: 0, rawHits: 0, samples: [] };
      entry.weighted += netHits * src.weight;
      entry.rawHits += netHits;
      for (const s of localSamples) {
        if (entry.samples.length >= 5) break;
        if (!entry.samples.includes(s)) entry.samples.push(s);
      }
      scores[type] = entry;
    }
  }

  // ── Vertical-vs-flat gate ────────────────────────────────────────────────
  // If there is *any* building-side evidence, flat-infrastructure types
  // (road / bridge / tunnel / airport / marine / rail / utility / landscape)
  // can only win if their weighted score dominates the best building score
  // by ≥ 3×. Floor counts also count as building evidence — a schedule with
  // basements or multiple floors is structurally a building, not a road.
  const bestBuildingScore = Math.max(
    0,
    ...BUILDING_TYPES.map((t) => scores[t]?.weighted ?? 0),
  );
  const floorEvidence =
    (floors.totalAboveGrade >= 2 ? 20 : 0) +
    (floors.basements > 0 ? 15 : 0) +
    (floors.podiumLevels > 0 ? 10 : 0);
  const buildingFloor = Math.max(bestBuildingScore, floorEvidence);

  if (buildingFloor > 0) {
    for (const t of FLAT_INFRA_TYPES) {
      const s = scores[t];
      if (!s) continue;
      if (s.weighted < buildingFloor * 3) delete scores[t];
    }
  }

  // Rank survivors
  const sorted = (Object.entries(scores) as [AssetType, NonNullable<typeof scores[AssetType]>][])
    .filter(([, v]) => v !== undefined)
    .sort((a, b) => b[1].weighted - a[1].weighted);

  if (sorted.length === 0) {
    return { type: "Generic", confidence: 0, evidence: [], alternates: [] };
  }

  let [topType, topData] = sorted[0];

  // Minimum threshold: weighted score must clear 5. One project-name hit
  // (weight 10, ≥0.5 net) clears it easily; 25 activity hits (0.2 weight)
  // also clears. Lower scores read as "Generic — too little evidence".
  if (topData.weighted < 5) {
    return { type: "Generic", confidence: 0.2, evidence: topData.samples, alternates: [] };
  }

  // ── Height correction ────────────────────────────────────────────────────
  // The keyword "residential tower" matches HighRiseResidential, but if the
  // detected floor count is only 4, it's structurally a mid-rise. Same for
  // OfficeTower with single-digit floors. Building convention:
  //   ≥ 12 above-grade floors → high-rise
  //   4–11 above-grade floors → mid-rise
  //   < 4 above-grade floors  → low-rise / villa
  if (floors.totalAboveGrade > 0) {
    const HIGHRISE_MIN = 12;
    const MIDRISE_MIN  = 4;
    if (topType === "HighRiseResidential" && floors.totalAboveGrade < HIGHRISE_MIN) {
      // Downgrade — but keep the residential signal
      topType = floors.totalAboveGrade >= MIDRISE_MIN ? "MidRiseResidential" : "Villa";
    } else if (topType === "MidRiseResidential" && floors.totalAboveGrade < MIDRISE_MIN) {
      topType = "Villa";
    } else if (topType === "OfficeTower" && floors.totalAboveGrade > 0 && floors.totalAboveGrade < MIDRISE_MIN) {
      // 3-floor "office tower" is really a mid-rise office; OfficeTower stays
      // a valid category but flag the alternates list to expose it.
      // Keep topType but lower confidence below.
    }
  }

  const secondScore = sorted[1]?.[1].weighted ?? 0;
  const total = sorted.reduce((s, [, v]) => s + v.weighted, 0);
  const dominance = total === 0 ? 0 : topData.weighted / total;
  const volume = Math.min(1, topData.weighted / 20);
  const uncontested = secondScore === 0 ? 0.1 : 0;
  let confidence = Math.min(1, dominance * 0.5 + volume * 0.4 + uncontested);

  // If a height correction fired, ding confidence — the keyword and the
  // geometry disagreed, so the call is genuinely ambiguous.
  if (topType !== sorted[0][0]) confidence = Math.min(confidence, 0.65);

  // Build alternates (top 2 runner-ups, ≥10% relative score)
  const topScore = topData.weighted;
  const alternates: AssetAlternate[] = sorted
    .slice(1, 4)
    .filter(([, v]) => v.weighted >= topScore * 0.1)
    .slice(0, 3)
    .map(([t, v]) => ({ type: t, label: ASSET_LABELS[t], confidence: v.weighted / topScore }));

  return { type: topType, confidence, evidence: topData.samples, alternates };
}

function detectFloors(s: Schedule): FloorBreakdown {
  const seen: Record<"basement"|"podium"|"typical", Set<number>> = {
    basement: new Set(), podium: new Set(), typical: new Set(),
  };
  const flags = {
    ground: false, lowerGround: false, upperGround: false,
    mezz: false, mezzCount: 0, penthouse: false, roof: false, plant: false,
  };
  const evidence: { marker: string; bucket: string; source: string }[] = [];

  const recordNum = (bucket: "basement"|"podium"|"typical", n: number, marker: string, source: string) => {
    if (n < 0 || n >= 100) return;
    if (!seen[bucket].has(n) && evidence.length < 80) {
      evidence.push({ marker, bucket, source });
    }
    seen[bucket].add(n);
  };
  const recordFlag = (bucket: "ground"|"lowerGround"|"upperGround"|"mezz"|"penthouse"|"roof"|"plant", marker: string, source: string) => {
    if (bucket === "ground" && !flags.ground)           evidence.push({ marker, bucket, source });
    if (bucket === "lowerGround" && !flags.lowerGround) evidence.push({ marker, bucket, source });
    if (bucket === "upperGround" && !flags.upperGround) evidence.push({ marker, bucket, source });
    if (bucket === "penthouse" && !flags.penthouse)     evidence.push({ marker, bucket, source });
    if (bucket === "roof" && !flags.roof)               evidence.push({ marker, bucket, source });
    if (bucket === "plant" && !flags.plant)             evidence.push({ marker, bucket, source });
    if (bucket === "mezz") {
      flags.mezzCount++;
      if (flags.mezzCount <= 3) evidence.push({ marker, bucket, source });
    }
    if (bucket === "ground")      flags.ground = true;
    if (bucket === "lowerGround") flags.lowerGround = true;
    if (bucket === "upperGround") flags.upperGround = true;
    if (bucket === "mezz")        flags.mezz = true;
    if (bucket === "penthouse")   flags.penthouse = true;
    if (bucket === "roof")        flags.roof = true;
    if (bucket === "plant")       flags.plant = true;
  };

  const inspect = (txt: string, source: string) => {
    if (!txt) return;

    // Pass 1: whole-text scan for compound phrases ("Basement Level 2",
    // "Lower Ground", "Plant Room Level"). All patterns global-flagged so we
    // catch multiple occurrences in one WBS string.
    for (const { re, bucket } of WHOLE_TEXT_PATTERNS) {
      const gre = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      let m: RegExpExecArray | null;
      while ((m = gre.exec(txt)) !== null) {
        if (bucket === "basement" || bucket === "podium" || bucket === "typical") {
          // Last capture group is the number
          const numStr = m[m.length - 1] ?? "";
          const n = parseInt(numStr, 10);
          if (!isNaN(n)) recordNum(bucket, n, m[0], source);
        } else {
          recordFlag(bucket, m[0], source);
        }
      }
    }

    // Pass 2: token-level scan for compact codes ("B01", "P-2", "L12", "12F").
    // Tokens are split on whitespace + common WBS separators.
    const tokens = txt.split(/[\s,;:|/()\[\]]+/).filter(Boolean);
    for (const tok of tokens) {
      for (const { re, bucket, captureIdx } of TOKEN_PATTERNS) {
        const m = tok.match(re);
        if (!m) continue;
        if (bucket === "basement" || bucket === "podium" || bucket === "typical" || bucket === "mezz") {
          const n = parseInt(m[captureIdx] ?? "", 10);
          if (bucket === "mezz") {
            recordFlag("mezz", tok, source);
          } else if (!isNaN(n)) {
            recordNum(bucket, n, tok, source);
          }
        }
        break; // first match wins per token
      }
    }
  };

  // WBS only — activity-name text is too noisy ("F4 grade concrete", "L2
  // cabling test") and produced false floor markers. WBS structure is where
  // planners actually encode the building geometry.
  for (const w of s.wbs) {
    if (w.name) inspect(w.name, w.name);
    if (w.code) inspect(w.code, w.code);
  }

  const basementNumbers = Array.from(seen.basement).sort((a, b) => a - b);
  const podiumNumbers   = Array.from(seen.podium).sort((a, b) => a - b);
  const typicalNumbers  = Array.from(seen.typical).sort((a, b) => a - b);

  // Habitable / above-grade total: ground (counted once, lower OR regular OR
  // upper) + podium + typical + mezzanines + penthouse + plant floor.
  const groundCount = (flags.ground || flags.lowerGround || flags.upperGround) ? 1 : 0;
  const mezzCount   = Math.min(flags.mezzCount, 5); // cap so noise doesn't inflate
  const totalAboveGrade =
    groundCount +
    podiumNumbers.length +
    typicalNumbers.length +
    mezzCount +
    (flags.penthouse ? 1 : 0) +
    (flags.plant ? 1 : 0);

  return {
    basements: basementNumbers.length,
    basementNumbers,
    podiumLevels: podiumNumbers.length,
    podiumNumbers,
    typicalFloors: typicalNumbers.length,
    typicalNumbers,
    mezzanines: mezzCount,
    hasLowerGround: flags.lowerGround,
    hasGroundFloor: flags.ground,
    hasUpperGround: flags.upperGround,
    hasRoof: flags.roof,
    hasPenthouse: flags.penthouse,
    hasPlantLevel: flags.plant,
    totalAboveGrade,
    evidence,
  };
}

function detectComponents(text: string): {
  components: Component[];
  details: Record<Component, { detected: boolean; matches: number }>;
} {
  const details = {} as Record<Component, { detected: boolean; matches: number }>;
  const present: Component[] = [];
  for (const [comp, re] of Object.entries(COMPONENT_KEYWORDS) as [Component, RegExp][]) {
    const m = text.match(new RegExp(re.source, re.flags + "g"));
    const count = m?.length ?? 0;
    const detected = count > 0;
    details[comp] = { detected, matches: count };
    if (detected) present.push(comp);
  }
  return { components: present, details };
}

// ── Tier classification ────────────────────────────────────────────────────
// Anchored in three frameworks so the rationale withstands client scrutiny:
//   - AACE 17R-97 "Cost Estimate Classification" size bands (Class 1..5).
//     Tier A maps loosely to Class 3+ projects (>$50M / multi-year).
//   - PMI complexity (PMBOK 7 / Pulse research): technical complexity,
//     stakeholder count, duration.
//   - GAO Schedule Assessment Guide maturity: schedules with > 5000 activities
//     and >3 yr horizons are GAO "large schedule" by their threshold.
// We don't claim full alignment — we cite the directional source so a planner
// can argue with the rationale, not just the number.
function classifyTier(args: {
  asset: AssetType;
  totalAboveGrade: number;
  activities: number;
  durationDays: number;
}): { tier: Tier; confidence: number; rationale: string; standard: string } {
  const { asset, totalAboveGrade, activities, durationDays } = args;
  const reasons: string[] = [];
  const standardRefs: string[] = [];

  // Asset-class prior — Healthcare and MixedUseTower are conventionally
  // complex (regulatory load, multi-discipline integration). Villa and
  // standalone landscape packages are typically small/simple.
  const megaAssets: AssetType[] = ["Healthcare", "MixedUseTower"];
  const smallAssets: AssetType[] = ["Villa", "Landscape"];

  let tier: Tier = "B";

  if (megaAssets.includes(asset)) {
    tier = "A";
    reasons.push(`${ASSET_LABELS[asset]} — industry convention Tier A`);
  } else if (smallAssets.includes(asset)) {
    tier = "C";
    reasons.push(`${ASSET_LABELS[asset]} — industry convention Tier C`);
  }

  // Floor-based bump for vertical buildings
  const vertical: AssetType[] = [
    "HighRiseResidential", "MidRiseResidential", "OfficeTower",
    "MixedUseTower", "Hospitality", "RetailMall", "Healthcare", "Education",
  ];
  if (vertical.includes(asset)) {
    if (totalAboveGrade >= 30) {
      tier = "A";
      reasons.push(`${totalAboveGrade} floors (≥ 30 ⇒ super-tall)`);
    } else if (totalAboveGrade >= 12) {
      if (tier !== "A") tier = "B";
      reasons.push(`${totalAboveGrade} floors (high-rise)`);
    } else if (totalAboveGrade >= 4) {
      if (tier !== "A") tier = "B";
      reasons.push(`${totalAboveGrade} floors (mid-rise)`);
    } else if (totalAboveGrade > 0) {
      if (tier !== "A") tier = "C";
      reasons.push(`${totalAboveGrade} floors (low-rise)`);
    }
  }

  // Activity-count: GAO Schedule Assessment thresholds
  if (activities >= 5000) {
    tier = "A";
    reasons.push(`${activities.toLocaleString()} activities (GAO "large schedule" threshold)`);
    standardRefs.push("GAO Schedule Assessment Guide");
  } else if (activities >= 1000 && tier === "C") {
    tier = "B";
    reasons.push(`${activities.toLocaleString()} activities`);
  } else if (activities < 200 && tier === "B") {
    tier = "C";
    reasons.push(`${activities.toLocaleString()} activities (small scope)`);
  }

  // Duration: AACE / PMI duration thresholds for complexity
  if (durationDays >= 1095) {
    if (tier !== "A") {
      tier = "A";
      reasons.push(`${Math.round(durationDays/365)}-yr horizon (PMI: high complexity)`);
    }
    standardRefs.push("PMI PMBOK 7 complexity");
  } else if (durationDays >= 365 && tier === "C") {
    tier = "B";
    reasons.push(`${Math.round(durationDays/30)}-mo duration`);
  }

  // AACE size-band mapping (rough — anchored on activities + duration as proxies
  // for capital cost, which we don't yet have):
  //   Class 5: pre-concept (< 100 activities, < 6 mo)        → Tier C
  //   Class 4: study/concept (100–500 activities, 6–18 mo)   → Tier C/B
  //   Class 3: budget authorization (500–2k act, 1–3 yr)     → Tier B
  //   Class 2: control (2k–5k act, 2–4 yr)                   → Tier B/A
  //   Class 1: bid/check (> 5k act, > 3 yr)                  → Tier A
  const aaceClass =
    activities >= 5000 || durationDays >= 1095 ? 1 :
    activities >= 2000 || durationDays >= 730  ? 2 :
    activities >= 500  || durationDays >= 365  ? 3 :
    activities >= 100  || durationDays >= 180  ? 4 : 5;
  standardRefs.unshift(`AACE 17R-97 Class ${aaceClass}`);

  const pmiBand: "Low" | "Mid" | "High" =
    tier === "A" ? "High" : tier === "B" ? "Mid" : "Low";
  standardRefs.push(`PMI complexity: ${pmiBand}`);

  return {
    tier,
    confidence: Math.min(1, 0.5 + reasons.length * 0.15),
    rationale: reasons.join(" · ") || "default mid-scale",
    standard: standardRefs.join(" · "),
  };
}

function buildHeadline(asset: AssetType, floors: FloorBreakdown, _tier: Tier): string {
  // Tier intentionally omitted — the snapshot panel renders it as a separate
  // banner; duplicating it in the headline added noise.
  const parts: string[] = [ASSET_LABELS[asset]];
  if (floors.totalAboveGrade > 0) {
    let f = `${floors.totalAboveGrade} floor${floors.totalAboveGrade === 1 ? "" : "s"}`;
    if (floors.basements > 0) f += ` + ${floors.basements}B`;
    parts.push(f);
  }
  return parts.join(" · ");
}

function estimateDurationDays(s: Schedule): number {
  if (!s.project.startDate || !s.project.finishDate) return 0;
  const ms = new Date(s.project.finishDate).getTime() - new Date(s.project.startDate).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

// ── Public API ─────────────────────────────────────────────────────────────
export function classifyProject(s: Schedule, override?: ClassifierOverrideInput): ProjectSnapshot {
  // Floors first — the vertical-vs-flat gate in detectAsset needs them.
  const floors = detectFloors(s);
  const corpus = buildCorpus(s);

  // Drop stale overrides that point at an asset type the taxonomy no longer
  // includes (we removed Bridge/Tunnel/Airport/Marine/Rail/Utility/Road
  // when scoping to RE-developer use). Without this, an old override would
  // silently render an "undefined" label and bypass classification.
  const validOverride = override && ASSET_LABELS[override.assetType] ? override : undefined;

  // Run the heuristic regardless so alternates / evidence are still available
  // (useful UI even when the user has pinned an override).
  const detected = detectAsset(corpus, floors);
  const asset = validOverride?.assetType ?? detected.type;
  const assetConfidence = validOverride ? 1 : detected.confidence;
  const assetEvidence = validOverride
    ? [`manual override: ${ASSET_LABELS[validOverride.assetType]}`]
    : detected.evidence;
  const alternates = validOverride ? [] : detected.alternates;

  // Components still use a flat combined string (no source weighting needed
  // — components are binary "detected anywhere in scope").
  const combined = corpus.map((c) => c.text).join(" \n ");
  const { components, details: componentDetails } = detectComponents(combined);
  const durationDays = estimateDurationDays(s);

  const computedTier = classifyTier({
    asset,
    totalAboveGrade: floors.totalAboveGrade,
    activities: s.activities.length,
    durationDays,
  });
  const tier = validOverride?.tier ?? computedTier.tier;
  const tierRationale = validOverride?.tier
    ? `manual override · auto would have been Tier ${computedTier.tier} (${computedTier.rationale})`
    : computedTier.rationale;

  return {
    assetType: asset,
    assetLabel: ASSET_LABELS[asset],
    assetConfidence,
    assetEvidence,
    alternates,
    tier,
    tierLabel:      TIER_LABELS[tier],
    tierConfidence: validOverride ? 1 : computedTier.confidence,
    tierRationale,
    tierStandard:   computedTier.standard,
    overridden:     !!validOverride,
    floors,
    components,
    componentDetails,
    scale: {
      activities:   s.activities.length,
      wbsNodes:     s.wbs.length,
      durationDays,
    },
    headline: buildHeadline(asset, floors, tier),
  };
}
