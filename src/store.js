const { TableClient } = require('@azure/data-tables');
const { canonicalizeName, normalizeName } = require('./nameUtils');
const { buildDailyLeaderboard } = require('./leaderboard');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function buildEntry({ id, day, name, analysis, createdAt }) {
  return {
    id,
    date: day,
    name,
    overallScore: analysis.overallScore,
    stages: analysis.stages,
    createdAt,
  };
}

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

    const entry = buildEntry({
      id: this.entries.length + 1,
      day: date.toISOString().slice(0, 10),
      name,
      analysis,
      createdAt: date.toISOString(),
    });

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

  getDayEntries(day = today()) {
    return this.entries.filter((entry) => entry.date === day);
  }

  getDayLeaderboard(day = today()) {
    return buildDailyLeaderboard(this.getDayEntries(day));
  }

  listDays() {
    const days = [...new Set(this.entries.map((entry) => entry.date))];
    return days.sort().reverse();
  }
}

const ENTRIES_TABLE = 'entries';
const NAMES_TABLE = 'names';
const NAMES_PARTITION = 'name';

async function ignoreExists(promise) {
  try {
    await promise;
  } catch (error) {
    if (error.statusCode !== 409) {
      throw error;
    }
  }
}

// Durable store backed by Azure Table Storage. Entries are partitioned by day
// (YYYY-MM-DD); canonical names live in a small companion table for lookups and
// to keep name resolution stable across restarts.
class TableStore {
  constructor(connectionString) {
    this.entriesClient = TableClient.fromConnectionString(connectionString, ENTRIES_TABLE);
    this.namesClient = TableClient.fromConnectionString(connectionString, NAMES_TABLE);
    this.ready = null;
  }

  ensureTables() {
    if (!this.ready) {
      this.ready = Promise.all([
        ignoreExists(this.entriesClient.createTable()),
        ignoreExists(this.namesClient.createTable()),
      ]);
    }
    return this.ready;
  }

  async allNames() {
    const names = [];
    for await (const entity of this.namesClient.listEntities()) {
      names.push(entity.canonical);
    }
    return names;
  }

  async addEntry(rawName, analysis, date = new Date()) {
    await this.ensureTables();

    const existingNames = await this.allNames();
    const name = canonicalizeName(rawName, existingNames);
    if (!name) {
      throw new Error('Name is required.');
    }

    await this.namesClient.upsertEntity(
      { partitionKey: NAMES_PARTITION, rowKey: normalizeName(name), canonical: name },
      'Replace',
    );

    const createdAt = date.toISOString();
    const day = createdAt.slice(0, 10);
    const rowKey = `${createdAt}_${Math.random().toString(36).slice(2, 8)}`;

    await this.entriesClient.createEntity({
      partitionKey: day,
      rowKey,
      name,
      overallScore: analysis.overallScore,
      stagesJson: JSON.stringify(analysis.stages),
      createdAt,
    });

    return buildEntry({ id: rowKey, day, name, analysis, createdAt });
  }

  async lookupNames(query = '') {
    await this.ensureTables();
    const names = await this.allNames();
    const normalizedQuery = String(query).trim().toLowerCase();
    if (!normalizedQuery) {
      return names;
    }
    return names.filter((name) => name.toLowerCase().includes(normalizedQuery));
  }

  async getDayEntries(day = today()) {
    await this.ensureTables();
    const entries = [];
    const iterator = this.entriesClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${day}'` },
    });
    for await (const entity of iterator) {
      entries.push({
        id: entity.rowKey,
        date: entity.partitionKey,
        name: entity.name,
        overallScore: entity.overallScore,
        stages: JSON.parse(entity.stagesJson),
        createdAt: entity.createdAt,
      });
    }
    return entries;
  }

  async getDayLeaderboard(day = today()) {
    return buildDailyLeaderboard(await this.getDayEntries(day));
  }

  async listDays() {
    await this.ensureTables();
    const days = new Set();
    const iterator = this.entriesClient.listEntities({
      queryOptions: { select: ['PartitionKey'] },
    });
    for await (const entity of iterator) {
      days.add(entity.partitionKey);
    }
    return [...days].sort().reverse();
  }
}

function createStore() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    return new TableStore(connectionString);
  }
  return new InMemoryStore();
}

module.exports = {
  InMemoryStore,
  TableStore,
  createStore,
};
