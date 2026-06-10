const { TableClient } = require('@azure/data-tables');

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!connectionString) {
  throw new Error('AZURE_STORAGE_CONNECTION_STRING is required.');
}

const tableClient = TableClient.fromConnectionString(connectionString, 'entries');
const LEGACY_DAY_PARTITION = /^\d{4}-\d{2}-\d{2}$/;
const TARGET_PARTITION = 'entries';

async function run() {
  let migrated = 0;
  let skipped = 0;

  for await (const entity of tableClient.listEntities()) {
    const sourcePartition = entity.partitionKey;
    const rowKey = entity.rowKey;

    if (sourcePartition === TARGET_PARTITION || !LEGACY_DAY_PARTITION.test(sourcePartition)) {
      skipped += 1;
      continue;
    }

    let destinationExists = false;
    try {
      await tableClient.getEntity(TARGET_PARTITION, rowKey);
      destinationExists = true;
    } catch (error) {
      if (error.statusCode !== 404) {
        throw error;
      }
    }

    if (!destinationExists) {
      await tableClient.createEntity({
        partitionKey: TARGET_PARTITION,
        rowKey,
        name: entity.name,
        overallScore: entity.overallScore,
        stagesJson: entity.stagesJson,
        createdAt: entity.createdAt,
      });
    }

    await tableClient.deleteEntity(sourcePartition, rowKey);
    migrated += 1;
  }

  console.log(`Migration complete. Migrated ${migrated} entries, skipped ${skipped} entries.`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
