import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import test from 'node:test'
import db, { DATABASE_NAME } from '../database.js'
import {
  createRecord,
  updateRecord,
} from './databaseService.js'
import { addPeriod } from './periodService.js'
import {
  deleteManualTransaction,
  listTransactions,
  saveManualTransaction,
} from './transactionService.js'

test('database migration preserves old transactions, purchases, and master data', async (t) => {
  t.after(() => db.close())

  const legacyDb = new Dexie(DATABASE_NAME)
  legacyDb.version(1).stores({
    participants: '++id, name, isActive, createdAt, updatedAt',
    transactions:
      '++id, type, categoryId, date, source, purchaseId, createdAt, updatedAt',
    purchases:
      '++id, &purchaseNumber, date, status, transactionId, createdAt, updatedAt, *participantIds',
    purchaseItems: '++id, purchaseId, itemName',
    budgets: '++id, &period, createdAt, updatedAt',
    categories: '++id, name, type, createdAt',
    settings: '&key',
  })
  await legacyDb.open()

  const categoryId = await legacyDb.categories.add({
    name: 'Listrik',
    type: 'expense',
  })
  const participantId = await legacyDb.participants.add({
    name: 'Peserta lama',
    isActive: true,
  })
  const purchaseId = await legacyDb.purchases.add({
    purchaseNumber: 'PUR-OLD',
    date: '2026-02-15',
    status: 'PAID',
    totalAmount: 45000,
    transactionId: null,
    participantIds: [participantId],
  })
  const transactionId = await legacyDb.transactions.add({
    type: 'expense',
    categoryId,
    date: '2026-02-15',
    amount: 45000,
    description: 'Pembelian lama',
    source: 'purchase',
    purchaseId,
  })
  await legacyDb.purchases.update(purchaseId, { transactionId })
  await legacyDb.purchaseItems.add({
    purchaseId,
    itemName: 'Barang lama',
    quantity: 1,
  })
  await legacyDb.budgets.add({ period: '2026-02', amount: 100000 })
  await legacyDb.settings.add({ key: 'legacy-setting', value: 'tetap' })
  legacyDb.close()

  await db.open()
  const migratedTransaction = await db.transactions.get(transactionId)
  assert.equal(migratedTransaction.period, '2026-02')
  assert.equal(migratedTransaction.categoryName, 'Listrik')
  assert.equal((await db.purchases.get(purchaseId)).transactionId, transactionId)
  assert.equal(await db.purchases.count(), 1)
  assert.equal(await db.purchaseItems.count(), 1)
  assert.equal(await db.participants.count(), 1)
  assert.equal(await db.budgets.count(), 1)
  assert.equal((await db.settings.get('legacy-setting')).value, 'tetap')
  assert.equal((await db.settings.get('period:2026-02')).value, '2026-02')
})

test('manual transactions validate, persist, update, and protect purchase records', async (t) => {
  t.after(() => db.close())
  await db.open()
  await db.open()
  await db.transactions.clear()
  await db.purchases.clear()
  await db.purchaseItems.clear()
  await db.categories.clear()
  await db.settings.clear()
  await addPeriod('2026-11')
  await addPeriod('2026-12')

  const income = await saveManualTransaction({
    type: 'income',
    period: '2026-11',
    amount: 1250000,
    description: 'Gaji bulanan',
  })
  const expense = await saveManualTransaction({
    type: 'expense',
    period: '2026-11',
    categoryName: 'Konsumsi',
    amount: 85000,
    description: 'Belanja dapur',
  })

  assert.equal(income.source, 'manual')
  assert.equal(income.period, '2026-11')
  assert.equal(income.date, '2026-11-01')
  assert.equal(income.categoryId, null)
  assert.equal(expense.type, 'expense')
  assert.equal(expense.categoryName, 'Konsumsi')
  assert.deepEqual(
    (await listTransactions()).map(({ id }) => id).sort(),
    [income.id, expense.id].sort(),
  )

  await saveManualTransaction({
    id: expense.id,
    type: 'expense',
    period: '2026-12',
    categoryName: 'Listrik',
    amount: 95000,
    description: expense.description,
  })
  assert.equal((await db.transactions.get(expense.id)).amount, 95000)
  assert.equal((await db.transactions.get(expense.id)).period, '2026-12')
  assert.equal((await db.transactions.get(expense.id)).categoryName, 'Listrik')

  await assert.rejects(
    saveManualTransaction({
      type: 'expense',
      period: '2026-13',
      categoryName: 'Listrik',
      amount: 1000,
      description: 'Periode tidak valid',
    }),
    /YYYY-MM/,
  )
  await assert.rejects(
    saveManualTransaction({
      type: 'income',
      period: '2026-10',
      amount: 1000,
      description: 'Periode belum didaftarkan',
    }),
    /belum tersedia/,
  )
  await assert.rejects(
    saveManualTransaction({
      type: 'expense',
      period: '2026-11',
      categoryName: '',
      amount: 1000,
      description: 'Kategori kosong',
    }),
    /Kategori pengeluaran wajib diisi/,
  )
  for (const amount of [0, -1]) {
    await assert.rejects(
      saveManualTransaction({
        type: 'income',
        period: '2026-11',
        amount,
        description: 'Nominal tidak valid',
      }),
      /Nominal harus/,
    )
  }

  db.close()
  await db.open()
  assert.equal((await db.transactions.get(income.id)).amount, 1250000)
  assert.equal((await db.transactions.get(income.id)).period, '2026-11')
  assert.equal((await db.transactions.get(expense.id)).amount, 95000)

  await deleteManualTransaction(income.id)
  assert.equal(await db.transactions.get(income.id), undefined)

  const category = await createRecord('categories', {
    name: 'Kategori pembelian lama',
    type: 'expense',
  })
  const purchase = await createRecord('purchases', {
    purchaseNumber: 'PURCHASE-TEST-1',
    date: '2026-11-22',
    description: 'Pembelian test',
    participantIds: [],
    status: 'PAID',
    totalAmount: 95000,
    transactionId: null,
    notes: '',
  })
  const purchaseTransaction = await createRecord('transactions', {
    type: 'expense',
    amount: 95000,
    categoryId: category.id,
    date: '2026-11-22',
    description: 'Pembelian test',
    source: 'purchase',
    purchaseId: purchase.id,
  })
  await updateRecord('purchases', purchase.id, {
    transactionId: purchaseTransaction.id,
  })

  await assert.rejects(
    deleteManualTransaction(purchaseTransaction.id),
    /terkait pembelian/,
  )
  assert.equal(
    (await db.transactions.get(purchaseTransaction.id)).purchaseId,
    purchase.id,
  )
})
