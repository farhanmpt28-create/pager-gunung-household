import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import db from '../database.js'
import {
  ensureDefaultCategories,
  listCategories,
  listParticipants,
  saveCategory,
  saveParticipant,
  setParticipantActive,
} from './masterDataService.js'

test('master data CRUD persists across IndexedDB connection reopen', async (t) => {
  t.after(() => db.close())

  const defaultCategories = await ensureDefaultCategories()
  assert.equal(defaultCategories.length, 12)
  assert.equal((await ensureDefaultCategories()).length, 12)

  const participant = await saveParticipant({
    name: 'Peserta Test',
    description: 'Peserta untuk uji persistensi',
  })
  assert.equal(participant.isActive, true)
  assert.ok(participant.id)
  assert.ok(participant.createdAt)

  assert.equal((await db.participants.get(participant.id)).name, 'Peserta Test')
  db.close()
  await db.open()
  assert.equal(
    (await listParticipants()).find(({ id }) => id === participant.id).name,
    'Peserta Test',
  )

  await saveParticipant({
    id: participant.id,
    name: 'Peserta Test Diperbarui',
    description: participant.description,
  })
  db.close()
  await db.open()
  assert.equal(
    (await db.participants.get(participant.id)).name,
    'Peserta Test Diperbarui',
  )

  await setParticipantActive(participant.id, false)
  db.close()
  await db.open()
  assert.equal((await db.participants.get(participant.id)).isActive, false)

  const income = await saveCategory({
    name: 'Test Income',
    type: 'income',
  })
  const expense = await saveCategory({
    name: 'Test Expense',
    type: 'expense',
  })
  assert.equal(income.isActive, true)
  assert.equal(expense.isActive, true)

  db.close()
  await db.open()
  const categories = await listCategories()
  assert.equal(
    categories.find(({ id }) => id === income.id).name,
    'Test Income',
  )
  assert.equal(
    categories.find(({ id }) => id === expense.id).name,
    'Test Expense',
  )

  await assert.rejects(
    saveCategory({ name: ' test income ', type: 'income' }),
    /sudah tersedia/,
  )
  assert.equal(
    (await listCategories()).filter(
      ({ type, name }) =>
        type === 'income' && name.toLocaleLowerCase('id-ID') === 'test income',
    ).length,
    1,
  )
})
