import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import db from '../database.js'
import {
  addPeriod,
  deletePeriod,
  formatPeriodLabel,
  getCurrentPeriod,
  getTransactionPeriod,
  listPeriods,
  listPeriodOptions,
} from './periodService.js'

test('period options include only configured periods across year boundaries', () => {
  const now = new Date(2026, 0, 15)
  const options = listPeriodOptions(['2026-12', '2027-01', '2026-12', '2020-03'])

  assert.equal(getCurrentPeriod(now), '2026-01')
  assert.deepEqual(options.map(({ value }) => value), [
    '2027-01',
    '2026-12',
    '2020-03',
  ])
  assert.equal(options[0].label, 'Januari 2027')
  assert.equal(formatPeriodLabel('2026-01'), 'Januari 2026')
})

test('legacy transactions derive the period from their saved daily date', () => {
  assert.equal(
    getTransactionPeriod({ date: '2025-12-31' }),
    '2025-12',
  )
  assert.equal(
    getTransactionPeriod({ period: '2026-01', date: '2025-12-31' }),
    '2026-01',
  )
})

test('periods can be added, duplicates are rejected, and empty periods can be deleted', async (t) => {
  t.after(() => db.close())
  await db.open()
  await db.settings.clear()
  await db.transactions.clear()

  assert.equal(await addPeriod('2026-12'), '2026-12')
  assert.equal(await addPeriod('2027-01'), '2027-01')
  await assert.rejects(addPeriod('2026-12'), /sudah tersedia/)
  await assert.rejects(addPeriod('2027-13'), /YYYY-MM/)
  assert.deepEqual(await listPeriods(), ['2027-01', '2026-12'])

  await deletePeriod('2026-12')
  assert.deepEqual(await listPeriods(), ['2027-01'])
})

test('periods with transactions cannot be deleted', async (t) => {
  t.after(() => db.close())
  await db.open()
  await db.settings.clear()
  await db.transactions.clear()
  await addPeriod('2026-12')
  await db.transactions.add({
    type: 'expense',
    amount: 12500,
    date: '2026-12-01',
    period: '2026-12',
    description: 'Pengeluaran bulan Desember',
  })

  await assert.rejects(deletePeriod('2026-12'), /memiliki 1 transaksi/)
  assert.deepEqual(await listPeriods(), ['2026-12'])
})

test('periods persist after the IndexedDB connection is reopened', async (t) => {
  t.after(() => db.close())
  await db.open()
  await db.settings.clear()
  await addPeriod('2027-02')

  db.close()
  await db.open()

  assert.deepEqual(await listPeriods(), ['2027-02'])
})
