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

import type { Schedule, ScheduleActivity, WBSNode } from "./types";

// ── Asset type taxonomy ─────────────────────────────────────────────────────
export type AssetType =
  | "HighRiseResidential"
  | "MidRiseResidential"
  | "Villa"
  | "OfficeTower"
  | "MixedUseTower"
  | "RetailMall"
  | "Hospitality"
  | "Industrial"
  | "Healthcare"
  | "Education"
  | "Government"
  | "Cultural"           // mosque, church, museum, theatre
  | "Infrastructure_Road"
  | "Infrastructure_Bridge"
  | "Infrastructure_Tunnel"
  | "Infrastructure_Airport"
  | "Infrastructure_Marine"
  | "Infrastructure_Rail"
  | "Utility"            // water, sewage, power, district cooling
  | "Landscape"          // standalone landscape / park
  | "Generic";

export const ASSET_LABELS: Record<AssetType, string> = {
  HighRiseResidential:     "High-Rise Residential",
  MidRiseResidential:      "Mid-Rise Residential",
  Villa:                   "Villa / Low-Rise Residential",
  OfficeTower:             "Office / Commercial Tower",
  MixedUseTower:           "Mixed-Use Development",
  RetailMall:              "Retail / Mall",
  Hospitality:             "Hotel / Hospitality",
  Industrial:              "Industrial / Warehouse",
  Healthcare:              "Healthcare / Hospital",
  Education:               "Education / Campus",
  Government:              "Government / Civic",
  Cultural:                "Cultural / Religious",
  Infrastructure_Road:     "Roads & Highways",
  Infrastructure_Bridge:   "Bridges & Viaducts",
  Infrastructure_Tunnel:   "Tunnels & Metro",
  Infrastructure_Airport:  "Airport / Aviation",
  Infrastructure_Marine:   "Marine / Ports",
  Infrastructure_Rail:     "Rail",
  Utility:                 "Utilities",
  Landscape:               "Landscape / Parks",
  Generic:                 "Generic / Unclassified",
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
  basements: number;       // B1, B2, …
  podiumLevels: number;    // P1, P2 (often parking / retail)
  typicalFloors: number;   // standard residential / office floors
  mezzanines: number;
  hasGroundFloor: boolean;
  hasRoof: boolean;
  hasPenthouse: boolean;
  totalAboveGrade: number; // GF + podium + typical + mezz + penthouse
  rawMarkers: string[];    // detected wbs/activity floor markers (for audit)
}

export interface ProjectSnapshot {
  // Asset / type
  assetType:        AssetType;
  assetLabel:       string;
  assetConfidence:  number;         // 0..1
  assetEvidence:    string[];       // matched keywords + WBS paths

  // Tier
  tier:             Tier;
  tierLabel:        string;
  tierConfidence:   number;
  tierRationale:    string;

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
  headline:         string;          // e.g. "High-Rise Residential · 38 floors · Tier A"
}

// ── Keyword sets ────────────────────────────────────────────────────────────
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
    /\b(hospital|clinic|medical\s+(center|centre|facility)|healthcare|polyclinic|dialysis|surgical\s+(suite|center)|OR|ICU)\b/i,
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
    /\b(mosque|church|cathedral|synagogue|temple|museum|gallery|theatre|theater|opera|concert\s+hall|cultural\s+center|cultural\s+centre)\b/i,
  ],
  Infrastructure_Road: [
    /\b(road|highway|motorway|carriageway|interchange|junction|intersection|pavement|asphalt|shoulder|kerb|curb)\b/i,
    /\b(road\s+widening|road\s+upgrade|street\s+upgrade)\b/i,
  ],
  Infrastructure_Bridge: [
    /\b(bridge|overpass|underpass|viaduct|flyover|pedestrian\s+bridge|cable[-\s]stayed|suspension\s+bridge)\b/i,
  ],
  Infrastructure_Tunnel: [
    /\b(tunnel|metro|subway|underground\s+(rail|line)|TBM|cut[-\s]and[-\s]cover)\b/i,
  ],
  Infrastructure_Airport: [
    /\b(airport|runway|terminal\s+building|apron|taxiway|airside|landside|ATC\s+tower|control\s+tower)\b/i,
  ],
  Infrastructure_Marine: [
    /\b(port|jetty|marina|quay|breakwater|dock|harbor|harbour|wharf|seawall|coastal\s+protection)\b/i,
  ],
  Infrastructure_Rail: [
    /\b(rail|railway|train\s+station|locomotive|track\s+ballast|sleeper|signalling|signaling|catenary)\b/i,
  ],
  Utility: [
    /\b(water\s+treatment|sewage\s+treatment|STP|WTP|substation|switchyard|power\s+plant|district\s+cooling|chiller\s+plant|pumping\s+station|reservoir)\b/i,
  ],
  Landscape: [
    /\b(park|landscape\s+only|public\s+realm|plaza|hardscape|softscape|community\s+park|botanical|streetscape\b)/i,
  ],
  Generic: [],
};

