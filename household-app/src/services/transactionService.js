import { liveQuery } from 'dexie'
import db from '../database.js'
import {
  createRecord,
  listRecords,
  updateRecord,
  withDatabaseTransaction,
} from './databaseService.js'
import { isValidPeriod, listPeriods } from './periodService.js'

export function subscribeTransactionData(onNext, onError) {
  return liveQuery(async () => {
    const [transactions, categories, periods] = await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      listPeriods(),
    ])
    return { transactions, categories, periods }
  }).subscribe({ next: onNext, error: onError })
}

function validateTransactionInput({ type, period, categoryName, amount, description }) {
  if (type !== 'income' && type !== 'expense') {
    throw new TypeError('Jenis transaksi harus pemasukan atau pengeluaran.')
  }
  if (!isValidPeriod(period)) {
    throw new TypeError('Periode transaksi harus menggunakan format YYYY-MM.')
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new TypeError('Nominal harus berupa bilangan Rupiah bulat lebih dari nol.')
  }
  if (typeof description !== 'string' || description.trim() === '') {
    throw new TypeError('Deskripsi transaksi wajib diisi.')
  }
  if (
    type === 'expense' &&
    (typeof categoryName !== 'string' || categoryName.trim() === '')
  ) {
    throw new TypeError('Kategori pengeluaran wajib diisi.')
  }
  if (categoryName !== undefined && typeof categoryName !== 'string') {
    throw new TypeError('Kategori transaksi harus berupa teks.')
  }

  return {
    type,
    period,
    date: `${period}-01`,
    categoryId: null,
    categoryName: type === 'expense' ? categoryName.trim() : '',
    amount,
    description: description.trim(),
  }
}

export function listTransactions() {
  return listRecords('transactions')
}

export async function saveManualTransaction(input) {
  const transaction = validateTransactionInput(input)
  const { id } = input

  return withDatabaseTransaction(
    ['transactions', 'settings'],
    async ({ transactions, settings }) => {
      if (!(await settings.get(`period:${transaction.period}`))) {
        throw new Error(
          `Periode ${transaction.period} belum tersedia. Tambahkan melalui Settings.`,
        )
      }

      let existing
      if (id !== undefined && id !== null) {
        existing = await transactions.get(id)
        if (!existing) {
          throw new Error(`Transaksi dengan ID ${id} tidak ditemukan.`)
        }
        if (
          (existing.source && existing.source !== 'manual') ||
          existing.purchaseId != null
        ) {
          throw new Error(
            'Transaksi terkait pembelian hanya dapat dikelola melalui Pembelian.',
          )
        }
      }

      const record = {
        ...transaction,
        source: 'manual',
        purchaseId: null,
      }

      if (existing) {
        return updateRecord('transactions', id, record)
      }

      return createRecord('transactions', record)
    },
  )
}

export async function saveManualTransactions(inputs) {
  if (!Array.isArray(inputs)) {
    throw new TypeError('Daftar transaksi harus berupa array.')
  }

  for (const input of inputs) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('Setiap baris transaksi harus berupa objek.')
    }
  }

  const nonEmptyInputs = inputs.filter((input) =>
    [
      input.description,
      input.categoryName,
      input.income,
      input.expense,
    ].some((value) =>
      typeof value === 'string' ? value.trim() !== '' : value != null,
    ),
  )

  if (nonEmptyInputs.length === 0) {
    return []
  }

  const transactions = nonEmptyInputs.map((input) => {
    const income = input.income
    const expense = input.expense
    const hasIncome =
      typeof income === 'string' ? income.trim() !== '' : income != null
    const hasExpense =
      typeof expense === 'string' ? expense.trim() !== '' : expense != null

    if (hasIncome && hasExpense) {
      throw new TypeError(
        'Satu baris hanya boleh memiliki pemasukan atau pengeluaran.',
      )
    }
    if (!hasIncome && !hasExpense) {
      throw new TypeError(
        'Setiap transaksi harus memiliki nominal pemasukan atau pengeluaran.',
      )
    }

    const amountText = hasIncome ? income : expense
    if (
      typeof amountText !== 'string' ||
      !/^\d+$/.test(amountText.trim())
    ) {
      throw new TypeError(
        'Nominal harus berupa bilangan Rupiah bulat yang valid.',
      )
    }

    const amount = Number(amountText.trim())
    return validateTransactionInput({
      type: hasIncome ? 'income' : 'expense',
      period: input.period,
      amount,
      categoryName: input.categoryName,
      description: input.description,
    })
  })

  return withDatabaseTransaction(
    ['transactions', 'settings'],
    async ({ transactions: transactionTable, settings }) => {
      const periodAvailability = new Map()
      await Promise.all(
        [...new Set(transactions.map(({ period }) => period))].map(
          async (period) => {
            periodAvailability.set(
              period,
              Boolean(await settings.get(`period:${period}`)),
            )
          },
        ),
      )
      const missingPeriod = transactions.find(
        ({ period }) => !periodAvailability.get(period),
      )
      if (missingPeriod) {
        throw new Error(
          `Periode ${missingPeriod.period} belum tersedia. Tambahkan melalui Settings.`,
        )
      }

      const now = new Date().toISOString()
      const records = transactions.map((transaction) => ({
        ...transaction,
        source: 'manual',
        purchaseId: null,
        createdAt: now,
        updatedAt: now,
      }))
      const keys = await transactionTable.bulkAdd(records, { allKeys: true })
      return transactionTable.bulkGet(keys)
    },
  )
}

export async function deleteManualTransaction(id) {
  if (id === undefined || id === null) {
    throw new TypeError('ID transaksi wajib diisi.')
  }

  return withDatabaseTransaction(['transactions'], async ({ transactions }) => {
    const transaction = await transactions.get(id)
    if (!transaction) {
      throw new Error(`Transaksi dengan ID ${id} tidak ditemukan.`)
    }
    if (
      (transaction.source && transaction.source !== 'manual') ||
      transaction.purchaseId != null
    ) {
      throw new Error(
        'Transaksi terkait pembelian tidak dapat dihapus dari halaman transaksi.',
      )
    }

    await transactions.delete(id)
    return transaction
  })
}
