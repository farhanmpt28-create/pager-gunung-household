import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import db from '../database.js'
import { addPeriod } from './periodService.js'
import {
  calculateFinancialSummary,
  calculateMonthlyFinancialSummary,
  calculateMonthlyExpenseTrend,
  calculatePurchaseSummary,
  getPeriodRange,
  hasTransactions,
  subscribeDashboardData,
} from './dashboardService.js'

test('financial summary totals income, expenses, period transactions, and all-time balance', () => {
  const transactions = [
    { type: 'income', amount: 500000, date: '2026-11-03' },
    { type: 'expense', amount: 125000, date: '2026-11-12' },
    { type: 'income', amount: 200000, date: '2026-10-12' },
  ]

  const summary = calculateFinancialSummary(transactions, {
    from: '2026-11-01',
    to: '2026-11-30',
  })

  assert.equal(summary.totalIncome, 500000)
  assert.equal(summary.totalExpense, 125000)
  assert.equal(summary.balance, 575000)
  assert.equal(summary.transactionCount, 2)
})

test('period ranges cover today, this month, last month, year, and all time', () => {
  const now = new Date(2026, 10, 22)

  assert.deepEqual(getPeriodRange('today', now), {
    from: '2026-11-22',
    to: '2026-11-22',
  })
  assert.deepEqual(getPeriodRange('thisMonth', now), {
    from: '2026-11-01',
    to: '2026-11-30',
  })
  assert.deepEqual(getPeriodRange('lastMonth', now), {
    from: '2026-10-01',
    to: '2026-10-31',
  })
  assert.deepEqual(getPeriodRange('thisYear', now), {
    from: '2026-01-01',
    to: '2026-12-31',
  })
  assert.deepEqual(getPeriodRange('all', now), { from: '', to: '' })
  assert.deepEqual(getPeriodRange('custom', now, {
    from: '2026-11-01',
    to: '2026-11-15',
  }), {
    from: '2026-11-01',
    to: '2026-11-15',
  })
})

test('paid purchase totals stay separate from transaction expense totals', () => {
  const transactions = [
    { type: 'expense', amount: 125000, date: '2026-11-12', source: 'purchase' },
  ]
  const purchases = [
    { status: 'PAID', totalAmount: 125000, date: '2026-11-12' },
    { status: 'DRAFT', totalAmount: 70000, date: '2026-11-12' },
    { status: 'CANCELLED', totalAmount: 30000, date: '2026-11-12' },
  ]
  const range = { from: '2026-11-01', to: '2026-11-30' }

  assert.equal(calculateFinancialSummary(transactions, range).totalExpense, 125000)
  assert.deepEqual(calculatePurchaseSummary(purchases, range), {
    paidAmount: 125000,
    paidCount: 1,
    draftCount: 1,
    cancelledCount: 1,
    totalCount: 3,
  })
})

test('monthly summary uses transaction periods and counts a paid purchase expense once', () => {
  const transactions = [
    { type: 'income', amount: 700000, period: '2026-11', date: '2026-11-01' },
    {
      type: 'expense',
      amount: 125000,
      date: '2026-11-12',
      source: 'purchase',
      purchaseId: 7,
    },
    {
      type: 'expense',
      amount: 125000,
      date: '2026-11-12',
      source: 'purchase',
      purchaseId: 7,
    },
    { type: 'expense', amount: 25000, period: '2026-10', date: '2026-10-01' },
  ]
  const summary = calculateMonthlyFinancialSummary(transactions, '2026-11')

  assert.equal(summary.totalIncome, 700000)
  assert.equal(summary.totalExpense, 125000)
  assert.equal(summary.balance, 550000)
  assert.equal(summary.periodTransactions.length, 3)
})

test('annual balance for 2026 does not include 2027 transactions', () => {
  const transactions = [
    { type: 'income', amount: 100000, period: '2026-12' },
    { type: 'expense', amount: 25000, period: '2026-12' },
    { type: 'income', amount: 300000, period: '2027-01' },
    { type: 'expense', amount: 40000, period: '2027-01' },
  ]

  const december = calculateMonthlyFinancialSummary(transactions, '2026-12')
  assert.equal(december.totalIncome, 100000)
  assert.equal(december.totalExpense, 25000)
  assert.deepEqual(december.periodTransactions, transactions.slice(0, 2))
  assert.equal(december.balance, 75000)
})

test('annual balance for 2027 does not include 2026 transactions', () => {
  const transactions = [
    { type: 'income', amount: 100000, period: '2026-12' },
    { type: 'expense', amount: 25000, period: '2026-12' },
    { type: 'income', amount: 300000, period: '2027-01' },
    { type: 'expense', amount: 40000, period: '2027-01' },
  ]

  const january = calculateMonthlyFinancialSummary(transactions, '2027-01')
  assert.equal(january.totalIncome, 300000)
  assert.equal(january.totalExpense, 40000)
  assert.deepEqual(january.periodTransactions, transactions.slice(2))
  assert.equal(january.balance, 260000)
})

