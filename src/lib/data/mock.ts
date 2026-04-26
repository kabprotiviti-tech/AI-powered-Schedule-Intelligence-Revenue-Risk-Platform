import type { Project, Activity, Framework, Milestone, SPIDataPoint } from "../types";

function makeActivities(projectId: string, frameworkId: string, frameworkName: string, count: number, delayFactor: number): Activity[] {
  const statuses = ["Not Started", "In Progress", "Complete", "Delayed"] as const;
  const owners = ["Ahmed Al Hashimi", "Sara Al Mansoori", "Khalid Bin Zayed", "Fatima Al Nuaimi", "Omar Al Shamsi"];
  const causes = ["Material delivery delay", "Sub-contractor mobilisation gap", "Design freeze pending", "Authority permit delay", "Weather / force majeure"];
  const actions = [
    "Expedite procurement order, compress succeeding activity by 3 days",
    "Issue notice to contractor, invoke acceleration clause in contract",
    "Escalate to Design Manager — approval needed within 48hrs",
    "Assign dedicated permit coordinator, target 5-day turnaround",
    "Resequence concurrent activities to recover 7 days on critical path",
  ];

  return Array.from({ length: count }, (_, i) => {
    const isDelayed = i % Math.max(2, Math.round(4 / delayFactor)) === 0;
    const isCritical = i % 5 === 0 || i % 7 === 0;
    const delay = isDelayed ? Math.floor(Math.random() * 15 + 3) : 0;
    const float = isCritical ? (isDelayed ? -delay : Math.floor(Math.random() * 5)) : Math.floor(Math.random() * 30 + 5);
    const pct = Math.min(100, Math.max(0, Math.floor(Math.random() * 80 + 10)));

    return {
      id: `${projectId}-${frameworkId}-A${String(i + 1).padStart(3, "0")}`,
      wbsCode: `${projectId.toUpperCase()}.${frameworkId.toUpperCase()}.${String(i + 1).padStart(3, "0")}`,
      name: [
        "Piling & Foundation Works",
        "Basement Excavation",
        "Grade Beam Construction",
        "Ground Floor Slab",
        "Column Erection L1",
        "Shear Wall Construction",
        "Structural Steel Erection",
        "MEP Rough-in Works",
        "Façade System Installation",
        "External Works & Landscaping",
        "Fit-out & Finishing",
        "Snagging & Handover Prep",
      ][i % 12],
      frameworkId,
      frameworkName,
      plannedStart: `2024-${String(Math.floor(i / 3) + 1).padStart(2, "0")}-01`,
      plannedEnd: `2024-${String(Math.floor(i / 3) + 2).padStart(2, "0")}-15`,
      actualStart: i % 3 !== 0 ? `2024-${String(Math.floor(i / 3) + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 5) + 1).padStart(2, "0")}` : undefined,
      forecastEnd: `2024-${String(Math.floor(i / 3) + 2 + Math.ceil(delay / 30)).padStart(2, "0")}-${String(15 + (delay % 15)).padStart(2, "0")}`,
      duration: Math.floor(Math.random() * 45 + 15),
      remainingDuration: Math.floor(Math.random() * 30),
      percentComplete: pct,
      float,
      isCritical,
      status: isDelayed ? "Delayed" : pct === 100 ? "Complete" : pct > 0 ? "In Progress" : "Not Started",
      predecessors: i > 0 ? [`${projectId}-${frameworkId}-A${String(i).padStart(3, "0")}`] : [],
      successors: i < count - 1 ? [`${projectId}-${frameworkId}-A${String(i + 2).padStart(3, "0")}`] : [],
      revenueImpactPerDay: Math.floor(Math.random() * 400_000 + 100_000),
      totalDelayCost: delay * Math.floor(Math.random() * 400_000 + 100_000),
      responsible: owners[i % owners.length],
      delayDays: delay,
      rootCause: isDelayed ? causes[i % causes.length] : undefined,
      recommendedAction: isDelayed ? actions[i % actions.length] : undefined,
    };
  });
}

