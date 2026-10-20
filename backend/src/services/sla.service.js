const DEFAULT_SLA_TARGETS = {
  CRITICAL: { responseMinutes: 120, resolutionMinutes: 480 },
  HIGH: { responseMinutes: 480, resolutionMinutes: 1440 },
  MEDIUM: { responseMinutes: 480, resolutionMinutes: 2880 },
  LOW: { responseMinutes: 1440, resolutionMinutes: 4320 },
};

function computeDeadlines({ cycleStart, priority, slaTargets }) {
  const targets = slaTargets || DEFAULT_SLA_TARGETS;
  const target = targets[priority] || DEFAULT_SLA_TARGETS[priority];
  const responseDueAt = new Date(cycleStart.getTime() + target.responseMinutes * 60000);
  const resolutionDueAt = new Date(cycleStart.getTime() + target.resolutionMinutes * 60000);
  return { responseDueAt, resolutionDueAt };
}

function tightenDeadlines({ existingResponseDueAt, existingResolutionDueAt, cycleStart, newPriority, slaTargets }) {
  const targets = slaTargets || DEFAULT_SLA_TARGETS;
  const target = targets[newPriority] || DEFAULT_SLA_TARGETS[newPriority];
  const candidateResponseDue = new Date(cycleStart.getTime() + target.responseMinutes * 60000);
  const candidateResolutionDue = new Date(cycleStart.getTime() + target.resolutionMinutes * 60000);
  const responseDueAt = new Date(Math.min(existingResponseDueAt.getTime(), candidateResponseDue.getTime()));
  const resolutionDueAt = new Date(Math.min(existingResolutionDueAt.getTime(), candidateResolutionDue.getTime()));
  return { responseDueAt, resolutionDueAt };
}

module.exports = {
  DEFAULT_SLA_TARGETS,
  computeDeadlines,
  tightenDeadlines,
};
