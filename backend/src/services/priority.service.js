const DEFAULT_WEIGHTS = {
  safetyRisk: 4,
  essentialServiceOutage: 3,
  affectsMultipleRooms: 2,
  functionalityLoss: 1,
};

const DEFAULT_THRESHOLDS = {
  CRITICAL: 7,
  HIGH: 4,
  MEDIUM: 1,
};

const INDICATOR_LABELS = {
  safetyRisk: 'safety risk',
  essentialServiceOutage: 'essential service outage',
  affectsMultipleRooms: 'affects multiple rooms',
  functionalityLoss: 'loss of functionality',
};

function formatExplanation(activePhrases) {
  if (activePhrases.length === 0) {
    return 'No urgency indicators were reported.';
  }
  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
  if (activePhrases.length === 1) {
    return `${capitalize(activePhrases[0])} was reported.`;
  }
  if (activePhrases.length === 2) {
    return `${capitalize(activePhrases[0])} and ${activePhrases[1]} were reported.`;
  }
  const allButLast = activePhrases.slice(0, -1).join(', ');
  const last = activePhrases.at(-1);
  return `${capitalize(allButLast)} and ${last} were reported.`;
}

function computePriority(indicators = {}, policy = {}) {
  const weights = policy.priorityWeights || DEFAULT_WEIGHTS;
  const thresholds = policy.priorityThresholds || DEFAULT_THRESHOLDS;

  const score =
    (indicators.safetyRisk
      ? (weights.safetyRisk ?? DEFAULT_WEIGHTS.safetyRisk)
      : 0) +
    (indicators.essentialServiceOutage
      ? (weights.essentialServiceOutage ??
        DEFAULT_WEIGHTS.essentialServiceOutage)
      : 0) +
    (indicators.affectsMultipleRooms
      ? (weights.affectsMultipleRooms ?? DEFAULT_WEIGHTS.affectsMultipleRooms)
      : 0) +
    (indicators.functionalityLoss
      ? (weights.functionalityLoss ?? DEFAULT_WEIGHTS.functionalityLoss)
      : 0);

  let suggestedPriority = 'LOW';
  if (score >= (thresholds.CRITICAL ?? DEFAULT_THRESHOLDS.CRITICAL)) {
    suggestedPriority = 'CRITICAL';
  } else if (score >= (thresholds.HIGH ?? DEFAULT_THRESHOLDS.HIGH)) {
    suggestedPriority = 'HIGH';
  } else if (score >= (thresholds.MEDIUM ?? DEFAULT_THRESHOLDS.MEDIUM)) {
    suggestedPriority = 'MEDIUM';
  }

  // Active indicators in weight-descending order
  const indicatorOrder = [
    'safetyRisk',
    'essentialServiceOutage',
    'affectsMultipleRooms',
    'functionalityLoss',
  ];
  indicatorOrder.sort(
    (a, b) =>
      (weights[b] ?? DEFAULT_WEIGHTS[b]) - (weights[a] ?? DEFAULT_WEIGHTS[a])
  );

  const activePhrases = [];
  for (const key of indicatorOrder) {
    if (indicators[key]) {
      activePhrases.push(INDICATOR_LABELS[key]);
    }
  }

  const priorityExplanation = formatExplanation(activePhrases);

  return {
    score,
    suggestedPriority,
    priorityExplanation,
  };
}

module.exports = {
  computePriority,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
};
