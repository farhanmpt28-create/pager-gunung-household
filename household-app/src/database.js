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

const db = new Dexie(DATABASE_NAME)

db.version(2).stores({
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

db.version(3).stores({
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

export { db }
export default db
