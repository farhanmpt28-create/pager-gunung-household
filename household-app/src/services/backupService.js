import db, { DATABASE_VERSION, TABLE_NAMES } from '../database.js'

export const BACKUP_FORMAT = 'pager-gunung-household-backup'
export const BACKUP_FORMAT_VERSION = 1

const primaryKeyFields = Object.fromEntries(
  TABLE_NAMES.map((tableName) => [
    tableName,
    tableName === 'settings' ? 'key' : 'id',
  ]),
)

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateDatabaseBackup(backup) {
  if (!isRecord(backup) || backup.format !== BACKUP_FORMAT) {
    throw new TypeError('Format file backup tidak dikenali.')
  }
  if (backup.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new TypeError('Versi format backup tidak kompatibel.')
  }
  if (backup.databaseVersion !== DATABASE_VERSION) {
    throw new TypeError(
      `Versi database backup (${backup.databaseVersion}) tidak kompatibel dengan versi aplikasi (${DATABASE_VERSION}).`,
    )
  }
  if (
    typeof backup.backupDate !== 'string' ||
    Number.isNaN(Date.parse(backup.backupDate))
  ) {
    throw new TypeError('Tanggal backup tidak valid.')
  }
  if (!isRecord(backup.tables)) {
    throw new TypeError('Data tabel pada backup tidak valid.')
  }

  const tableNames = Object.keys(backup.tables)
  if (
    tableNames.length !== TABLE_NAMES.length ||
    TABLE_NAMES.some((tableName) => !Object.hasOwn(backup.tables, tableName))
  ) {
    throw new TypeError('Backup harus berisi seluruh tabel database.')
  }

  const counts = {}
  for (const tableName of TABLE_NAMES) {
    const records = backup.tables[tableName]
    if (!Array.isArray(records)) {
      throw new TypeError(`Data tabel ${tableName} harus berupa daftar.`)
    }

    const primaryKeyField = primaryKeyFields[tableName]
    const primaryKeys = new Set()
    for (const record of records) {
      if (!isRecord(record)) {
        throw new TypeError(`Terdapat record tidak valid pada tabel ${tableName}.`)
      }

      const primaryKey = record[primaryKeyField]
      const validPrimaryKey =
        tableName === 'settings'
          ? typeof primaryKey === 'string' && primaryKey.trim() !== ''
          : Number.isSafeInteger(primaryKey) && primaryKey > 0
      if (!validPrimaryKey || primaryKeys.has(primaryKey)) {
        throw new TypeError(`Primary key pada tabel ${tableName} tidak valid.`)
      }
      primaryKeys.add(primaryKey)
    }
    counts[tableName] = records.length
  }

  return counts
}

export async function createDatabaseBackup(backupDate = new Date()) {
  const tables = await db.transaction(
    'r',
    ...TABLE_NAMES.map((tableName) => db.table(tableName)),
    async () => {
      const tableData = {}
      for (const tableName of TABLE_NAMES) {
        tableData[tableName] = await db.table(tableName).toArray()
      }
      return tableData
    },
  )

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    backupDate: backupDate.toISOString(),
    databaseVersion: DATABASE_VERSION,
    tables,
  }
}

export function getBackupFilename(backupDate = new Date()) {
  const year = backupDate.getFullYear()
  const month = String(backupDate.getMonth() + 1).padStart(2, '0')
  const day = String(backupDate.getDate()).padStart(2, '0')
  return `pager-gunung-backup-${year}-${month}-${day}.json`
}

export async function restoreDatabaseBackup(backup) {
  validateDatabaseBackup(backup)

  return db.transaction(
    'rw',
    ...TABLE_NAMES.map((tableName) => db.table(tableName)),
    async () => {
      for (const tableName of TABLE_NAMES) {
        await db.table(tableName).clear()
      }
      for (const tableName of TABLE_NAMES) {
        const records = backup.tables[tableName]
        if (records.length) {
          await db.table(tableName).bulkAdd(records)
        }
      }
    },
  )
}
