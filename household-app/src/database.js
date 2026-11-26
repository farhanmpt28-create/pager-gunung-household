import Dexie from 'dexie'

export const DATABASE_NAME = 'household-expense-management'
export const DATABASE_VERSION = 3

export const TABLE_NAMES = [
  'participants',
  'transactions',
  'purchases',
  'purchaseItems',
  'budgets',
  'categories',
  'settings',
]

const dbInstances = new Map()
let activeHouseholdId = 'default'

function setupSchema(dexieInstance) {
  dexieInstance.version(2).stores({
    participants: '++id, name, isActive, createdAt, updatedAt',
    transactions:
      '++id, type, categoryId, date, period, source, purchaseId, createdAt, updatedAt',
    purchases:
      '++id, &purchaseNumber, date, status, transactionId, createdAt, updatedAt, *participantIds',
    purchaseItems: '++id, purchaseId, itemName',
    budgets: '++id, &period, createdAt, updatedAt',
    categories: '++id, name, type, createdAt',
    settings: '&key',
  }).upgrade(async (transaction) => {
    const [transactions, categories] = await Promise.all([
      transaction.table('transactions').toArray(),
      transaction.table('categories').toArray(),
    ])
    const categoryNames = new Map(
      categories.map((category) => [category.id, category.name]),
    )

    await Promise.all(
      transactions.map((record) => {
        const period =
          typeof record.date === 'string' &&
          /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(record.date)
            ? record.date.slice(0, 7)
            : undefined
        const categoryName =
          record.type === 'expense'
            ? record.categoryName ?? categoryNames.get(record.categoryId)
            : record.categoryName
        const changes = {
          ...(period ? { period } : {}),
          ...(categoryName ? { categoryName } : {}),
        }

        return Object.keys(changes).length
          ? transaction.table('transactions').update(record.id, changes)
          : undefined
      }),
    )
  })

  dexieInstance.version(3).stores({
    participants: '++id, name, isActive, createdAt, updatedAt',
    transactions:
      '++id, type, categoryId, date, period, source, purchaseId, createdAt, updatedAt',
    purchases:
      '++id, &purchaseNumber, date, status, transactionId, createdAt, updatedAt, *participantIds',
    purchaseItems: '++id, purchaseId, itemName',
    budgets: '++id, &period, createdAt, updatedAt',
    categories: '++id, name, type, createdAt',
    settings: '&key',
  }).upgrade(async (transaction) => {
    const [transactions, settings] = await Promise.all([
      transaction.table('transactions').toArray(),
      transaction.table('settings').toArray(),
    ])
    const existingKeys = new Set(settings.map(({ key }) => key))
    const periods = new Set(
      transactions
        .map((record) => {
          if (
            typeof record.period === 'string' &&
            /^\d{4}-(0[1-9]|1[0-2])$/.test(record.period)
          ) {
            return record.period
          }
          return typeof record.date === 'string' &&
            /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(record.date)
            ? record.date.slice(0, 7)
            : ''
        })
        .filter(Boolean),
    )

    await Promise.all(
      [...periods]
        .filter((period) => !existingKeys.has(`period:${period}`))
        .map((period) =>
          transaction.table('settings').add({
            key: `period:${period}`,
            value: period,
          }),
        ),
    )
  })

  return dexieInstance
}

export function getDatabaseForHousehold(householdId = 'default') {
  const dbName =
    !householdId || householdId === 'default'
      ? DATABASE_NAME
      : `${DATABASE_NAME}-${householdId}`

  if (!dbInstances.has(dbName)) {
    const instance = new Dexie(dbName)
    setupSchema(instance)
    dbInstances.set(dbName, instance)
  }

  return dbInstances.get(dbName)
}

export function setActiveHouseholdId(householdId) {
  activeHouseholdId = householdId || 'default'
}

export function getActiveHouseholdId() {
  return activeHouseholdId
}

export function getActiveDb() {
  return getDatabaseForHousehold(activeHouseholdId)
}

// Proxy wrapper so existing code `db.transactions`, `db.table()`, etc. seamlessly operates on the active household DB
export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      const active = getActiveDb()
      const value = active[prop]
      if (typeof value === 'function') {
        return value.bind(active)
      }
      return value
    },
  }
)

export default db