test('annual balance stays the same when the selected month changes within a year', () => {
  const transactions = [
    { type: 'income', amount: 100000, period: '2026-01' },
    { type: 'expense', amount: 25000, period: '2026-01' },
    { type: 'income', amount: 300000, period: '2026-12' },
    { type: 'expense', amount: 40000, period: '2026-12' },
    { type: 'income', amount: 900000, period: '2027-01' },
  ]

  const january = calculateMonthlyFinancialSummary(transactions, '2026-01')
  const december = calculateMonthlyFinancialSummary(transactions, '2026-12')

  assert.equal(january.balance, 335000)
  assert.equal(december.balance, 335000)
  assert.equal(january.totalIncome, 100000)
  assert.equal(january.totalExpense, 25000)
  assert.equal(december.totalIncome, 300000)
  assert.equal(december.totalExpense, 40000)
})

test('monthly expense trend has twelve months, zeroes, and comparison without duplicate purchases', () => {
  const transactions = [
    {
      type: 'expense',
      amount: 100000,
      period: '2026-11',
      source: 'purchase',
      purchaseId: 7,
    },
    {
      type: 'expense',
      amount: 100000,
      period: '2026-11',
      source: 'purchase',
      purchaseId: 7,
    },
    { type: 'income', amount: 50000, period: '2026-12' },
    { type: 'expense', amount: 115000, period: '2026-12' },
    { type: 'expense', amount: 90000, period: '2027-01' },
  ]

  const trend = calculateMonthlyExpenseTrend(transactions, '2026-12')
  assert.equal(trend.months.length, 12)
  assert.equal(trend.months[0].label, 'Januari')
  assert.equal(trend.months[0].amount, 0)
  assert.equal(trend.months[10].amount, 100000)
  assert.equal(trend.months[11].amount, 115000)
  assert.equal(trend.comparison.previousPeriod, '2026-11')
  assert.equal(trend.comparison.percentage, 15)
  assert.equal(trend.comparison.direction, 'increase')

  const decrease = calculateMonthlyExpenseTrend([
    { type: 'expense', amount: 100, period: '2026-10' },
    { type: 'expense', amount: 90, period: '2026-11' },
  ], '2026-11')
  const unchanged = calculateMonthlyExpenseTrend([
    { type: 'expense', amount: 100, period: '2026-10' },
    { type: 'expense', amount: 100, period: '2026-11' },
  ], '2026-11')
  const zeroPreviousMonth = calculateMonthlyExpenseTrend([
    { type: 'expense', amount: 0, period: '2026-10' },
    { type: 'expense', amount: 100, period: '2026-11' },
  ], '2026-11')
  assert.equal(decrease.comparison.percentage, 10)
  assert.equal(decrease.comparison.direction, 'decrease')
  assert.equal(unchanged.comparison.direction, 'unchanged')
  assert.equal(zeroPreviousMonth.comparison.percentage, null)
  assert.equal(zeroPreviousMonth.comparison.direction, 'unavailable')
})

test('empty transaction data is recognized for the dashboard empty state', () => {
  assert.equal(hasTransactions([]), false)
  assert.equal(hasTransactions([{ type: 'income', amount: 1, date: '2026-11-22' }]), true)
  assert.equal(
    calculateFinancialSummary([], { from: '', to: '' }).allTimeTransactionCount,
    0,
  )
})

test('live dashboard data emits an updated financial summary when a transaction changes', async (t) => {
  t.after(() => db.close())
  await db.transactions.clear()
  await db.purchases.clear()
  await db.categories.clear()
  await db.settings.clear()

  let resolveInitial
  let resolvePeriodUpdate
  let resolveUpdated
  let rejectInitial
  let rejectPeriodUpdate
  let rejectUpdate
  const initialData = new Promise((resolve, reject) => {
    resolveInitial = resolve
    rejectInitial = reject
  })
  const updatedSummary = new Promise((resolve, reject) => {
    resolveUpdated = resolve
    rejectUpdate = reject
  })
  const updatedPeriods = new Promise((resolve, reject) => {
    resolvePeriodUpdate = resolve
    rejectPeriodUpdate = reject
  })
  const timeout = setTimeout(() => {
    const error = new Error('Live query did not report the transaction update.')
    rejectInitial(error)
    rejectPeriodUpdate(error)
    rejectUpdate(error)
  }, 1000)
  const subscription = subscribeDashboardData(
    (data) => {
      if (data.transactions.length === 0 && data.periods.length === 0) {
        resolveInitial()
      }
      if (data.periods.includes('2026-11')) resolvePeriodUpdate(data.periods)
      if (data.transactions.length === 1) {
        clearTimeout(timeout)
        resolveUpdated(
          calculateFinancialSummary(data.transactions, { from: '', to: '' }),
        )
      }
    },
    (error) => {
      rejectInitial(error)
      rejectPeriodUpdate(error)
      rejectUpdate(error)
    },
  )
  t.after(() => subscription.unsubscribe())
  await initialData
  await addPeriod('2026-11')
  assert.deepEqual(await updatedPeriods, ['2026-11'])
  await db.transactions.add({
    type: 'income',
    amount: 250000,
    categoryId: 1,
    date: '2026-11-22',
    period: '2026-11',
    description: 'Pemasukan baru',
  })

  const summary = await updatedSummary
  assert.equal(summary.totalIncome, 250000)
  assert.equal(summary.balance, 250000)
  subscription.unsubscribe()
})
