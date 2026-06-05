const { canonicalizeName } = require('./nameUtils');
const { buildDailyLeaderboard } = require('./leaderboard');

class InMemoryStore {
  constructor() {
    this.entries = [];
    this.names = [];
  }

  addEntry(rawName, analysis, date = new Date()) {
    const name = canonicalizeName(rawName, this.names);
    if (!name) {
      throw new Error('Name is required.');
    }

    if (!this.names.includes(name)) {
      this.names.push(name);
    }

    const day = date.toISOString().slice(0, 10);
    const entry = {
      id: this.entries.length + 1,
      date: day,
      name,
      overallScore: analysis.overallScore,
      stages: analysis.stages,
      createdAt: date.toISOString(),
    };

    this.entries.push(entry);
    return entry;
  }

  lookupNames(query = '') {
    const normalizedQuery = String(query).trim().toLowerCase();
    if (!normalizedQuery) {
      return [...this.names];
    }

    return this.names.filter((name) => name.toLowerCase().includes(normalizedQuery));
  }

  getDayEntries(day = new Date().toISOString().slice(0, 10)) {
    return this.entries.filter((entry) => entry.date === day);
  }

  getDayLeaderboard(day = new Date().toISOString().slice(0, 10)) {
    return buildDailyLeaderboard(this.getDayEntries(day));
  }
}

module.exports = {
  InMemoryStore,
};
