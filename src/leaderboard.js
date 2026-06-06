function updateMax(current, candidate, valueKey) {
  if (!current || candidate[valueKey] > current[valueKey]) {
    return candidate;
  }
  return current;
}

function updateMin(current, candidate, valueKey) {
  if (!current || candidate[valueKey] < current[valueKey]) {
    return candidate;
  }
  return current;
}

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
    .slice(0, 5);
}

function buildDailyLeaderboard(entries) {
  const topFiveOverall = buildTopFiveOverall(entries);
  const result = {
    topOverall: topFiveOverall[0] || null,
    topFiveOverall,
    highestStageScores: Array.from({ length: 5 }, () => null),
    closestDistances: Array.from({ length: 5 }, () => null),
    closestYears: Array.from({ length: 5 }, () => null),
  };

  for (const entry of entries) {
    entry.stages.forEach((stage, index) => {
      result.highestStageScores[index] = updateMax(result.highestStageScores[index], {
        stage: index + 1,
        name: entry.name,
        score: stage.score,
      }, 'score');

      result.closestDistances[index] = updateMin(result.closestDistances[index], {
        stage: index + 1,
        name: entry.name,
        distanceKm: stage.distanceKm,
      }, 'distanceKm');

      result.closestYears[index] = updateMin(result.closestYears[index], {
        stage: index + 1,
        name: entry.name,
        yearsOff: stage.yearsOff,
      }, 'yearsOff');
    });
  }

  return result;
}

module.exports = {
  buildDailyLeaderboard,
};