// Strong signals that override otherwise ambiguous matches.
// Patterns are tightened to require asset-context anchors so common English
// words ("OR", "key milestones") don't trigger false classifications.
const STRONG_OVERRIDES: { test: RegExp; type: AssetType }[] = [
  // "350 keys" only counts when adjacent to hotel context, not "12 key milestones"
  { test: /\b\d+\s+keys?\s+(hotel|resort|hospitality|room|suite)|\b(hotel|resort)\s+\d+\s+keys?\b/i, type: "Hospitality" },
  // ICU / operating theatre only — bare "OR" was matching the English conjunction
  { test: /\b(ICU|NICU|PICU|operating\s+theatre|operating\s+room|surgical\s+suite)\b/i, type: "Healthcare" },
  // OR with a number suffix (OR-1, OR1, OR 5) — actual operating-room codes
  { test: /\bOR[-\s]?\d+\b/,                         type: "Healthcare" },
  { test: /\b(runway|apron|taxiway)\b/i,             type: "Infrastructure_Airport" },
  { test: /\b(jetty|breakwater|quay\s+wall)\b/i,     type: "Infrastructure_Marine" },
  { test: /\b(viaduct|cable[-\s]stayed)\b/i,         type: "Infrastructure_Bridge" },
  { test: /\b(TBM|tunnel\s+boring)\b/i,              type: "Infrastructure_Tunnel" },
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
// Patterns require explicit anchors (Level/Floor/Lvl/L##/F##) so activity text
// like "F4 grade concrete" or "Pour L2 slab section" doesn't pollute floor counts.
// "Bare F" / "bare L" without a digit-anchor pattern is rejected.
const FLOOR_PATTERNS: { re: RegExp; bucket: "basement" | "podium" | "ground" | "mezz" | "typical" | "penthouse" | "roof" }[] = [
  { re: /\b(bsmt|basement)[\s\-_]?\d{1,2}\b/i,                bucket: "basement" },
  { re: /\bB[\s\-_]?(\d{1,2})\b/,                              bucket: "basement" },   // case-sensitive B1/B-1
  { re: /\bpodium[\s\-_]?\d{1,2}\b/i,                          bucket: "podium" },
  { re: /\bP[\s\-_]?(\d{1,2})\b/,                              bucket: "podium" },     // case-sensitive P1/P-1
  { re: /\b(gf|g\.f\.?|ground\s+floor)\b/i,                    bucket: "ground" },
  { re: /\b(mezzanine|mezz)\b/i,                               bucket: "mezz" },
  { re: /\b(penthouse|pent[-\s]?house)\b/i,                    bucket: "penthouse" },
  { re: /\b(roof\s+top|rooftop|roof\s+level|roof\s+slab)\b/i,  bucket: "roof" },
  // Typical floors — must be explicit: "Level 12", "Lvl 12", "L12", "L-12", "L_12", "12F", "Floor 12", "12th floor"
  { re: /\b(level|lvl|floor)[\s\-_]+(\d{1,2})\b/i,             bucket: "typical" },
  { re: /\bL[\s\-_]?(\d{1,2})\b/,                              bucket: "typical" },   // case-sensitive L01/L-12
  { re: /\b(\d{1,2})(st|nd|rd|th)\s+floor\b/i,                 bucket: "typical" },
  { re: /\b(\d{1,2})F\b/,                                      bucket: "typical" },   // case-sensitive 12F
];

// ── Helpers ────────────────────────────────────────────────────────────────
function corpus(s: Schedule): { texts: string[]; combined: string } {
  const texts: string[] = [];
  texts.push(s.project.name);
  texts.push(s.project.code);
  for (const w of s.wbs) {
    texts.push(w.name);
    texts.push(w.code);
  }
  // Use up to first 2000 activities to keep this fast for huge schedules
  const ACT_LIMIT = 2000;
  for (let i = 0; i < Math.min(ACT_LIMIT, s.activities.length); i++) {
    const a = s.activities[i];
    texts.push(a.name);
    texts.push(a.code);
  }
  return { texts, combined: texts.join(" \n ") };
}

function detectAsset(text: string): { type: AssetType; confidence: number; evidence: string[] } {
  // Strong overrides first
  for (const o of STRONG_OVERRIDES) {
    const m = text.match(o.test);
    if (m) {
      return { type: o.type, confidence: 0.92, evidence: [m[0]] };
    }
  }

  const scores: Partial<Record<AssetType, { count: number; matches: string[] }>> = {};
  for (const [type, regexes] of Object.entries(ASSET_KEYWORDS) as [AssetType, RegExp[]][]) {
    let count = 0;
    const matches: string[] = [];
    for (const re of regexes) {
      const found = text.match(new RegExp(re.source, re.flags + "g"));
      if (found) {
        count += found.length;
        for (const m of found.slice(0, 3)) matches.push(m);
      }
    }
    if (count > 0) scores[type] = { count, matches };
  }

  // Sort by hit count
  const sorted = Object.entries(scores).sort((a, b) => (b[1]?.count ?? 0) - (a[1]?.count ?? 0)) as [
    AssetType,
    { count: number; matches: string[] },
  ][];
  if (sorted.length === 0) {
    return { type: "Generic", confidence: 0, evidence: [] };
  }
  const [topType, topData] = sorted[0];
  const secondCount = sorted[1]?.[1]?.count ?? 0;
  const total = sorted.reduce((s, [, v]) => s + v.count, 0);
  const dominance = total === 0 ? 0 : topData.count / total;

  // Confidence has three components, all 0..1, combined multiplicatively-ish:
  //   - dominance: how much of the evidence points at the top type
  //   - volume:    absolute match count, saturating around 12 hits
  //   - uncontested bonus: small bump when no other type fired
  // Floor is 0 so a single weak hit can read as "low confidence" in the UI.
  const volume = Math.min(1, topData.count / 12);
  const uncontested = secondCount === 0 ? 0.1 : 0;
  const confidence = Math.min(1, dominance * 0.55 + volume * 0.35 + uncontested);

  return { type: topType, confidence, evidence: topData.matches };
}

function detectFloors(s: Schedule): FloorBreakdown {
  const breakdown = {
    basements: 0, podiumLevels: 0, typicalFloors: 0, mezzanines: 0,
    hasGroundFloor: false, hasRoof: false, hasPenthouse: false,
    totalAboveGrade: 0, rawMarkers: [] as string[],
  };

  const seenLevels: Record<string, Set<number>> = {
    basement: new Set(), podium: new Set(), typical: new Set(),
  };
  const seenFlags = { ground: false, mezz: false, penthouse: false, roof: false };

  // Tokenize text on whitespace and inspect each token; first matching pattern
  // wins per token so "L0" doesn't get counted as both ground AND typical floor 0.
  const inspect = (txt: string) => {
    if (!txt) return;
    const tokens = txt.split(/[\s,;:|/()]+/);
    for (const tok of tokens) {
      for (const { re, bucket } of FLOOR_PATTERNS) {
        const m = tok.match(re);
        if (!m) continue;
        if (bucket === "ground")         seenFlags.ground    = true;
        else if (bucket === "mezz")      seenFlags.mezz      = true;
        else if (bucket === "penthouse") seenFlags.penthouse = true;
        else if (bucket === "roof")      seenFlags.roof      = true;
        else {
          const numStr = m[2] ?? m[1];
          const n = parseInt(numStr, 10);
          if (!isNaN(n) && n >= 0 && n < 100) {
            seenLevels[bucket].add(n);
            if (breakdown.rawMarkers.length < 20) breakdown.rawMarkers.push(m[0]);
          }
        }
        break; // first matching bucket wins for this token
      }
    }
  };

  // WBS only — activity-name text is too noisy ("F4 grade concrete", "L2 cabling
  // test") and produced false floor markers. WBS structure is where planners
  // actually encode the building geometry.
  for (const w of s.wbs) {
    inspect(w.name);
    inspect(w.code);
  }

  breakdown.basements    = seenLevels.basement.size;
  breakdown.podiumLevels = seenLevels.podium.size;
  breakdown.typicalFloors = seenLevels.typical.size;
  breakdown.hasGroundFloor = seenFlags.ground;
  breakdown.hasRoof        = seenFlags.roof;
  breakdown.hasPenthouse   = seenFlags.penthouse;
  breakdown.mezzanines     = seenFlags.mezz ? 1 : 0;
  breakdown.totalAboveGrade =
    (seenFlags.ground ? 1 : 0) + breakdown.podiumLevels + breakdown.typicalFloors +
    breakdown.mezzanines + (seenFlags.penthouse ? 1 : 0);

  return breakdown;
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

function classifyTier(args: {
  asset: AssetType;
  totalAboveGrade: number;
  activities: number;
  durationDays: number;
}): { tier: Tier; confidence: number; rationale: string } {
  const { asset, totalAboveGrade, activities, durationDays } = args;
  const reasons: string[] = [];

  // Infrastructure / specialty bumps tier
  const megaAssets: AssetType[] = [
    "Infrastructure_Airport", "Infrastructure_Tunnel", "Infrastructure_Rail",
    "Healthcare", "MixedUseTower",
  ];
  const smallAssets: AssetType[] = ["Villa", "Landscape"];

  let tier: Tier = "B";

  if (megaAssets.includes(asset)) {
    tier = "A";
    reasons.push(`asset class "${ASSET_LABELS[asset]}" is typically Tier A`);
  } else if (smallAssets.includes(asset)) {
    tier = "C";
    reasons.push(`asset class "${ASSET_LABELS[asset]}" is typically Tier C`);
  }

  // Floor-based bump (only for vertical buildings)
  const vertical: AssetType[] = [
    "HighRiseResidential", "MidRiseResidential", "OfficeTower",
    "MixedUseTower", "Hospitality", "RetailMall", "Healthcare", "Education",
  ];
  if (vertical.includes(asset)) {
    if (totalAboveGrade >= 30) { tier = "A"; reasons.push(`${totalAboveGrade} floors above ground`); }
    else if (totalAboveGrade >= 8) { if (tier !== "A") tier = "B"; reasons.push(`${totalAboveGrade} floors above ground`); }
    else if (totalAboveGrade > 0 && totalAboveGrade < 4) { if (tier !== "A") tier = "C"; reasons.push(`${totalAboveGrade} floors above ground`); }
  }

  // Activity-count bump (universal)
  if (activities >= 5000) { tier = "A"; reasons.push(`${activities.toLocaleString()} activities (mega scope)`); }
  else if (activities >= 1000 && tier === "C") { tier = "B"; reasons.push(`${activities.toLocaleString()} activities`); }
  else if (activities < 200 && tier === "B") { tier = "C"; reasons.push(`${activities.toLocaleString()} activities (small scope)`); }

  // Duration bump
  if (durationDays >= 1095 /* 3 years */) {
    if (tier !== "A") { tier = "A"; reasons.push(`${Math.round(durationDays/365)}-year project duration`); }
  } else if (durationDays >= 365 && tier === "C") {
    tier = "B";
    reasons.push(`${Math.round(durationDays/30)}-month duration`);
  }

  return {
    tier,
    confidence: Math.min(1, 0.5 + reasons.length * 0.15),
    rationale: reasons.join(" · ") || "default mid-scale",
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
export function classifyProject(s: Schedule): ProjectSnapshot {
  const { combined } = corpus(s);

  const { type: asset, confidence: assetConfidence, evidence: assetEvidence } = detectAsset(combined);
  const floors = detectFloors(s);
  const { components, details: componentDetails } = detectComponents(combined);
  const durationDays = estimateDurationDays(s);

  const tier = classifyTier({
    asset,
    totalAboveGrade: floors.totalAboveGrade,
    activities: s.activities.length,
    durationDays,
  });

  return {
    assetType: asset,
    assetLabel: ASSET_LABELS[asset],
    assetConfidence,
    assetEvidence,
    tier:           tier.tier,
    tierLabel:      TIER_LABELS[tier.tier],
    tierConfidence: tier.confidence,
    tierRationale:  tier.rationale,
    floors,
    components,
    componentDetails,
    scale: {
      activities:   s.activities.length,
      wbsNodes:     s.wbs.length,
      durationDays,
    },
    headline: buildHeadline(asset, floors, tier.tier),
  };
}