function makeFrameworks(projectId: string, delayFactor: number): Framework[] {
  const names = ["Structure & Civil", "MEP Systems", "Façade & Envelope", "Internal Finishes", "External Works", "Fit-out"];
  return names.slice(0, 4).map((name, i) => {
    const activities = makeActivities(projectId, `F${i + 1}`, name, 12, delayFactor);
    const delayed = activities.filter((a) => a.status === "Delayed").length;
    const critical = activities.filter((a) => a.isCritical).length;
    const avgPct = Math.round(activities.reduce((s, a) => s + a.percentComplete, 0) / activities.length);
    const avgFloat = activities.reduce((s, a) => s + a.float, 0) / activities.length;
    const maxFloat = Math.max(...activities.map((a) => a.float));
    return {
      id: `F${i + 1}`,
      name,
      percentComplete: avgPct,
      healthScore: Math.round(Math.min(100, Math.max(0, (1 - delayed / activities.length) * 60 + (avgFloat / maxFloat) * 40))),
      totalActivities: activities.length,
      delayedActivities: delayed,
      criticalActivities: critical,
      floatConsumedPct: Math.round((1 - avgFloat / maxFloat) * 100),
      activities,
    };
  });
}

function makeSPIHistory(baseSPI: number): SPIDataPoint[] {
  const months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];
  return months.map((month, i) => {
    const drift = (Math.random() - 0.55) * 0.06;
    const spi = Math.min(1.15, Math.max(0.65, baseSPI + (i - 4) * 0.02 + drift));
    return {
      month,
      spi: parseFloat(spi.toFixed(2)),
      cpi: parseFloat((spi * (0.95 + Math.random() * 0.1)).toFixed(2)),
      planned: 5000 + i * 1200,
      actual: Math.round((5000 + i * 1200) * spi),
    };
  });
}

function makeMilestones(count: number, delayFactor: number): Milestone[] {
  const names = [
    "Design Freeze & Authority Submission",
    "Piling & Foundation Complete",
    "Structure Topping Out",
    "MEP Rough-in Complete",
    "Façade Completion",
    "Fit-out Completion",
    "Snagging Sign-off",
    "Handover to Sales",
  ];
  const impacts = [80_000_000, 120_000_000, 60_000_000, 45_000_000, 55_000_000, 90_000_000, 30_000_000, 250_000_000];
  return names.slice(0, count).map((name, i) => {
    const delay = delayFactor > 1.5 && i > 1 ? Math.floor(Math.random() * 20 + 5) : delayFactor > 1.0 && i > 2 ? Math.floor(Math.random() * 10) : 0;
    const status = i < 2 ? "Complete" : delay > 14 ? "Delayed" : delay > 0 ? "At Risk" : "On Track";
    return {
      id: `M${i + 1}`,
      name,
      plannedDate: `2024-${String(i * 2 + 1).padStart(2, "0")}-15`,
      forecastDate: delay > 0 ? `2024-${String(i * 2 + 1 + Math.ceil(delay / 30)).padStart(2, "0")}-${String(15 + delay % 15).padStart(2, "0")}` : `2024-${String(i * 2 + 1).padStart(2, "0")}-15`,
      actualDate: status === "Complete" ? `2024-${String(i * 2 + 1).padStart(2, "0")}-${String(10 + Math.floor(Math.random() * 8)).padStart(2, "0")}` : undefined,
      status,
      revenueImpact: impacts[i] || 50_000_000,
      delayDays: delay,
    };
  });
}

