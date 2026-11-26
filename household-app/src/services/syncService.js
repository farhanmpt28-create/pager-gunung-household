import supabase, { isSupabaseConfigured } from '../supabaseClient.js'
import db, { getActiveHouseholdId, getDatabaseForHousehold, TABLE_NAMES } from '../database.js'

let isSyncing = false

export async function syncHouseholdFromCloud(householdId) {
  if (!isSupabaseConfigured || !supabase || !householdId || isSyncing) {
    return
  }

  isSyncing = true
  const targetDb = getDatabaseForHousehold(householdId)

  try {
    // 1. Fetch categories
    const { data: categories, error: catErr } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', householdId)

    if (!catErr && categories) {
      const cleanCats = categories.map(({ id, name, type, created_at }) => ({
        id: Number(id),
        name,
        type,
        createdAt: created_at,
      }))
      await targetDb.categories.bulkPut(cleanCats)
    }

    // 2. Fetch participants
    const { data: participants, error: partErr } = await supabase
      .from('participants')
      .select('*')
      .eq('household_id', householdId)

    if (!partErr && participants) {
      const cleanParts = participants.map(
        ({ id, name, description, is_active, created_at, updated_at }) => ({
          id: Number(id),
          name,
          description: description || '',
          isActive: Boolean(is_active),
          createdAt: created_at,
          updatedAt: updated_at,
        })
      )
      await targetDb.participants.bulkPut(cleanParts)
    }

    // 3. Fetch transactions
    const { data: transactions, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('household_id', householdId)

    if (!txErr && transactions) {
      const cleanTxs = transactions.map(
        ({
          id,
          type,
          category_id,
          category_name,
          amount,
          date,
          period,
          source,
          description,
          purchase_id,
          created_at,
          updated_at,
        }) => ({
          id: Number(id),
          type,
          categoryId: category_id ? Number(category_id) : null,
          categoryName: category_name || '',
          amount: Number(amount) || 0,
          date,
          period,
          source,
          description: description || '',
          purchaseId: purchase_id ? Number(purchase_id) : null,
          createdAt: created_at,
          updatedAt: updated_at,
        })
      )
      await targetDb.transactions.bulkPut(cleanTxs)
    }

    // 4. Fetch purchases
    const { data: purchases, error: purErr } = await supabase
      .from('purchases')
      .select('*')
      .eq('household_id', householdId)

    if (!purErr && purchases) {
      const cleanPurchases = purchases.map(
        ({
          id,
          purchase_number,
          date,
          status,
          transaction_id,
          participant_ids,
          created_at,
          updated_at,
        }) => ({
          id: Number(id),
          purchaseNumber: purchase_number,
          date,
          status: status || 'draft',
          transactionId: transaction_id ? Number(transaction_id) : null,
          participantIds: Array.isArray(participant_ids) ? participant_ids : [],
          createdAt: created_at,
          updatedAt: updated_at,
        })
      )
      await targetDb.purchases.bulkPut(cleanPurchases)
    }

    // 5. Fetch purchase items
    const { data: purchaseItems, error: piErr } = await supabase
      .from('purchase_items')
      .select('*')
      .eq('household_id', householdId)

    if (!piErr && purchaseItems) {
      const cleanPIs = purchaseItems.map(
        ({ id, purchase_id, item_name, quantity, price }) => ({
          id: Number(id),
          purchaseId: Number(purchase_id),
          itemName: item_name,
          quantity: Number(quantity) || 1,
          price: Number(price) || 0,
        })
      )
      await targetDb.purchaseItems.bulkPut(cleanPIs)
    }

    // 6. Fetch budgets
    const { data: budgets, error: budErr } = await supabase
      .from('budgets')
      .select('*')
      .eq('household_id', householdId)

    if (!budErr && budgets) {
      const cleanBudgets = budgets.map(({ id, period, created_at, updated_at }) => ({
        id: Number(id),
        period,
        createdAt: created_at,
        updatedAt: updated_at,
      }))
      await targetDb.budgets.bulkPut(cleanBudgets)
    }

    // 7. Fetch settings
    const { data: settings, error: setErr } = await supabase
      .from('settings')
      .select('*')
      .eq('household_id', householdId)

    if (!setErr && settings) {
      const cleanSettings = settings.map(({ key, value }) => ({
        key,
        value,
      }))
      await targetDb.settings.bulkPut(cleanSettings)
    }
  } catch (err) {
    console.error('Error syncing from Supabase:', err)
  } finally {
    isSyncing = false
  }
}

export async function pushRecordToCloud(tableName, record, action = 'upsert') {
  const householdId = getActiveHouseholdId()
  if (!isSupabaseConfigured || !supabase || !householdId) {
    return
  }

  try {
    if (action === 'delete') {
      if (tableName === 'settings') {
        await supabase
          .from('settings')
          .delete()
          .match({ household_id: householdId, key: record.key || record })
      } else {
        const id = typeof record === 'object' ? record.id : record
        await supabase
          .from(tableName === 'purchaseItems' ? 'purchase_items' : tableName)
          .delete()
          .match({ household_id: householdId, id: Number(id) })
      }
      return
    }

    // Prepare payload
    if (tableName === 'categories') {
      await supabase.from('categories').upsert({
        id: record.id,
        household_id: householdId,
        name: record.name,
        type: record.type,
      })
    } else if (tableName === 'participants') {
      await supabase.from('participants').upsert({
        id: record.id,
        household_id: householdId,
        name: record.name,
        description: record.description || '',
        is_active: Boolean(record.isActive),
      })
    } else if (tableName === 'transactions') {
      await supabase.from('transactions').upsert({
        id: record.id,
        household_id: householdId,
        type: record.type,
        category_id: record.categoryId || null,
        category_name: record.categoryName || '',
        amount: record.amount,
        date: record.date,
        period: record.period,
        source: record.source || null,
        description: record.description || '',
        purchase_id: record.purchaseId || null,
      })
    } else if (tableName === 'purchases') {
      await supabase.from('purchases').upsert({
        id: record.id,
        household_id: householdId,
        purchase_number: record.purchaseNumber,
        date: record.date,
        status: record.status || 'draft',
        transaction_id: record.transactionId || null,
        participant_ids: record.participantIds || [],
      })
    } else if (tableName === 'purchaseItems') {
      await supabase.from('purchase_items').upsert({
        id: record.id,
        purchase_id: record.purchaseId,
        household_id: householdId,
        item_name: record.itemName,
        quantity: record.quantity || 1,
        price: record.price || 0,
      })
    } else if (tableName === 'budgets') {
      await supabase.from('budgets').upsert({
        id: record.id,
        household_id: householdId,
        period: record.period,
      })
    } else if (tableName === 'settings') {
      await supabase.from('settings').upsert({
        household_id: householdId,
        key: record.key,
        value: String(record.value),
      })
    }
  } catch (err) {
    console.error(`Failed to push ${tableName} to Supabase:`, err)
  }
}

export async function migrateLocalDataToCloud(householdId) {
  if (!isSupabaseConfigured || !supabase || !householdId) {
    throw new Error('Supabase belum aktif atau household belum dipilih.')
  }

  // 1. Get default local DB
  const localDefaultDb = getDatabaseForHousehold('default')
  const [categories, participants, transactions, purchases, purchaseItems, budgets, settings] =
    await Promise.all([
      localDefaultDb.categories.toArray(),
      localDefaultDb.participants.toArray(),
      localDefaultDb.transactions.toArray(),
      localDefaultDb.purchases.toArray(),
      localDefaultDb.purchaseItems.toArray(),
      localDefaultDb.budgets.toArray(),
      localDefaultDb.settings.toArray(),
    ])

  // 2. Push to Supabase with target householdId
  for (const item of categories) {
    await supabase.from('categories').upsert({
      id: item.id,
      household_id: householdId,
      name: item.name,
      type: item.type,
    })
  }

  for (const item of participants) {
    await supabase.from('participants').upsert({
      id: item.id,
      household_id: householdId,
      name: item.name,
      description: item.description || '',
      is_active: Boolean(item.isActive),
    })
  }

  for (const item of transactions) {
    await supabase.from('transactions').upsert({
      id: item.id,
      household_id: householdId,
      type: item.type,
      category_id: item.categoryId || null,
      category_name: item.categoryName || '',
      amount: item.amount,
      date: item.date,
      period: item.period,
      source: item.source || null,
      description: item.description || '',
      purchase_id: item.purchaseId || null,
    })
  }

  for (const item of purchases) {
    await supabase.from('purchases').upsert({
      id: item.id,
      household_id: householdId,
      purchase_number: item.purchaseNumber,
      date: item.date,
      status: item.status || 'draft',
      transaction_id: item.transactionId || null,
      participant_ids: item.participantIds || [],
    })
  }

  for (const item of purchaseItems) {
    await supabase.from('purchase_items').upsert({
      id: item.id,
      purchase_id: item.purchaseId,
      household_id: householdId,
      item_name: item.itemName,
      quantity: item.quantity || 1,
      price: item.price || 0,
    })
  }

  for (const item of budgets) {
    await supabase.from('budgets').upsert({
      id: item.id,
      household_id: householdId,
      period: item.period,
    })
  }

  for (const item of settings) {
    await supabase.from('settings').upsert({
      household_id: householdId,
      key: item.key,
      value: String(item.value),
    })
  }

  // 3. Sync to active DB
  await syncHouseholdFromCloud(householdId)

  return {
    transactionsCount: transactions.length,
    categoriesCount: categories.length,
    participantsCount: participants.length,
  }
}
