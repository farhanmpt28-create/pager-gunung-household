import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import db from '../database.js'
import { saveCategory, saveParticipant } from './masterDataService.js'
import {
  cancelPurchase,
  deleteDraftPurchase,
  listPurchases,
  markPurchasePaid,
  savePurchase,
} from './purchaseService.js'

test('purchases persist, calculate totals, and synchronize one expense atomically', async (t) => {
  t.after(() => db.close())

  const participant = await saveParticipant({ name: 'Peserta Pembelian' })
  const category = await saveCategory({
    name: 'Kategori Pembelian',
    type: 'expense',
  })
  const purchase = await savePurchase({
    participantId: participant.id,
    categoryId: category.id,
    date: '2026-11-22',
    description: 'Belanja kebutuhan rumah',
    notes: 'Catatan belanja',
    items: [
      {
        itemName: 'Beras',
        quantity: 2,
        unit: 'kg',
        unitPrice: 15000,
      },
      {
        itemName: 'Minyak',
        quantity: 1,
        unit: 'liter',
        unitPrice: 18000,
      },
    ],
  })

  assert.equal(purchase.status, 'DRAFT')
  assert.equal(purchase.totalAmount, 48000)
  assert.deepEqual(
    purchase.items.map((item) => item.subtotal),
    [30000, 18000],
  )
  assert.equal(await db.transactions.count(), 0)
  assert.equal(purchase.participantId, participant.id)

  db.close()
  await db.open()
  const persistedDraft = (await listPurchases()).find(
    ({ id }) => id === purchase.id,
  )
  assert.equal(persistedDraft.totalAmount, 48000)
  assert.equal(persistedDraft.items.length, 2)
  assert.equal(await db.transactions.count(), 0)

  const paidPurchase = await markPurchasePaid(purchase.id)
  assert.equal(paidPurchase.status, 'PAID')
  const [expense] = await db.transactions.toArray()
  assert.equal(expense.type, 'expense')
  assert.equal(expense.source, 'purchase')
  assert.equal(expense.purchaseId, purchase.id)
  assert.equal(expense.amount, 48000)
  assert.equal(expense.categoryId, category.id)
  assert.equal(expense.date, '2026-11-22')
  assert.equal(expense.period, '2026-11')
  assert.equal(expense.description, 'Belanja kebutuhan rumah')

  await markPurchasePaid(purchase.id)
  assert.equal(await db.transactions.count(), 1)

  const editedPurchase = await savePurchase({
    id: purchase.id,
    participantId: participant.id,
    categoryId: category.id,
    date: '2026-11-23',
    description: 'Belanja diperbarui',
    notes: 'Item diperbarui',
    items: [
      {
        itemName: 'Sayur',
        quantity: 3,
        unit: 'ikat',
        unitPrice: 5000,
      },
    ],
  })
  assert.equal(editedPurchase.status, 'PAID')
  assert.equal(editedPurchase.totalAmount, 15000)
  assert.equal(await db.transactions.count(), 1)
  const correctedExpense = await db.transactions.get(expense.id)
  assert.equal(correctedExpense.amount, 15000)
  assert.equal(correctedExpense.date, '2026-11-23')
  assert.equal(correctedExpense.period, '2026-11')
  assert.equal(correctedExpense.description, 'Belanja diperbarui')

  await assert.rejects(deleteDraftPurchase(purchase.id), /tidak dapat dihapus/)
  const cancelledPurchase = await cancelPurchase(purchase.id)
  assert.equal(cancelledPurchase.status, 'CANCELLED')
  assert.equal(await db.transactions.count(), 0)
  assert.equal((await db.purchases.get(purchase.id)).transactionId, null)

  await db.close()
  await db.open()
  assert.equal((await db.purchases.get(purchase.id)).status, 'CANCELLED')
  assert.equal(await db.transactions.count(), 0)
})

test('purchase validation and draft deletion do not create expenses', async (t) => {
  t.after(() => db.close())
  await db.open()

  const participant = await saveParticipant({ name: 'Peserta Validasi' })
  const category = await saveCategory({
    name: 'Kategori Validasi',
    type: 'expense',
  })
  const validPurchase = {
    participantId: participant.id,
    categoryId: category.id,
    date: '2026-11-22',
    description: 'Draft validasi',
    items: [
      {
        itemName: 'Barang',
        quantity: 1,
        unit: 'pcs',
        unitPrice: 1000,
      },
    ],
  }

  for (const invalidItem of [
    { ...validPurchase.items[0], quantity: 0 },
    { ...validPurchase.items[0], quantity: -1 },
    { ...validPurchase.items[0], unitPrice: 0 },
    { ...validPurchase.items[0], unitPrice: -1 },
  ]) {
    await assert.rejects(
      savePurchase({ ...validPurchase, items: [invalidItem] }),
      /lebih dari nol/,
    )
  }

  const draft = await savePurchase(validPurchase)
  await deleteDraftPurchase(draft.id)
  assert.equal(await db.purchases.get(draft.id), undefined)
  assert.equal(
    await db.purchaseItems.where('purchaseId').equals(draft.id).count(),
    0,
  )
  assert.equal(await db.transactions.count(), 0)

  const emptyDraft = await savePurchase({ ...validPurchase, items: [] })
  await assert.rejects(markPurchasePaid(emptyDraft.id), /Tambahkan item/)
  assert.equal((await db.purchases.get(emptyDraft.id)).status, 'DRAFT')
  assert.equal(await db.transactions.count(), 0)
})
