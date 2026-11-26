import { liveQuery } from 'dexie'
import db from '../database.js'
import {
  getTransactionPeriod,
  isValidPeriod,
  listPeriods,
} from './periodService.js'

function toLocalDateString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getMonthStart(date) {
  return toLocalDateString(new Date(date.getFullYear(), date.getMonth(), 1))
}

function getMonthEnd(date) {
  return toLocalDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

export function getPeriodRange(period, now = new Date(), customRange = {}) {
  const today = toLocalDateString(now)

  switch (period) {
    case 'today':
      return { from: today, to: today }
    case 'thisMonth':
      return { from: getMonthStart(now), to: getMonthEnd(now) }
    case 'lastMonth': {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return { from: getMonthStart(lastMonth), to: getMonthEnd(lastMonth) }
    }
    case 'thisYear':
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` }
    case 'custom':
      return { from: customRange.from || '', to: customRange.to || '' }
    case 'all':
    default:
      return { from: '', to: '' }
  }
}

export function isDateInRange(date, range) {
  return (!range.from || date >= range.from) && (!range.to || date <= range.to)
}

export function hasTransactions(transactions) {
  return transactions.length > 0
}

function sumTransactions(transactions, type) {
  const countedPurchases = new Set()

  return transactions.reduce((total, transaction) => {
    if (transaction.type !== type) return total
    if (type === 'expense' && transaction.purchaseId != null) {
      if (countedPurchases.has(transaction.purchaseId)) return total
      countedPurchases.add(transaction.purchaseId)
    }

    return total + transaction.amount
  }, 0)
}

export function calculateMonthlyFinancialSummary(transactions, period) {
  const periodTransactions = transactions.filter(
    (transaction) => getTransactionPeriod(transaction) === period,
  )
  const selectedYearTransactions = isValidPeriod(period)
    ? transactions.filter((transaction) =>
        getTransactionPeriod(transaction).startsWith(`${period.slice(0, 4)}-`),
      )
    : []

  const totalIncome = sumTransactions(periodTransactions, 'income')
  const totalExpense = sumTransactions(periodTransactions, 'expense')

  return {
    totalIncome,
    totalExpense,
    monthlyNetBalance: totalIncome - totalExpense,
    balance:
      sumTransactions(selectedYearTransactions, 'income') -
      sumTransactions(selectedYearTransactions, 'expense'),
    periodTransactions,
  }
}

export function calculateMonthlyExpenseTrend(transactions, period) {
  if (!isValidPeriod(period)) {
    return { months: [], comparison: null }
  }

  const [year, selectedMonth] = period.split('-').map(Number)
  const monthlyExpenses = new Map()
  const countedPurchases = new Set()

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue
    if (transaction.purchaseId != null) {
      if (countedPurchases.has(transaction.purchaseId)) continue
      countedPurchases.add(transaction.purchaseId)
    }

    const transactionPeriod = getTransactionPeriod(transaction)
    if (!isValidPeriod(transactionPeriod)) continue
    monthlyExpenses.set(
      transactionPeriod,
      (monthlyExpenses.get(transactionPeriod) ?? 0) + transaction.amount,
    )
  }

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0')
    const monthPeriod = `${year}-${month}`
    return {
      period: monthPeriod,
      label: new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(
        new Date(year, index, 1),
      ),
      amount: monthlyExpenses.get(monthPeriod) ?? 0,
    }
  })

  const previousDate = new Date(year, selectedMonth - 2, 1)
  const previousPeriod = `${previousDate.getFullYear()}-${String(
    previousDate.getMonth() + 1,
  ).padStart(2, '0')}`
  const currentExpense = monthlyExpenses.get(period) ?? 0
  const previousExpense = monthlyExpenses.get(previousPeriod) ?? 0
  let comparison = {
    currentExpense,
    previousExpense,
    previousPeriod,
    percentage: null,
    direction: 'unavailable',
  }

  if (previousExpense > 0) {
    const change = ((currentExpense - previousExpense) / previousExpense) * 100
    comparison = {
      ...comparison,
      percentage: Math.round(Math.abs(change) * 10) / 10,
      direction:
        change > 0 ? 'increase' : change < 0 ? 'decrease' : 'unchanged',
    }
  }

  return { months, comparison }
}

export function calculateFinancialSummary(transactions, range) {
  const periodTransactions = transactions.filter((transaction) =>
    isDateInRange(transaction.date, range),
  )
  const allTimeIncome = transactions.reduce(
    (total, transaction) =>
      transaction.type === 'income' ? total + transaction.amount : total,
    0,
  )
  const allTimeExpense = transactions.reduce(
    (total, transaction) =>
      transaction.type === 'expense' ? total + transaction.amount : total,
    0,
  )

  return {
    totalIncome: periodTransactions.reduce(
      (total, transaction) =>
        transaction.type === 'income' ? total + transaction.amount : total,
      0,
    ),
    totalExpense: periodTransactions.reduce(
      (total, transaction) =>
        transaction.type === 'expense' ? total + transaction.amount : total,
      0,
    ),
    balance: allTimeIncome - allTimeExpense,
    transactionCount: periodTransactions.length,
    allTimeTransactionCount: transactions.length,
    periodTransactions,
  }
}

export function calculatePurchaseSummary(purchases, range) {
  const paidPurchases = purchases.filter(
    (purchase) =>
      (purchase.status === 'PAID' || purchase.status === 'completed') &&
      isDateInRange(purchase.date, range),
  )

  return {
    paidAmount: paidPurchases.reduce(
      (total, purchase) => total + (purchase.totalAmount ?? 0),
      0,
    ),
    paidCount: paidPurchases.length,
    draftCount: purchases.filter((purchase) => purchase.status === 'DRAFT').length,
    cancelledCount: purchases.filter(
      (purchase) => purchase.status === 'CANCELLED',
    ).length,
    totalCount: purchases.length,
  }
}

export function getMonthlyBreakdown(transactions) {
  const months = new Map()

  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7)
    if (!months.has(month)) {
      months.set(month, { month, income: 0, expense: 0 })
    }
    const totals = months.get(month)
    if (transaction.type === 'income') totals.income += transaction.amount
    if (transaction.type === 'expense') totals.expense += transaction.amount
  }

  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
}

export function getExpenseCategoryBreakdown(transactions, categories) {
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  )
  const amounts = new Map()

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue
    const categoryId = transaction.categoryId
    amounts.set(categoryId, (amounts.get(categoryId) ?? 0) + transaction.amount)
  }

  return [...amounts.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      name: categoryNames.get(categoryId) ?? 'Tanpa kategori',
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)
}

export function subscribeDashboardData(onNext, onError) {
  return liveQuery(async () => {
    const [transactions, categories, periods] = await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      listPeriods(),
    ])
    return { transactions, categories, periods }
  }).subscribe({ next: onNext, error: onError })
}
