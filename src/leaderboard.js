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

function buildDailyLeaderboard(entries) {
  const result = {
    topOverall: null,
    highestStageScores: Array.from({ length: 5 }, () => null),
    closestDistances: Array.from({ length: 5 }, () => null),
    closestYears: Array.from({ length: 5 }, () => null),
  };

  for (const entry of entries) {
    result.topOverall = updateMax(result.topOverall, {
      name: entry.name,
      overallScore: entry.overallScore,
    }, 'overallScore');

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
