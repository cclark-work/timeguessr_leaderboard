const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { InMemoryStore } = require('../src/store');
const { buildDailyLeaderboard } = require('../src/leaderboard');
const { validateAnalysis } = require('../src/aiExtractor');

function sampleAnalysis(base) {
  return {
    overallScore: base,
    stages: Array.from({ length: 5 }, (_, index) => ({
      score: base + index,
      distanceKm: 100 - index,
      yearsOff: index,
    })),
  };
}

test('name lookup uses prior canonical name', () => {
  const store = new InMemoryStore();
  store.addEntry('Chris', sampleAnalysis(1000), new Date('2026-01-01T00:00:00Z'));
  store.addEntry('  chris  ', sampleAnalysis(1001), new Date('2026-01-01T01:00:00Z'));

  const names = store.lookupNames('chr');
  assert.deepEqual(names, ['Chris']);
});

test('listDays returns distinct days with entries, newest first', () => {
  const store = new InMemoryStore();
  store.addEntry('A', sampleAnalysis(1000), new Date('2026-01-03T12:00:00Z'));
  store.addEntry('B', sampleAnalysis(1100), new Date('2026-01-01T12:00:00Z'));
  store.addEntry('C', sampleAnalysis(1200), new Date('2026-01-03T18:00:00Z'));

  assert.deepEqual(store.listDays(), ['2026-01-03', '2026-01-01']);
});

test('daily leaderboard calculates top overall and stage leaders', () => {
  const leaderboard = buildDailyLeaderboard([
    { name: 'A', overallScore: 1200, stages: sampleAnalysis(1200).stages },
    {
      name: 'B',
      overallScore: 1300,
      stages: [
        { score: 1300, distanceKm: 50, yearsOff: 4 },
        { score: 1200, distanceKm: 40, yearsOff: 3 },
        { score: 1100, distanceKm: 30, yearsOff: 2 },
        { score: 1000, distanceKm: 20, yearsOff: 1 },
        { score: 900, distanceKm: 10, yearsOff: 0 },
      ],
    },
  ]);

  assert.equal(leaderboard.topOverall.name, 'B');
  assert.equal(leaderboard.highestStageScores[0][0].name, 'B');
  assert.equal(leaderboard.closestDistances[4][0].distanceKm, 10);
  assert.equal(leaderboard.closestYears[4][0].yearsOff, 0);
});

test('stage tables keep the top 5 per stage, best value per player', () => {
  const stage = (score) => ({ score, distanceKm: 50, yearsOff: 2 });
  const entry = (name, s1) => ({
    name,
    overallScore: s1,
    stages: [stage(s1), stage(1), stage(1), stage(1), stage(1)],
  });

  const leaderboard = buildDailyLeaderboard([
    entry('A', 100),
    entry('B', 200),
    entry('C', 300),
    entry('D', 400),
    entry('E', 500),
    entry('F', 600),
    entry('A', 250), // A's best stage-1 score becomes 250
  ]);

  const stageOne = leaderboard.highestStageScores[0];
  assert.equal(stageOne.length, 5); // top 5 of six distinct players
  assert.deepEqual(stageOne.map((r) => r.name), ['F', 'E', 'D', 'C', 'A']);
  assert.equal(stageOne[0].score, 600);
  assert.equal(stageOne[4].score, 250); // deduped A at their best, B(200) excluded
  assert.equal(stageOne[0].stage, 1);
});

test('top five overall ranks players by best score and dedupes names', () => {
  const stages = sampleAnalysis(0).stages;
  const leaderboard = buildDailyLeaderboard([
    { name: 'A', overallScore: 1000, stages },
    { name: 'A', overallScore: 4000, stages }, // A's best should win
    { name: 'B', overallScore: 3000, stages },
    { name: 'C', overallScore: 2000, stages },
    { name: 'D', overallScore: 5000, stages },
    { name: 'E', overallScore: 1500, stages },
    { name: 'F', overallScore: 500, stages }, // 6th place, excluded
  ]);

  assert.deepEqual(
    leaderboard.topFiveOverall.map((r) => `${r.name}:${r.overallScore}`),
    ['D:5000', 'A:4000', 'B:3000', 'C:2000', 'E:1500'],
  );
  assert.equal(leaderboard.topOverall.name, 'D');
});

test('upload endpoint stores analyzed screenshot data', async () => {
  const app = createApp({
    extractor: async () => sampleAnalysis(1500),
  });

  const response = await request(app)
    .post('/api/upload')
    .field('name', 'Taylor')
    .attach('screenshot', Buffer.from('fake-image'), { filename: 'shot.png', contentType: 'image/png' });

  assert.equal(response.status, 201);
  assert.equal(response.body.entry.name, 'Taylor');
  assert.equal(response.body.entry.stages.length, 5);

  const leaderboardResponse = await request(app).get('/api/leaderboard');
  assert.equal(leaderboardResponse.status, 200);
  assert.equal(leaderboardResponse.body.leaderboard.topOverall.name, 'Taylor');
});

test('validateAnalysis converts meter string distances to kilometers', () => {
  const stageWithMeters = (distanceKm) => ({ score: 1000, distanceKm, yearsOff: 1 });
  const data = {
    overallScore: 5000,
    stages: [
      stageWithMeters('500m'),
      stageWithMeters('1500 m'),
      stageWithMeters('2.5km'),
      stageWithMeters('10 km'),
      stageWithMeters(8),
    ],
  };

  const result = validateAnalysis(data);

  assert.equal(result.stages[0].distanceKm, 0.5);
  assert.equal(result.stages[1].distanceKm, 1.5);
  assert.equal(result.stages[2].distanceKm, 2.5);
  assert.equal(result.stages[3].distanceKm, 10);
  assert.equal(result.stages[4].distanceKm, 8);
});

test('validateAnalysis rejects stages with invalid distanceKm', () => {
  const data = {
    overallScore: 5000,
    stages: Array.from({ length: 5 }, (_, i) => ({
      score: 1000,
      distanceKm: i === 2 ? 'invalid' : 10,
      yearsOff: 0,
    })),
  };

  assert.throws(() => validateAnalysis(data), /Stage 3 is missing a valid distanceKm/);
});
