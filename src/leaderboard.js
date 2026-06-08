const TOP_N = 5;
const STAGE_COUNT = 5;

function buildTopFiveOverall(entries) {
  // Keep each player's best overall score, then rank the top 5.
  const bestByName = new Map();
  for (const entry of entries) {
    const current = bestByName.get(entry.name);
    if (!current || entry.overallScore > current.overallScore) {
      bestByName.set(entry.name, {
        name: entry.name,
        overallScore: entry.overallScore,
      });
    }
  }

  return [...bestByName.values()]
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, TOP_N);
}

// Top 5 players for a single stage on a single metric. `direction` is 'max'
// (higher is better, e.g. score) or 'min' (lower is better, e.g. distance,
// years off). Each player keeps only their best value for the stage.
function topPlayersForStage(entries, stageIndex, valueKey, direction) {
  const isBetter = direction === 'max'
    ? (candidate, current) => candidate > current
    : (candidate, current) => candidate < current;

  const bestByName = new Map();
  for (const entry of entries) {
    const stage = entry.stages[stageIndex];
    if (!stage || !Number.isFinite(stage[valueKey])) {
      continue;
    }
    const value = stage[valueKey];
    const current = bestByName.get(entry.name);
    if (!current || isBetter(value, current.value)) {
      bestByName.set(entry.name, { name: entry.name, value });
    }
  }

  return [...bestByName.values()]
    .sort((a, b) => (direction === 'max' ? b.value - a.value : a.value - b.value))
    .slice(0, TOP_N)
    .map((row) => ({ stage: stageIndex + 1, name: row.name, [valueKey]: row.value }));
}

function buildStageTable(entries, valueKey, direction) {
  return Array.from({ length: STAGE_COUNT }, (_, index) => (
    topPlayersForStage(entries, index, valueKey, direction)
  ));
}

function buildDailyLeaderboard(entries) {
  const topFiveOverall = buildTopFiveOverall(entries);

  return {
    topOverall: topFiveOverall[0] || null,
    topFiveOverall,
    highestStageScores: buildStageTable(entries, 'score', 'max'),
    closestDistances: buildStageTable(entries, 'distanceKm', 'min'),
    closestYears: buildStageTable(entries, 'yearsOff', 'min'),
  };
}

module.exports = {
  buildDailyLeaderboard,
};
