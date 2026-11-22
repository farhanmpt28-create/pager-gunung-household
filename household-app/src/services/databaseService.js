import db, { TABLE_NAMES } from '../database.js'

const tables = new Set(TABLE_NAMES)
const createdAtTables = new Set([
  'participants',
  'transactions',
  'purchases',
  'budgets',
  'categories',
])
const updatedAtTables = new Set([
  'participants',
  'transactions',
  'purchases',
  'budgets',
])

function getTable(tableName) {
  if (!tables.has(tableName)) {
    throw new TypeError(`Unknown database table: ${tableName}`)
  }

  return db.table(tableName)
}

function validateRecord(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('A database record must be an object.')
  }
}

export async function listRecords(tableName) {
  return getTable(tableName).toArray()
}

export async function getRecord(tableName, id) {
  if (id === undefined || id === null) {
    throw new TypeError('A record key is required.')
  }

  return getTable(tableName).get(id)
}

export async function createRecord(tableName, record) {
  validateRecord(record)
  const table = getTable(tableName)
  const now = new Date().toISOString()
  const value = { ...record }

  if (tableName === 'settings') {
    if (typeof value.key !== 'string' || value.key.trim() === '') {
      throw new TypeError('A non-empty setting key is required.')
    }
  } else {
    if (createdAtTables.has(tableName) && value.createdAt === undefined) {
      value.createdAt = now
    }

    if (updatedAtTables.has(tableName) && value.updatedAt === undefined) {
      value.updatedAt = now
    }
  }

  const key = await table.add(value)
  return table.get(key)
}

export async function updateRecord(tableName, id, changes) {
  validateRecord(changes)
  if (id === undefined || id === null) {
    throw new TypeError('A record key is required.')
  }

  const table = getTable(tableName)
  const existing = await table.get(id)
  if (!existing) {
    throw new Error(`Cannot update missing ${tableName} record: ${id}`)
  }

  const value = { ...changes }
  delete value.id
  delete value.key

  if (updatedAtTables.has(tableName)) {
    value.updatedAt = new Date().toISOString()
  }

  await table.update(id, value)
  return table.get(id)
}

export async function deleteRecord(tableName, id) {
  if (id === undefined || id === null) {
    throw new TypeError('A record key is required.')
  }

  const table = getTable(tableName)
  const existing = await table.get(id)
  if (!existing) {
    throw new Error(`Cannot delete missing ${tableName} record: ${id}`)
  }

  await table.delete(id)
  return existing
}

export async function bulkCreateRecords(tableName, records) {
  if (!Array.isArray(records)) {
    throw new TypeError('Records to create must be an array.')
  }

  for (const record of records) {
    validateRecord(record)
  }

  const table = getTable(tableName)
  const now = new Date().toISOString()
  const values = records.map((record) => {
    const value = { ...record }

    if (
      tableName === 'settings' &&
      (typeof value.key !== 'string' || value.key.trim() === '')
    ) {
      throw new TypeError('A non-empty setting key is required.')
    }

    if (createdAtTables.has(tableName) && value.createdAt === undefined) {
      value.createdAt = now
    }

    if (updatedAtTables.has(tableName) && value.updatedAt === undefined) {
      value.updatedAt = now
    }

    return value
  })

  return db.transaction('rw', table, async () => {
    const keys = await table.bulkAdd(values, { allKeys: true })
    return table.bulkGet(keys)
  })
}

export function withDatabaseTransaction(tableNames, operation, mode = 'rw') {
  if (!Array.isArray(tableNames) || tableNames.length === 0) {
    throw new TypeError('At least one database table is required.')
  }
  if (typeof operation !== 'function') {
    throw new TypeError('A database transaction callback is required.')
  }
  if (mode !== 'r' && mode !== 'rw') {
    throw new TypeError('Database transaction mode must be "r" or "rw".')
  }

  const uniqueTableNames = [...new Set(tableNames)]
  const transactionTables = uniqueTableNames.map(getTable)
  const transactionTableMap = Object.fromEntries(
    uniqueTableNames.map((name, index) => [name, transactionTables[index]]),
  )

  return db.transaction(mode, ...transactionTables, () =>
    operation(transactionTableMap),
  )
}
