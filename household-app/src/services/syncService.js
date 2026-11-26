import Dexie from 'dexie'
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
    // -------------------------------------------------------------------------
    // PHASE 1: PUSH LOCAL RECORDS TO CLOUD (Two-Way Sync)
    // -------------------------------------------------------------------------
    const [localTxs, localCats, localParts, localPurchases, localPIs, localBudgets, localSettings] =
      await Promise.all([
        targetDb.transactions.toArray(),
        targetDb.categories.toArray(),
        targetDb.participants.toArray(),
        targetDb.purchases.toArray(),
        targetDb.purchaseItems.toArray(),
        targetDb.budgets.toArray(),
        targetDb.settings.toArray(),
      ])

    if (localCats.length > 0) {
      await supabase.from('categories').upsert(
        localCats.map((c) => ({
          id: c.id,
          household_id: householdId,
          name: c.name,
          type: c.type,
        })),
        { onConflict: 'household_id,id' }
      )
    }

    if (localParts.length > 0) {
      await supabase.from('participants').upsert(
        localParts.map((p) => ({
          id: p.id,
          household_id: householdId,
          name: p.name,
          description: p.description || '',
          is_active: Boolean(p.isActive),
        })),
        { onConflict: 'household_id,id' }
      )
    }

    if (localTxs.length > 0) {
      await supabase.from('transactions').upsert(
        localTxs.map((t) => ({
          id: t.id,
          household_id: householdId,
          type: t.type,
          category_id: t.categoryId || null,
          category_name: t.categoryName || '',
          amount: t.amount,
          date: t.date,
          period: t.period,
          source: t.source || null,
          description: t.description || '',
          purchase_id: t.purchaseId || null,
        })),
        { onConflict: 'household_id,id' }
      )
    }

    if (localPurchases.length > 0) {
      await supabase.from('purchases').upsert(
        localPurchases.map((pu) => ({
          id: pu.id,
          household_id: householdId,
          purchase_number: pu.purchaseNumber,
          date: pu.date,
          status: pu.status || 'draft',
          transaction_id: pu.transactionId || null,
          participant_ids: pu.participantIds || [],
        })),
        { onConflict: 'household_id,id' }
      )
    }

    if (localPIs.length > 0) {
      await supabase.from('purchase_items').upsert(
        localPIs.map((pi) => ({
          id: pi.id,
          purchase_id: pi.purchaseId,
          household_id: householdId,
          item_name: pi.itemName,
          quantity: pi.quantity || 1,
          price: pi.price || 0,
        })),
        { onConflict: 'household_id,id' }
      )
    }

    if (localBudgets.length > 0) {
      await supabase.from('budgets').upsert(
        localBudgets.map((b) => ({
          id: b.id,
          household_id: householdId,
          period: b.period,
        })),
        { onConflict: 'household_id,id' }
      )
    }

    if (localSettings.length > 0) {
      await supabase.from('settings').upsert(
        localSettings.map((s) => ({
          household_id: householdId,
          key: s.key,
          value: String(s.value),
        })),
        { onConflict: 'household_id,key' }
      )
    }

    // -------------------------------------------------------------------------
    // PHASE 2: PULL CLOUD RECORDS TO LOCAL
    // -------------------------------------------------------------------------
    const [
      { data: categories },
      { data: participants },
      { data: transactions },
      { data: purchases },
      { data: purchaseItems },
      { data: budgets },
      { data: settings },
    ] = await Promise.all([
      supabase.from('categories').select('*').eq('household_id', householdId),
      supabase.from('participants').select('*').eq('household_id', householdId),
      supabase.from('transactions').select('*').eq('household_id', householdId),
      supabase.from('purchases').select('*').eq('household_id', householdId),
      supabase.from('purchase_items').select('*').eq('household_id', householdId),
      supabase.from('budgets').select('*').eq('household_id', householdId),
      supabase.from('settings').select('*').eq('household_id', householdId),
    ])

    if (categories && categories.length > 0) {
      await targetDb.categories.bulkPut(
        categories.map(({ id, name, type, created_at }) => ({
          id: Number(id),
          name,
          type,
          createdAt: created_at,
        }))
      )
    }

    if (participants && participants.length > 0) {
      await targetDb.participants.bulkPut(
        participants.map(
          ({ id, name, description, is_active, created_at, updated_at }) => ({
            id: Number(id),
            name,
            description: description || '',
            isActive: Boolean(is_active),
            createdAt: created_at,
            updatedAt: updated_at,
          })
        )
      )
    }

    if (transactions && transactions.length > 0) {
      await targetDb.transactions.bulkPut(
        transactions.map(
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
      )
    }

    if (purchases && purchases.length > 0) {
      await targetDb.purchases.bulkPut(
        purchases.map(
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
      )
    }

    if (purchaseItems && purchaseItems.length > 0) {
      await targetDb.purchaseItems.bulkPut(
        purchaseItems.map(
          ({ id, purchase_id, item_name, quantity, price }) => ({
            id: Number(id),
            purchaseId: Number(purchase_id),
            itemName: item_name,
            quantity: Number(quantity) || 1,
            price: Number(price) || 0,
          })
        )
      )
    }

    if (budgets && budgets.length > 0) {
      await targetDb.budgets.bulkPut(
        budgets.map(({ id, period, created_at, updated_at }) => ({
          id: Number(id),
          period,
          createdAt: created_at,
          updatedAt: updated_at,
        }))
      )
    }

    if (settings && settings.length > 0) {
      await targetDb.settings.bulkPut(
        settings.map(({ key, value }) => ({
          key,
          value,
        }))
      )
    }
  } catch (err) {
    console.error('Error in two-way sync with Supabase:', err)
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
      await supabase.from('categories').upsert(
        {
          id: record.id,
          household_id: householdId,
          name: record.name,
          type: record.type,
        },
        { onConflict: 'household_id,id' }
      )
    } else if (tableName === 'participants') {
      await supabase.from('participants').upsert(
        {
          id: record.id,
          household_id: householdId,
          name: record.name,
          description: record.description || '',
          is_active: Boolean(record.isActive),
        },
        { onConflict: 'household_id,id' }
      )
    } else if (tableName === 'transactions') {
      await supabase.from('transactions').upsert(
        {
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
        },
        { onConflict: 'household_id,id' }
      )
    } else if (tableName === 'purchases') {
      await supabase.from('purchases').upsert(
        {
          id: record.id,
          household_id: householdId,
          purchase_number: record.purchaseNumber,
          date: record.date,
          status: record.status || 'draft',
          transaction_id: record.transactionId || null,
          participant_ids: record.participantIds || [],
        },
        { onConflict: 'household_id,id' }
      )
    } else if (tableName === 'purchaseItems') {
      await supabase.from('purchase_items').upsert(
        {
          id: record.id,
          purchase_id: record.purchaseId,
          household_id: householdId,
          item_name: record.itemName,
          quantity: record.quantity || 1,
          price: record.price || 0,
        },
        { onConflict: 'household_id,id' }
      )
    } else if (tableName === 'budgets') {
      await supabase.from('budgets').upsert(
        {
          id: record.id,
          household_id: householdId,
          period: record.period,
        },
        { onConflict: 'household_id,id' }
      )
    } else if (tableName === 'settings') {
      await supabase.from('settings').upsert(
        {
          household_id: householdId,
          key: record.key,
          value: String(record.value),
        },
        { onConflict: 'household_id,key' }
      )
    }
  } catch (err) {
    console.error(`Failed to push ${tableName} to Supabase:`, err)
  }
}

