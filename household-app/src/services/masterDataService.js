import {
  createRecord,
  listRecords,
  updateRecord,
  withDatabaseTransaction,
} from './databaseService.js'

export const DEFAULT_CATEGORIES = [
  { name: 'Salary', type: 'income' },
  { name: 'Additional Income', type: 'income' },
  { name: 'Other Income', type: 'income' },
  { name: 'Food & Beverage', type: 'expense' },
  { name: 'Transportation', type: 'expense' },
  { name: 'Household', type: 'expense' },
  { name: 'Utilities', type: 'expense' },
  { name: 'Shopping', type: 'expense' },
  { name: 'Health', type: 'expense' },
  { name: 'Education', type: 'expense' },
  { name: 'Entertainment', type: 'expense' },
  { name: 'Other Expenses', type: 'expense' },
]

function requireName(name, label) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError(`${label} wajib diisi.`)
  }

  return name.trim()
}

function normalizeCategoryName(name) {
  return name.trim().toLocaleLowerCase('id-ID')
}

export function listParticipants() {
  return listRecords('participants')
}

export async function saveParticipant({ id, name, description = '' }) {
  const participantName = requireName(name, 'Nama peserta')
  const participantDescription =
    typeof description === 'string' ? description.trim() : ''

  if (id === undefined || id === null) {
    return createRecord('participants', {
      name: participantName,
      description: participantDescription,
      isActive: true,
    })
  }

  return updateRecord('participants', id, {
    name: participantName,
    description: participantDescription,
  })
}

export async function setParticipantActive(id, isActive) {
  if (typeof isActive !== 'boolean') {
    throw new TypeError('Status peserta harus aktif atau nonaktif.')
  }

  return updateRecord('participants', id, { isActive })
}

export function listCategories() {
  return listRecords('categories')
}

export async function ensureDefaultCategories() {
  return withDatabaseTransaction(['categories'], async ({ categories }) => {
    const existing = await categories.toArray()
    const existingNames = new Set(
      existing.map(
        ({ name, type }) => `${type}:${normalizeCategoryName(name)}`,
      ),
    )
    const now = new Date().toISOString()
    const missing = DEFAULT_CATEGORIES.filter(
      ({ name, type }) =>
        !existingNames.has(`${type}:${normalizeCategoryName(name)}`),
    ).map((category) => ({
      ...category,
      isActive: true,
      createdAt: now,
    }))

    if (missing.length > 0) {
      await categories.bulkAdd(missing)
    }

    return categories.toArray()
  })
}

export async function saveCategory({ id, name, type }) {
  const categoryName = requireName(name, 'Nama kategori')
  if (type !== 'income' && type !== 'expense') {
    throw new TypeError('Jenis kategori harus pemasukan atau pengeluaran.')
  }

  return withDatabaseTransaction(['categories'], async ({ categories }) => {
    const existingCategories = await categories.toArray()
    const duplicate = existingCategories.find(
      (category) =>
        category.id !== id &&
        category.type === type &&
        normalizeCategoryName(category.name) ===
          normalizeCategoryName(categoryName),
    )

    if (duplicate) {
      throw new Error(
        `Kategori "${categoryName}" sudah tersedia untuk jenis tersebut.`,
      )
    }

    if (id === undefined || id === null) {
      return createRecord('categories', {
        name: categoryName,
        type,
        isActive: true,
      })
    }

    const existing = existingCategories.find((category) => category.id === id)
    if (!existing) {
      throw new Error(`Kategori dengan ID ${id} tidak ditemukan.`)
    }

    return updateRecord('categories', id, { name: categoryName })
  })
}

export async function setCategoryActive(id, isActive) {
  if (typeof isActive !== 'boolean') {
    throw new TypeError('Status kategori harus aktif atau nonaktif.')
  }

  return updateRecord('categories', id, { isActive })
}
