/**
 * Converts a NEXUS mock Project into the canonical EngineInput shape.
 * In production this would query activity_snapshots + activity_relationships from DB.
 */
import type { Project } from "../types";
import type { ScheduleActivity, ActivityRelationship } from "./core/types";
import type { OrchestratorRequest } from "./orchestrator";

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

export function projectToEngineRequest(
  project: Project,
  options?: { mc_iterations?: number; mc_seed?: number },
): OrchestratorRequest {
  // ── Flatten all activities from all frameworks ───────────────────────────
  const activities: ScheduleActivity[] = project.frameworks.flatMap((fw) =>
    fw.activities.map((a) => ({
      activity_id:   a.id,
      external_id:   a.id.split("-").pop()?.toUpperCase() ?? a.id,
      name:          a.name,
      wbs_code:      a.wbsCode,
      wbs_node_id:   fw.id,
      activity_type: "Task" as const,
      status:        a.status === "Complete" ? "Complete" as const
                   : a.status === "Delayed"  ? "Delayed"  as const
                   : a.status === "In Progress" ? "In Progress" as const
                   : "Not Started" as const,

      planned_start:   a.plannedStart,
      planned_finish:  a.plannedEnd,
      forecast_start:  a.plannedStart,
      forecast_finish: a.forecastEnd,
      actual_start:    a.actualStart ?? null,
      actual_finish:   null,

      planned_duration:   a.duration,
      remaining_duration: a.remainingDuration,
      percent_complete:   a.percentComplete,

      total_float:     a.float,
      free_float:      Math.max(0, a.float - 2),
      is_critical:     a.isCritical,

      constraint_type:  null,
      constraint_date:  null,

      // EVM — estimated from budget allocation
      budgeted_at_completion: a.revenueImpactPerDay * a.duration,
      planned_value:   null,
      earned_value:    null,
      actual_cost:     null,

      // Monte Carlo — derive from delay factor
      duration_optimistic:  Math.round(a.duration * 0.85),
      duration_most_likely: a.duration,
      duration_pessimistic: Math.round(a.duration * (a.delayDays > 0 ? 1.45 : 1.25)),
      duration_distribution: "PERT" as const,

      has_predecessor:  a.predecessors.length > 0,
      has_successor:    a.successors.length   > 0,
      resource_assigned: true,

      responsible_party: a.responsible,
    }))
  );

  // ── Build relationships from predecessor arrays ───────────────────────────
  const relationships: ActivityRelationship[] = [];
  let relCounter = 0;
  for (const act of activities) {
    const src = project.frameworks.flatMap((f) => f.activities).find((a) => a.id === act.activity_id);
    for (const predId of src?.predecessors ?? []) {
      relationships.push({
        relationship_id: `rel_${++relCounter}`,
        predecessor_id:  predId,
        successor_id:    act.activity_id,
        type:            "FS",
        lag_days:        0,
        is_driving:      act.is_critical ?? false,
      });
    }
  }

  // Virtual start/finish milestones
  const startMilestone: ScheduleActivity = {
    activity_id: `${project.id}_START`, external_id: "M_START",
    name: "Project Start", wbs_code: "0.0", wbs_node_id: "root",
    activity_type: "Milestone", status: "Complete",
    planned_start: project.plannedStart, planned_finish: project.plannedStart,
    forecast_start: project.plannedStart, forecast_finish: project.plannedStart,
    actual_start: project.plannedStart, actual_finish: project.plannedStart,
    planned_duration: 0, remaining_duration: 0, percent_complete: 100,
    total_float: 0, free_float: 0, is_critical: true,
    constraint_type: null, constraint_date: null,
    budgeted_at_completion: null, planned_value: null, earned_value: null, actual_cost: null,
    duration_optimistic: 0, duration_most_likely: 0, duration_pessimistic: 0,
    duration_distribution: "PERT",
    has_predecessor: false, has_successor: true, resource_assigned: false,
    responsible_party: null,
  };

  const finishMilestone: ScheduleActivity = {
    ...startMilestone,
    activity_id: `${project.id}_FINISH`, external_id: "M_FINISH",
    name: "Project Finish", wbs_code: "99.99",
    planned_start: project.forecastEnd, planned_finish: project.forecastEnd,
    forecast_start: project.forecastEnd, forecast_finish: project.forecastEnd,
    actual_start: null, actual_finish: null,
    status: "Not Started",
    percent_complete: 0, total_float: project.totalFloat,
    has_predecessor: true, has_successor: false,
  };

  // Connect all leaf activities to finish milestone
  for (const act of activities) {
    if (!act.has_successor) {
      relationships.push({
        relationship_id: `rel_finish_${act.activity_id}`,
        predecessor_id:  act.activity_id,
        successor_id:    finishMilestone.activity_id,
        type: "FS", lag_days: 0, is_driving: false,
      });
      act.has_successor = true;
    }
  }

  const allActivities = [startMilestone, ...activities, finishMilestone];
  const dataDate      = new Date().toISOString().split("T")[0];
  const plannedDuration = daysBetween(project.plannedStart, project.plannedEnd);
  const elapsedDuration = daysBetween(project.plannedStart, dataDate);

  return {
    project_id:        project.id,
    update_id:         `update_${project.id}_current`,
    activities:        allActivities,
    relationships,
    project_start_id:  startMilestone.activity_id,
    project_finish_id: finishMilestone.activity_id,
    data_date:         dataDate,
    planned_finish:    project.plannedEnd,
    project_budget:    project.budget,
    planned_duration:  Math.max(1, plannedDuration),
    elapsed_duration:  Math.max(1, elapsedDuration),
    engines:           ["DCMA", "CPM", "EVM", "MONTE_CARLO"],
    options: {
      mc_iterations: options?.mc_iterations ?? 500,
      mc_seed:       options?.mc_seed ?? 42,
      confidence_levels: [0.5, 0.7, 0.8, 0.85, 0.9, 0.95],
    },
    triggered_by: "api",
  };
}