export async function migrateLocalDataToCloud(householdId) {
  if (!isSupabaseConfigured || !supabase || !householdId) {
    throw new Error('Supabase belum aktif atau household belum dipilih.')
  }

  // Find all possible local Dexie databases in the browser to collect data from
  const candidateDbs = [
    getDatabaseForHousehold('default'),
    getDatabaseForHousehold(householdId),
  ]

  try {
    if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
      const dbs = await indexedDB.databases()
      for (const d of dbs) {
        if (d.name && d.name.includes('household-expense-management')) {
          candidateDbs.push(new Dexie(d.name))
        }
      }
    }
  } catch {
    // Ignore if indexedDB.databases is not supported
  }

  const allTxs = new Map()
  const allCats = new Map()
  const allParts = new Map()
  const allPurchases = new Map()
  const allPIs = new Map()
  const allBudgets = new Map()
  const allSettings = new Map()

  for (const cDb of candidateDbs) {
    try {
      if (cDb.isOpen && !cDb.isOpen()) {
        await cDb.open().catch(() => {})
      }
      if (cDb.table) {
        const [txs, cats, parts, pur, pis, bgts, stgs] = await Promise.all([
          cDb.table('transactions').toArray().catch(() => []),
          cDb.table('categories').toArray().catch(() => []),
          cDb.table('participants').toArray().catch(() => []),
          cDb.table('purchases').toArray().catch(() => []),
          cDb.table('purchaseItems').toArray().catch(() => []),
          cDb.table('budgets').toArray().catch(() => []),
          cDb.table('settings').toArray().catch(() => []),
        ])

        txs.forEach((t) => allTxs.set(t.id, t))
        cats.forEach((c) => allCats.set(c.id, c))
        parts.forEach((p) => allParts.set(p.id, p))
        pur.forEach((pu) => allPurchases.set(pu.id, pu))
        pis.forEach((pi) => allPIs.set(pi.id, pi))
        bgts.forEach((b) => allBudgets.set(b.id, b))
        stgs.forEach((s) => allSettings.set(s.key, s))
      }
    } catch {
      // Ignore individual candidate errors
    }
  }

  const categories = [...allCats.values()]
  const participants = [...allParts.values()]
  const transactions = [...allTxs.values()]
  const purchases = [...allPurchases.values()]
  const purchaseItems = [...allPIs.values()]
  const budgets = [...allBudgets.values()]
  const settings = [...allSettings.values()]

  // 2. Push to Supabase with target householdId and onConflict parameters
  if (categories.length > 0) {
    await supabase.from('categories').upsert(
      categories.map((item) => ({
        id: item.id,
        household_id: householdId,
        name: item.name,
        type: item.type,
      })),
      { onConflict: 'household_id,id' }
    )
  }

  if (participants.length > 0) {
    await supabase.from('participants').upsert(
      participants.map((item) => ({
        id: item.id,
        household_id: householdId,
        name: item.name,
        description: item.description || '',
        is_active: Boolean(item.isActive),
      })),
      { onConflict: 'household_id,id' }
    )
  }

  if (transactions.length > 0) {
    await supabase.from('transactions').upsert(
      transactions.map((item) => ({
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
      })),
      { onConflict: 'household_id,id' }
    )
  }

  if (purchases.length > 0) {
    await supabase.from('purchases').upsert(
      purchases.map((item) => ({
        id: item.id,
        household_id: householdId,
        purchase_number: item.purchaseNumber,
        date: item.date,
        status: item.status || 'draft',
        transaction_id: item.transactionId || null,
        participant_ids: item.participantIds || [],
      })),
      { onConflict: 'household_id,id' }
    )
  }

  if (purchaseItems.length > 0) {
    await supabase.from('purchase_items').upsert(
      purchaseItems.map((item) => ({
        id: item.id,
        purchase_id: item.purchaseId,
        household_id: householdId,
        item_name: item.itemName,
        quantity: item.quantity || 1,
        price: item.price || 0,
      })),
      { onConflict: 'household_id,id' }
    )
  }

  if (budgets.length > 0) {
    await supabase.from('budgets').upsert(
      budgets.map((item) => ({
        id: item.id,
        household_id: householdId,
        period: item.period,
      })),
      { onConflict: 'household_id,id' }
    )
  }

  if (settings.length > 0) {
    await supabase.from('settings').upsert(
      settings.map((item) => ({
        household_id: householdId,
        key: item.key,
        value: String(item.value),
      })),
      { onConflict: 'household_id,key' }
    )
  }

  // 3. Pull latest down into active household DB
  await syncHouseholdFromCloud(householdId)

  return {
    transactionsCount: transactions.length,
    categoriesCount: categories.length,
    participantsCount: participants.length,
  }
}
