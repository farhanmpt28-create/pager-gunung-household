import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import db, { DATABASE_VERSION, TABLE_NAMES } from '../database.js'
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  createDatabaseBackup,
  getBackupFilename,
  restoreDatabaseBackup,
  validateDatabaseBackup,
} from './backupService.js'

const fixture = {
  participants: [
    { id: 101, name: 'Peserta', isActive: true },
  ],
  transactions: [
    {
      id: 201,
      type: 'expense',
      amount: 90000,
      date: '2026-11-15',
      period: '2026-11',
      categoryId: 601,
      purchaseId: 301,
      source: 'purchase',
    },
  ],
  purchases: [
    {
      id: 301,
      purchaseNumber: 'PUR-301',
      date: '2026-11-15',
      status: 'PAID',
      totalAmount: 90000,
      transactionId: 201,
      participantId: 101,
      participantIds: [101],
      categoryId: 601,
    },
  ],
  purchaseItems: [
    {
      id: 401,
      purchaseId: 301,
      itemName: 'Belanja',
      quantity: 1,
      unitPrice: 90000,
      subtotal: 90000,
    },
  ],
  budgets: [
    { id: 501, period: '2026-11', amount: 250000 },
  ],
  categories: [
    { id: 601, name: 'Konsumsi', type: 'expense' },
  ],
  settings: [
    { key: 'currency', value: 'IDR' },
    { key: 'period:2026-11', value: '2026-11' },
  ],
}

async function clearDatabase() {
  await db.open()
  await db.transaction(
    'rw',
    ...TABLE_NAMES.map((tableName) => db.table(tableName)),
    async () => {
      for (const tableName of TABLE_NAMES) {
        await db.table(tableName).clear()
      }
    },
  )
}

async function seedDatabase(data = fixture) {
  for (const tableName of TABLE_NAMES) {
    if (data[tableName]?.length) {
      await db.table(tableName).bulkAdd(data[tableName])
    }
  }
}

async function readDatabase() {
  return Object.fromEntries(
    await Promise.all(
      TABLE_NAMES.map(async (tableName) => [
        tableName,
        await db.table(tableName).toArray(),
      ]),
    ),
  )
}

test('backup exports every Dexie table, metadata, IDs, and purchase relations', async (t) => {
  t.after(() => db.close())
  await clearDatabase()
  await seedDatabase()

  const backupDate = new Date(2026, 10, 22, 7)
  const backup = await createDatabaseBackup(backupDate)

  assert.equal(backup.format, BACKUP_FORMAT)
  assert.equal(backup.formatVersion, BACKUP_FORMAT_VERSION)
  assert.equal(backup.databaseVersion, DATABASE_VERSION)
  assert.equal(backup.backupDate, backupDate.toISOString())
  assert.equal(getBackupFilename(backupDate), 'pager-gunung-backup-2026-11-22.json')
  assert.deepEqual(Object.keys(backup.tables).sort(), [...TABLE_NAMES].sort())
  assert.deepEqual(backup.tables, fixture)
  assert.deepEqual(validateDatabaseBackup(backup), {
    participants: 1,
    transactions: 1,
    purchases: 1,
    purchaseItems: 1,
    budgets: 1,
    categories: 1,
    settings: 2,
  })
})

test('restore replaces all tables and preserves record counts and purchase relations', async (t) => {
  t.after(() => db.close())
  await clearDatabase()
  await seedDatabase()
  const backup = await createDatabaseBackup()

  await clearDatabase()
  await db.categories.add({ id: 999, name: 'Data lokal lama', type: 'expense' })
  await db.settings.add({ key: 'local-only', value: true })
  await restoreDatabaseBackup(backup)

  const restored = await readDatabase()
  for (const tableName of TABLE_NAMES) {
    assert.equal(restored[tableName].length, backup.tables[tableName].length)
    assert.deepEqual(restored[tableName], backup.tables[tableName])
  }
  assert.equal(restored.transactions[0].purchaseId, restored.purchases[0].id)
  assert.equal(restored.purchases[0].transactionId, restored.transactions[0].id)
  assert.equal(restored.purchaseItems[0].purchaseId, restored.purchases[0].id)
  assert.deepEqual(restored.purchases[0].participantIds, [restored.participants[0].id])
})

test('corrupt and incompatible backups are rejected without changing local data', async (t) => {
  t.after(() => db.close())
  await clearDatabase()
  await seedDatabase()
  const before = await readDatabase()
  const backup = await createDatabaseBackup()

  assert.throws(() => JSON.parse('{"tables":'), SyntaxError)
  await assert.rejects(
    restoreDatabaseBackup({
      ...backup,
      tables: { ...backup.tables, transactions: {} },
    }),
    /Data tabel transactions harus berupa daftar/,
  )
  await assert.rejects(
    restoreDatabaseBackup({ ...backup, formatVersion: BACKUP_FORMAT_VERSION + 1 }),
    /Versi format backup tidak kompatibel/,
  )
  await assert.rejects(
    restoreDatabaseBackup({ ...backup, databaseVersion: DATABASE_VERSION + 1 }),
    /tidak kompatibel/,
  )
  assert.deepEqual(await readDatabase(), before)
})

test('failed table insertion rolls back the entire restore', async (t) => {
  t.after(() => db.close())
  await clearDatabase()
  await seedDatabase()
  const before = await readDatabase()
  const backup = await createDatabaseBackup()
  backup.tables.purchases.push({
    ...backup.tables.purchases[0],
    id: 302,
  })

  await assert.rejects(restoreDatabaseBackup(backup))
  assert.deepEqual(await readDatabase(), before)
})
