// @ts-nocheck — TODO Phase 2: rewrite on Schedule store
/**
 * Copilot Context Builder
 *
 * Builds a compact, structured context string from engine outputs to inject
 * into the Claude system prompt. Uses intent-based routing to include the
 * most relevant data slices for each query type without exceeding token limits.
 */
import type { DCMAOutput }       from "@/lib/engines/dcma/index";
import type { CPMOutput }        from "@/lib/engines/cpm/index";
import type { EVMOutput }        from "@/lib/engines/evm/index";
import type { MonteCarloOutput } from "@/lib/engines/monte-carlo/index";
import type { OrchestratorResult } from "@/lib/engines/orchestrator";
import { PROJECTS }              from "@/lib/data/mock";

// ─── Intent detection ─────────────────────────────────────────────────────────

function detectIntents(query: string): Set<string> {
  const q = query.toLowerCase();
  const intents = new Set<string>();

  if (/\b(logic|link|predecessor|successor|missing relation|open end)\b/.test(q))
    intents.add("dcma_logic");
  if (/\b(violation|dcma|check|score|quality|constraint|resource|duration|lag|lead)\b/.test(q))
    intents.add("dcma_deep");
  if (/\b(critical path|float|cpli|near.crit|negative float|delay|late|behind|network)\b/.test(q))
    intents.add("cpm_deep");
  if (/\b(cost|budget|cpi|spi|eac|bac|evm|spend|overrun|earned value|variance)\b/.test(q))
    intents.add("evm_deep");
  if (/\b(probability|simulation|monte carlo|tornado|uncertainty|confidence|p80|p90)\b/.test(q))
    intents.add("mc_deep");
  if (/\b(fix|action|priorit|recommend|what should|improve|reduce|recover|address)\b/.test(q)) {
    intents.add("dcma_deep");
    intents.add("cpm_deep");
    intents.add("action");
  }
  if (intents.size === 0 || /\b(top|main|biggest|worst|summary|overview|issue|risk|problem|status)\b/.test(q)) {
    intents.add("dcma_deep");
    intents.add("cpm_deep");
  }

  return intents;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtM(n: number): string { return `${(n / 1e6).toFixed(1)}M`; }

// ─── Context builder ──────────────────────────────────────────────────────────

export function buildContext(
  result: OrchestratorResult,
  query:  string,
  projectId: string,
): string {
  const dcma = result.results["DCMA"]        as DCMAOutput        | undefined;
  const cpm  = result.results["CPM"]         as CPMOutput         | undefined;
  const evm  = result.results["EVM"]         as EVMOutput         | undefined;
  const mc   = result.results["MONTE_CARLO"] as MonteCarloOutput  | undefined;
  const project = PROJECTS.find((p) => p.id === projectId);

  const intents = detectIntents(query);
  const L: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  L.push(
    `PROJECT: ${project?.name ?? projectId} | ` +
    `Contractor: ${project?.contractor ?? "N/A"} | ` +
    `${dcma ? `${dcma.detail.task_count} tasks` : ""}`,
  );

  // ── DCMA ────────────────────────────────────────────────────────────────────
  if (dcma) {
    const d     = dcma.detail;
    const grade = dcma.summary.score >= 75 ? "GOOD" : dcma.summary.score >= 50 ? "WARNING" : "CRITICAL";
    L.push(`\n━━ DCMA: ${dcma.summary.score}/100 (${grade}) ━━`);
    L.push(`Violations:${d.total_violations} | ScheduleRisk:${d.total_schedule_impact_days}d | CriticalFails:${d.critical_failures.length}`);
    L.push(`Severity → Critical:${d.violations_by_severity.Critical.length} High:${d.violations_by_severity.High.length} Medium:${d.violations_by_severity.Medium.length} Low:${d.violations_by_severity.Low.length}`);

    const failingChecks = Object.values(d.violations_by_check)
      .filter((v) => v.violation_count > 0)
      .sort((a, b) => b.subtotal_risk_pct - a.subtotal_risk_pct);

    if (intents.has("dcma_deep") || intents.has("dcma_logic") || intents.has("action")) {
      if (failingChecks.length > 0) {
        L.push("\nFAILING CHECKS (risk-ranked):");
        failingChecks.forEach((c) => {
          const wt = c.severity_weight === 3 ? "Critical×3" : c.severity_weight === 2 ? "High×2" : "Medium×1";
          L.push(`• ${c.check_code} [${wt}]: ${c.violation_count} violations | Risk:${c.subtotal_risk_pct.toFixed(1)}% | Impact:${c.subtotal_schedule_impact_days}d`);
        });
      }

      const top = d.top_risk_activities.slice(0, 12);
      if (top.length > 0) {
        L.push("\nTOP RISK ACTIVITIES:");
        top.forEach((a, i) => {
          const owner = a.responsible_party ? ` Owner:${a.responsible_party}` : "";
          L.push(
            `#${i + 1} ${a.external_id} "${a.name}" WBS:${a.wbs_code}` +
            ` | Fails:${a.checks_failed.join(",")}` +
            ` | Risk:${a.risk_contribution_pct.toFixed(1)}%` +
            ` | Impact:${a.total_schedule_impact_days}d${owner}`,
          );
        });
      }
    } else {
      // Base: top 3 checks + 3 activities only
      L.push(
        "TopChecks: " +
        failingChecks.slice(0, 3).map((c) => `${c.check_code}(${c.violation_count},${c.subtotal_risk_pct.toFixed(1)}%)`).join(" "),
      );
      L.push(
        "TopRisk: " +
        d.top_risk_activities.slice(0, 3).map((a) => `${a.external_id}(${a.risk_contribution_pct.toFixed(1)}%)`).join(" "),
      );
    }

    // WBS risk distribution (always show top 4 WBS areas)
    const topWBS = Object.values(d.violations_by_wbs)
      .sort((a, b) => b.risk_contribution_pct - a.risk_contribution_pct)
      .slice(0, 4);
    if (topWBS.length > 0) {
      L.push("\nRISK BY WBS: " + topWBS.map((w) => `WBS${w.wbs_prefix}(${w.violation_count}v,${w.risk_contribution_pct.toFixed(1)}%)`).join(" "));
    }
  }

  // ── CPM ─────────────────────────────────────────────────────────────────────
  if (cpm) {
    const d     = cpm.detail;
    const grade = d.cpli >= 0.95 ? "ON TRACK" : d.cpli >= 0.85 ? "SLIPPING" : "BEHIND";
    L.push(`\n━━ CPM: CPLI ${d.cpli.toFixed(3)} (${grade}) ━━`);
    L.push(
      `FinishVariance:${d.finish_variance_days > 0 ? "+" : ""}${d.finish_variance_days}d | ` +
      `CritPath:${d.critical_path.length} activities ${d.critical_path_duration}d | ` +
      `NegFloat:${d.negative_float_count} | NearCrit:${d.near_critical_count}`,
    );

    if (intents.has("cpm_deep") || intents.has("action")) {
      // Critical + negative float activities sorted worst-first
      const critActs = d.float_records
        .filter((r) => r.is_critical || r.total_float < 0)
        .sort((a, b) => a.total_float - b.total_float)
        .slice(0, 15);

      if (critActs.length > 0) {
        L.push("\nCRITICAL / NEGATIVE FLOAT ACTIVITIES:");
        critActs.forEach((r) => {
          const tag = r.total_float < 0
            ? `[NEG:${r.total_float}d]`
            : r.total_float === 0 ? "[ZERO FLOAT]"
            : `[Float:+${r.total_float}d]`;
          L.push(`• ${r.external_id} "${r.name}" WBS:${r.wbs_code} ${tag}`);
        });
      }

      // Near-critical (potential path growth)
      const nearCrit = d.float_records
        .filter((r) => r.total_float > 0 && r.total_float <= 14)
        .sort((a, b) => a.total_float - b.total_float)
        .slice(0, 8);

      if (nearCrit.length > 0) {
        L.push("\nNEAR-CRITICAL (1–14d float):");
        nearCrit.forEach((r) =>
          L.push(`• ${r.external_id} "${r.name}" Float:${r.total_float}d`),
        );
      }
    }
  }

  // ── EVM ─────────────────────────────────────────────────────────────────────
  if (evm) {
    const d    = evm.detail;
    const over = d.eac > d.bac ? `${fmtM(d.eac - d.bac)} AED OVERRUN` : "IN BUDGET";
    L.push(`\n━━ EVM: SPI ${d.spi.toFixed(3)} | CPI ${d.cpi.toFixed(3)} ━━`);
    L.push(`PV:${fmtM(d.pv)} EV:${fmtM(d.ev)} AC:${fmtM(d.ac)} BAC:${fmtM(d.bac)} EAC:${fmtM(d.eac)} (${over})`);
    L.push(`SV:${fmtM(d.sv)} CV:${fmtM(d.cv)} TCPI:${d.tcpi.toFixed(3)} Overrun:${d.schedule_overrun_days}d <SPI0.9:${d.below_spi_09} <CPI0.9:${d.below_cpi_09}`);

    if (intents.has("evm_deep")) {
      const lagging = d.activity_evm
        .filter((a) => a.spi !== null && a.spi < 0.9)
        .sort((a, b) => (a.spi ?? 1) - (b.spi ?? 1))
        .slice(0, 10);

      if (lagging.length > 0) {
        L.push("\nLAGGING ACTIVITIES (SPI < 0.9):");
        lagging.forEach((a) =>
          L.push(`• ${a.external_id} "${a.name}" WBS:${a.wbs_code} | SPI:${(a.spi ?? 0).toFixed(2)} | SV:${fmtM(a.sv)} AED`),
        );
      }

      const costOver = d.activity_evm
        .filter((a) => a.cpi !== null && a.cpi < 0.9)
        .sort((a, b) => (a.cpi ?? 1) - (b.cpi ?? 1))
        .slice(0, 5);

      if (costOver.length > 0) {
        L.push("\nCOST OVERRUN ACTIVITIES (CPI < 0.9):");
        costOver.forEach((a) =>
          L.push(`• ${a.external_id} "${a.name}" | CPI:${(a.cpi ?? 0).toFixed(2)} | CV:${fmtM(a.cv)} AED`),
        );
      }
    }
  }

  // ── Monte Carlo ──────────────────────────────────────────────────────────────
  if (mc) {
    const d    = mc.detail;
    const pct  = (d.planned_finish_confidence * 100).toFixed(0);
    L.push(`\n━━ MONTE CARLO: ${pct}% on-time (${d.iterations.toLocaleString()} iterations) ━━`);
    L.push(`P50:${d.p50_days}d P80:${d.p80_days}d P90:${d.p90_days}d StdDev:${d.std_dev_days.toFixed(1)}d Mean:${d.mean_days.toFixed(0)}d`);

    if (intents.has("mc_deep")) {
      const tornado = d.tornado.slice(0, 12);
      if (tornado.length > 0) {
        L.push("\nTORNADO — TOP UNCERTAINTY DRIVERS:");
        tornado.forEach((t, i) =>
          L.push(
            `#${i + 1} ${t.external_id} "${t.name}"` +
            ` Sensitivity:${t.sensitivity.toFixed(2)} Range:${t.range_days}d → ${t.risk_contribution_pct.toFixed(1)}% of finish uncertainty`,
          ),
        );
      }

      const highSCI = d.criticality_index
        .filter((c) => c.sci >= 0.5)
        .sort((a, b) => b.sci - a.sci)
        .slice(0, 8);

      if (highSCI.length > 0) {
        L.push("\nHIGH-CRITICALITY ACTIVITIES (SCI ≥ 50%):");
        highSCI.forEach((c) =>
          L.push(`• ${c.external_id} "${c.name}" SCI:${(c.sci * 100).toFixed(0)}% (${c.label})`),
        );
      }
    } else {
      const top3 = d.tornado.slice(0, 3);
      L.push("TopTornado: " + top3.map((t) => `${t.external_id}(${t.sensitivity.toFixed(2)},${t.range_days}d)`).join(" "));
    }
  }

  return L.join("\n");
}

// ─── System prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `\
You are NEXUS Copilot — an AI schedule intelligence assistant embedded in the NEXUS Schedule Risk Platform.

You help project managers, PMO teams, and executives understand schedule quality, risk drivers, and corrective actions with precision and data backing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY RESPONSE FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every response MUST:
1. Cite exact activity IDs and names (e.g., "Activity A-1023 – Substation Cabling")
2. Reference the exact framework violation (e.g., "DCMA LOGIC check", "CPM Negative Float")
3. Quantify every finding with a number (e.g., "18.2% of total risk", "45-day delay", "2.3M AED overrun")

Use this structure:

**Finding**: [one-sentence summary with exact numbers]

**Root Cause**: [2–3 sentences citing specific activities, check codes, frameworks]

**Impact**: [quantified — days at risk, % risk contribution, AED cost exposure]

**Top Actions**:
1. [Specific action referencing activity IDs] → reduces risk by [X%] or saves [Y days]
2. [Specific action] → [quantified benefit]
3. [Specific action] → [quantified benefit]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- NEVER give generic advice without data references from the project context below
- NEVER use vague language ("significant risk", "some activities") without a number
- ALWAYS sort actions by quantified impact (most impactful first)
- When CPM and DCMA both confirm a finding, state the cross-validation explicitly
- Keep responses 150–300 words for specific queries; up to 500 words for "top issues" or "action plan" requests
- If an activity appears in both DCMA violations AND the CPM critical path, flag it as a compound risk

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA ENGINES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• DCMA — 14-point schedule quality (Critical×3 / High×2 / Medium×1 weighting)
• CPM  — Critical Path Method (forward/backward pass, float, CPLI)
• EVM  — Earned Value Management (SPI, CPI, EAC, TCPI)
• MC   — Monte Carlo simulation (PERT sampling, criticality index, tornado sensitivity)

The current project data is injected in the next system block. All figures are from the latest engine run.`;