export const PROJECTS: Project[] = [
  {
    id: "yas-acres",
    name: "Yas Acres — Phase 3",
    type: "Residential",
    location: "Yas Island, Abu Dhabi",
    contractor: "Arabtec Construction LLC",
    plannedStart: "2023-03-01",
    plannedEnd: "2025-06-30",
    forecastEnd: "2025-09-15",
    percentComplete: 68,
    budget: 2_800_000_000,
    spentToDate: 1_960_000_000,
    spi: 0.91,
    cpi: 0.94,
    totalFloat: 12,
    criticalActivities: 18,
    delayedActivities: 14,
    totalActivities: 148,
    healthScore: 62,
    ragStatus: "Amber",
    revenueAtRisk: 340_000_000,
    delayDays: 77,
    topRisk: "MEP coordination clashes causing critical path compression",
    projectManager: "Ahmed Al Hashimi",
    units: 612,
    soldUnits: 489,
    milestones: makeMilestones(7, 1.4),
    frameworks: makeFrameworks("yas-acres", 1.4),
    spiHistory: makeSPIHistory(0.91),
  },
  {
    id: "saadiyat-grove",
    name: "Saadiyat Grove",
    type: "Mixed-Use",
    location: "Saadiyat Island, Abu Dhabi",
    contractor: "Al Futtaim Engineering",
    plannedStart: "2023-06-01",
    plannedEnd: "2026-03-31",
    forecastEnd: "2026-07-20",
    percentComplete: 41,
    budget: 5_200_000_000,
    spentToDate: 2_132_000_000,
    spi: 0.87,
    cpi: 0.91,
    totalFloat: 5,
    criticalActivities: 32,
    delayedActivities: 27,
    totalActivities: 224,
    healthScore: 48,
    ragStatus: "Red",
    revenueAtRisk: 820_000_000,
    delayDays: 111,
    topRisk: "Sub-contractor insolvency — structural steel package at risk",
    projectManager: "Sara Al Mansoori",
    units: 0,
    soldUnits: 0,
    milestones: makeMilestones(8, 2.1),
    frameworks: makeFrameworks("saadiyat-grove", 2.1),
    spiHistory: makeSPIHistory(0.87),
  },
  {
    id: "noya-yas",
    name: "Noya — Yas Island",
    type: "Residential",
    location: "Yas Island, Abu Dhabi",
    contractor: "BESIX Group",
    plannedStart: "2023-09-01",
    plannedEnd: "2025-12-31",
    forecastEnd: "2025-12-10",
    percentComplete: 55,
    budget: 1_600_000_000,
    spentToDate: 880_000_000,
    spi: 1.02,
    cpi: 1.01,
    totalFloat: 28,
    criticalActivities: 8,
    delayedActivities: 4,
    totalActivities: 112,
    healthScore: 88,
    ragStatus: "Green",
    revenueAtRisk: 45_000_000,
    delayDays: -21,
    topRisk: "Authority NOC for phase boundary — minor 2-week risk",
    projectManager: "Khalid Bin Zayed",
    units: 320,
    soldUnits: 320,
    milestones: makeMilestones(6, 0.4),
    frameworks: makeFrameworks("noya-yas", 0.4),
    spiHistory: makeSPIHistory(1.02),
  },
  {
    id: "gardenia-bay",
    name: "Gardenia Bay",
    type: "Residential",
    location: "Yas Island, Abu Dhabi",
    contractor: "Multiplex Constructions",
    plannedStart: "2024-01-15",
    plannedEnd: "2026-08-31",
    forecastEnd: "2027-01-15",
    percentComplete: 22,
    budget: 3_400_000_000,
    spentToDate: 748_000_000,
    spi: 0.83,
    cpi: 0.88,
    totalFloat: -8,
    criticalActivities: 41,
    delayedActivities: 35,
    totalActivities: 196,
    healthScore: 35,
    ragStatus: "Red",
    revenueAtRisk: 1_120_000_000,
    delayDays: 137,
    topRisk: "Design freeze not achieved — 40% of structural drawings still IFC pending",
    projectManager: "Fatima Al Nuaimi",
    units: 540,
    soldUnits: 302,
    milestones: makeMilestones(7, 2.8),
    frameworks: makeFrameworks("gardenia-bay", 2.8),
    spiHistory: makeSPIHistory(0.83),
  },
  {
    id: "reem-hills",
    name: "Reem Hills — Tower A & B",
    type: "Residential",
    location: "Al Reem Island, Abu Dhabi",
    contractor: "Drake & Scull International",
    plannedStart: "2023-11-01",
    plannedEnd: "2026-06-30",
    forecastEnd: "2026-08-15",
    percentComplete: 38,
    budget: 2_100_000_000,
    spentToDate: 798_000_000,
    spi: 0.94,
    cpi: 0.97,
    totalFloat: 18,
    criticalActivities: 22,
    delayedActivities: 11,
    totalActivities: 165,
    healthScore: 72,
    ragStatus: "Amber",
    revenueAtRisk: 195_000_000,
    delayDays: 46,
    topRisk: "Façade system procurement lead time — 16-week supply risk identified",
    projectManager: "Omar Al Shamsi",
    units: 890,
    soldUnits: 712,
    milestones: makeMilestones(7, 1.1),
    frameworks: makeFrameworks("reem-hills", 1.1),
    spiHistory: makeSPIHistory(0.94),
  },
  {
    id: "adgm-square",
    name: "ADGM Square — Tower C",
    type: "Commercial",
    location: "Al Maryah Island, Abu Dhabi",
    contractor: "ACC (Arabian Construction Co.)",
    plannedStart: "2023-07-01",
    plannedEnd: "2025-10-31",
    forecastEnd: "2025-11-14",
    percentComplete: 74,
    budget: 1_900_000_000,
    spentToDate: 1_406_000_000,
    spi: 0.98,
    cpi: 0.99,
    totalFloat: 14,
    criticalActivities: 11,
    delayedActivities: 6,
    totalActivities: 128,
    healthScore: 81,
    ragStatus: "Green",
    revenueAtRisk: 60_000_000,
    delayDays: 14,
    topRisk: "Tenant fit-out coordination — minor schedule interface risk",
    projectManager: "Ahmed Al Hashimi",
    milestones: makeMilestones(6, 0.7),
    frameworks: makeFrameworks("adgm-square", 0.7),
    spiHistory: makeSPIHistory(0.98),
  },
  {
    id: "yas-beach-res",
    name: "Yas Beach Residences",
    type: "Residential",
    location: "Yas Island, Abu Dhabi",
    contractor: "CCC (Consolidated Contractors)",
    plannedStart: "2024-03-01",
    plannedEnd: "2026-12-31",
    forecastEnd: "2027-03-20",
    percentComplete: 18,
    budget: 4_100_000_000,
    spentToDate: 738_000_000,
    spi: 0.88,
    cpi: 0.92,
    totalFloat: 3,
    criticalActivities: 38,
    delayedActivities: 22,
    totalActivities: 178,
    healthScore: 44,
    ragStatus: "Red",
    revenueAtRisk: 680_000_000,
    delayDays: 109,
    topRisk: "Marine works authority approvals delayed — coastal protection structure critical",
    projectManager: "Sara Al Mansoori",
    units: 720,
    soldUnits: 580,
    milestones: makeMilestones(7, 2.0),
    frameworks: makeFrameworks("yas-beach-res", 2.0),
    spiHistory: makeSPIHistory(0.88),
  },
  {
    id: "al-gurm",
    name: "Al Gurm Resort — Expansion",
    type: "Commercial",
    location: "Al Gurm, Abu Dhabi",
    contractor: "Ghantoot Transport & General Contracting",
    plannedStart: "2023-10-01",
    plannedEnd: "2025-09-30",
    forecastEnd: "2025-10-05",
    percentComplete: 81,
    budget: 950_000_000,
    spentToDate: 769_500_000,
    spi: 1.04,
    cpi: 1.02,
    totalFloat: 35,
    criticalActivities: 5,
    delayedActivities: 2,
    totalActivities: 94,
    healthScore: 91,
    ragStatus: "Green",
    revenueAtRisk: 18_000_000,
    delayDays: 5,
    topRisk: "Landscaping seasonal window — minor weather risk in Q3",
    projectManager: "Khalid Bin Zayed",
    milestones: makeMilestones(5, 0.2),
    frameworks: makeFrameworks("al-gurm", 0.2),
    spiHistory: makeSPIHistory(1.04),
  },
];

export function getProjectById(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}

export const PORTFOLIO_OUTLOOK = [
  { month: "May '25", revenueAtRisk: 2_850_000_000, avgHealth: 64, redProjects: 3 },
  { month: "Jun '25", revenueAtRisk: 2_650_000_000, avgHealth: 66, redProjects: 3 },
  { month: "Jul '25", revenueAtRisk: 2_400_000_000, avgHealth: 69, redProjects: 2 },
  { month: "Aug '25", revenueAtRisk: 2_100_000_000, avgHealth: 71, redProjects: 2 },
  { month: "Sep '25", revenueAtRisk: 1_800_000_000, avgHealth: 74, redProjects: 1 },
  { month: "Oct '25", revenueAtRisk: 1_550_000_000, avgHealth: 76, redProjects: 1 },
];
