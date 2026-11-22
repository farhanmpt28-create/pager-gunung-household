import { withDatabaseTransaction } from './databaseService.js'

export const PURCHASE_STATUSES = ['DRAFT', 'PAID', 'CANCELLED']

function isPaidStatus(status) {
  return status === 'PAID' || status === 'completed'
}

function validateDate(date) {
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00.000Z`)) ||
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
  ) {
    throw new TypeError('Tanggal pembelian wajib diisi dengan tanggal yang valid.')
  }
}

function validateItems(items) {
  if (!Array.isArray(items)) {
    throw new TypeError('Daftar item pembelian tidak valid.')
  }

  const normalizedItems = items.map((item, index) => {
    const itemName = typeof item.itemName === 'string' ? item.itemName.trim() : ''
    const unit = typeof item.unit === 'string' ? item.unit.trim() : ''
    const quantity = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)

    if (!itemName) {
      throw new TypeError(`Nama barang pada item ${index + 1} wajib diisi.`)
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new TypeError(`Kuantitas pada item ${index + 1} harus lebih dari nol.`)
    }
    if (!unit) {
      throw new TypeError(`Satuan pada item ${index + 1} wajib diisi.`)
    }
    if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0) {
      throw new TypeError(
        `Harga satuan pada item ${index + 1} harus berupa Rupiah bulat lebih dari nol.`,
      )
    }

    const subtotal = quantity * unitPrice
    if (!Number.isSafeInteger(subtotal)) {
      throw new TypeError(`Subtotal pada item ${index + 1} tidak valid.`)
    }

    return { itemName, quantity, unit, unitPrice, subtotal }
  })

  const totalAmount = normalizedItems.reduce(
    (total, item) => total + item.subtotal,
    0,
  )
  if (!Number.isSafeInteger(totalAmount)) {
    throw new TypeError('Total pembelian melebihi batas nominal yang didukung.')
  }

  return { items: normalizedItems, totalAmount }
}

function validatePurchaseInput(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Data pembelian tidak valid.')
  }
  validateDate(input.date)

  if (!Number.isSafeInteger(Number(input.participantId)) || Number(input.participantId) <= 0) {
    throw new TypeError('Peserta pembelian wajib dipilih.')
  }
  if (!Number.isSafeInteger(Number(input.categoryId)) || Number(input.categoryId) <= 0) {
    throw new TypeError('Kategori pengeluaran wajib dipilih.')
  }
  if (typeof input.description !== 'string' || input.description.trim() === '') {
    throw new TypeError('Keterangan pembelian wajib diisi.')
  }
  if (input.notes !== undefined && typeof input.notes !== 'string') {
    throw new TypeError('Catatan pembelian harus berupa teks.')
  }

  const { items, totalAmount } = validateItems(input.items)
  return {
    date: input.date,
    participantId: Number(input.participantId),
    categoryId: Number(input.categoryId),
    description: input.description.trim(),
    notes: input.notes?.trim() ?? '',
    items,
    totalAmount,
  }
}

async function findPurchaseTransaction(purchase, transactions) {
  const linked = await transactions.where('purchaseId').equals(purchase.id).toArray()
  if (linked.length > 1) {
    throw new Error('Pembelian memiliki lebih dari satu transaksi terkait.')
  }

  const referenced = purchase.transactionId
    ? await transactions.get(purchase.transactionId)
    : undefined
  if (referenced && linked.length && referenced.id !== linked[0].id) {
    throw new Error('Tautan transaksi pembelian tidak konsisten.')
  }

  const transaction = linked[0] ?? referenced
  if (transaction && transaction.purchaseId != null && transaction.purchaseId !== purchase.id) {
    throw new Error('Transaksi tertaut ke pembelian lain.')
  }

  return transaction
}

async function synchronizePurchaseTransaction(
  purchase,
  transaction,
  transactions,
  settings,
) {
  const now = new Date().toISOString()
  const period = purchase.date.slice(0, 7)
  await settings.put({ key: `period:${period}`, value: period })
  const transactionData = {
    type: 'expense',
    source: 'purchase',
    purchaseId: purchase.id,
    amount: purchase.totalAmount,
    categoryId: purchase.categoryId,
    date: purchase.date,
    period,
    description: purchase.description,
    paymentMethod: transaction?.paymentMethod ?? 'other',
    notes: purchase.notes,
    updatedAt: now,
  }

  if (transaction) {
    await transactions.update(transaction.id, transactionData)
    return transaction.id
  }

  return transactions.add({ ...transactionData, createdAt: now })
}

async function validateReferences(data, { participants, categories }, existing) {
  const participant = await participants.get(data.participantId)
  if (!participant) {
    throw new Error('Peserta pembelian tidak ditemukan.')
  }
  if (
    participant.isActive === false &&
    existing?.participantId !== participant.id
  ) {
    throw new Error('Peserta nonaktif tidak dapat digunakan untuk pembelian baru.')
  }

  const category = await categories.get(data.categoryId)
  if (!category || category.type !== 'expense') {
    throw new Error('Kategori pengeluaran tidak ditemukan atau tidak valid.')
  }
  if (
    category.isActive === false &&
    existing?.categoryId !== category.id
  ) {
    throw new Error('Kategori nonaktif tidak dapat digunakan untuk pembelian baru.')
  }
}

export function listPurchases() {
  return withDatabaseTransaction(
    ['purchases', 'purchaseItems'],
    async ({ purchases, purchaseItems }) => {
      const records = await purchases.toArray()
      return Promise.all(
        records.map(async (purchase) => ({
          ...purchase,
          items: await purchaseItems
            .where('purchaseId')
            .equals(purchase.id)
            .toArray(),
        })),
      )
    },
    'r',
  )
}

export async function savePurchase(input) {
  const data = validatePurchaseInput(input)
  const existingId = input.id

  return withDatabaseTransaction(
    [
      'purchases',
      'purchaseItems',
      'transactions',
      'participants',
      'categories',
      'settings',
    ],
    async ({
      purchases,
      purchaseItems,
      transactions,
      participants,
      categories,
      settings,
    }) => {
      const existing =
        existingId === undefined || existingId === null
          ? undefined
          : await purchases.get(existingId)
      if (existingId != null && !existing) {
        throw new Error(`Pembelian dengan ID ${existingId} tidak ditemukan.`)
      }
      if (existing?.status === 'CANCELLED') {
        throw new Error('Pembelian yang dibatalkan tidak dapat diubah.')
      }

      await validateReferences(data, { participants, categories }, existing)
      if (isPaidStatus(existing?.status) && data.totalAmount <= 0) {
        throw new Error('Pembelian berstatus PAID harus memiliki total lebih dari nol.')
      }

      const now = new Date().toISOString()
      const purchaseData = {
        date: data.date,
        participantId: data.participantId,
        participantIds: [data.participantId],
        categoryId: data.categoryId,
        description: data.description,
        notes: data.notes,
        totalAmount: data.totalAmount,
        status: isPaidStatus(existing?.status) ? 'PAID' : 'DRAFT',
        transactionId: existing?.transactionId ?? null,
        updatedAt: now,
      }
      let purchaseId = existing?.id

      if (existing) {
        await purchases.update(purchaseId, purchaseData)
      } else {
        purchaseId = await purchases.add({
          ...purchaseData,
          createdAt: now,
        })
        await purchases.update(purchaseId, {
          purchaseNumber: `PUR-${purchaseId}`,
        })
      }

      await purchaseItems.where('purchaseId').equals(purchaseId).delete()
      if (data.items.length > 0) {
        await purchaseItems.bulkAdd(
          data.items.map((item) => ({ ...item, purchaseId })),
        )
      }

      if (isPaidStatus(existing?.status)) {
        const updatedPurchase = { ...purchaseData, id: purchaseId }
        const linkedTransaction = await findPurchaseTransaction(
          { ...existing, id: purchaseId },
          transactions,
        )
        const transactionId = await synchronizePurchaseTransaction(
          updatedPurchase,
          linkedTransaction,
          transactions,
          settings,
        )
        await purchases.update(purchaseId, { transactionId })
      }

      return {
        ...(await purchases.get(purchaseId)),
        items: await purchaseItems.where('purchaseId').equals(purchaseId).toArray(),
      }
    },
  )
}

export async function markPurchasePaid(id) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new TypeError('ID pembelian tidak valid.')
  }

  return withDatabaseTransaction(
    [
      'purchases',
      'purchaseItems',
      'transactions',
      'participants',
      'categories',
      'settings',
    ],
    async ({
      purchases,
      purchaseItems,
      transactions,
      participants,
      categories,
      settings,
    }) => {
      const purchase = await purchases.get(id)
      if (!purchase) {
        throw new Error(`Pembelian dengan ID ${id} tidak ditemukan.`)
      }
      if (purchase.status === 'CANCELLED') {
        throw new Error('Pembelian yang dibatalkan tidak dapat dibayar.')
      }

      const items = await purchaseItems.where('purchaseId').equals(id).toArray()
      const totalAmount = items.reduce((total, item) => total + item.subtotal, 0)
      if (!items.length || !Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
        throw new Error('Tambahkan item dengan total valid sebelum membayar pembelian.')
      }
      const participant = await participants.get(purchase.participantId)
      const category = await categories.get(purchase.categoryId)
      if (!participant || !category || category.type !== 'expense') {
        throw new Error('Peserta atau kategori pembelian tidak valid.')
      }

      const updatedPurchase = {
        ...purchase,
        status: 'PAID',
        totalAmount,
        updatedAt: new Date().toISOString(),
      }
      const linkedTransaction = await findPurchaseTransaction(
        purchase,
        transactions,
      )
      const transactionId = await synchronizePurchaseTransaction(
        updatedPurchase,
        linkedTransaction,
        transactions,
        settings,
      )
      await purchases.update(id, {
        status: 'PAID',
        totalAmount,
        transactionId,
        updatedAt: updatedPurchase.updatedAt,
      })

      return {
        ...(await purchases.get(id)),
        items,
      }
    },
  )
}

export async function cancelPurchase(id) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new TypeError('ID pembelian tidak valid.')
  }

  return withDatabaseTransaction(
    ['purchases', 'transactions'],
    async ({ purchases, transactions }) => {
      const purchase = await purchases.get(id)
      if (!purchase) {
        throw new Error(`Pembelian dengan ID ${id} tidak ditemukan.`)
      }
      if (purchase.status === 'CANCELLED') {
        return purchase
      }

      if (isPaidStatus(purchase.status)) {
        const linkedTransaction = await findPurchaseTransaction(
          purchase,
          transactions,
        )
        if (linkedTransaction) {
          await transactions.delete(linkedTransaction.id)
        }
      }

      await purchases.update(id, {
        status: 'CANCELLED',
        transactionId: null,
        updatedAt: new Date().toISOString(),
      })
      return purchases.get(id)
    },
  )
}

export async function deleteDraftPurchase(id) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new TypeError('ID pembelian tidak valid.')
  }

  return withDatabaseTransaction(
    ['purchases', 'purchaseItems', 'transactions'],
    async ({ purchases, purchaseItems, transactions }) => {
      const purchase = await purchases.get(id)
      if (!purchase) {
        throw new Error(`Pembelian dengan ID ${id} tidak ditemukan.`)
      }
      if (isPaidStatus(purchase.status) || purchase.status === 'CANCELLED') {
        throw new Error('Pembelian selain DRAFT tidak dapat dihapus langsung.')
      }
      const linkedTransaction = await findPurchaseTransaction(
        purchase,
        transactions,
      )
      if (linkedTransaction) {
        throw new Error('Draft dengan transaksi terkait tidak dapat dihapus.')
      }

      await purchaseItems.where('purchaseId').equals(id).delete()
      await purchases.delete(id)
      return purchase
    },
  )
}
