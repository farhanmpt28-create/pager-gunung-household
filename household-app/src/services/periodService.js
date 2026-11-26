import { liveQuery } from 'dexie'
import db from '../database.js'
import { pushRecordToCloud } from './syncService.js'

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/
const PERIOD_SETTING_PREFIX = 'period:'

export function isValidPeriod(period) {
  return typeof period === 'string' && PERIOD_PATTERN.test(period)
}

export function getCurrentPeriod(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function getTransactionPeriod(transaction) {
  if (isValidPeriod(transaction?.period)) return transaction.period

  if (
    typeof transaction?.date === 'string' &&
    /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(transaction.date)
  ) {
    return transaction.date.slice(0, 7)
  }

  return ''
}

export function formatPeriodLabel(period) {
  if (!isValidPeriod(period)) return 'Periode tidak diketahui'

  const [year, month] = period.split('-').map(Number)
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1))
}

export function listPeriodOptions(periods = []) {
  return [...new Set(periods.filter(isValidPeriod))]
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: formatPeriodLabel(value) }))
}

function getPeriodSettingKey(period) {
  return `${PERIOD_SETTING_PREFIX}${period}`
}

function getPeriodsFromSettings(settings) {
  return [...new Set(
    settings
      .filter(
        ({ key, value }) =>
          typeof key === 'string' &&
          key.startsWith(PERIOD_SETTING_PREFIX) &&
          isValidPeriod(value) &&
          key === getPeriodSettingKey(value),
      )
      .map(({ value }) => value),
  )].sort((a, b) => b.localeCompare(a))
}

export async function listPeriods() {
  const settings = await db.settings.toArray()
  return getPeriodsFromSettings(settings)
}

export async function addPeriod(period) {
  if (!isValidPeriod(period)) {
    throw new TypeError('Periode harus menggunakan format YYYY-MM.')
  }

  return db.transaction('rw', db.settings, async () => {
    const key = getPeriodSettingKey(period)
    if (await db.settings.get(key)) {
      throw new Error(`${formatPeriodLabel(period)} sudah tersedia.`)
    }

    await db.settings.add({ key, value: period })
    pushRecordToCloud('settings', { key, value: period }, 'upsert').catch(console.error)
    return period
  })
}

export async function deletePeriod(period) {
  if (!isValidPeriod(period)) {
    throw new TypeError('Periode harus menggunakan format YYYY-MM.')
  }

  return db.transaction(
    'rw',
    db.settings,
    db.transactions,
    async () => {
      const key = getPeriodSettingKey(period)
      const setting = await db.settings.get(key)
      if (!setting) {
        throw new Error(`${formatPeriodLabel(period)} tidak ditemukan.`)
      }

      const transactions = await db.transactions.toArray()
      const transactionCount = transactions.filter(
        (transaction) => getTransactionPeriod(transaction) === period,
      ).length
      if (transactionCount > 0) {
        throw new Error(
          `Periode ${formatPeriodLabel(period)} memiliki ${transactionCount} transaksi dan tidak dapat dihapus.`,
        )
      }

      await db.settings.delete(key)
      pushRecordToCloud('settings', { key }, 'delete').catch(console.error)
      return period
    },
  )
}

export function subscribePeriods(onNext, onError) {
  return liveQuery(() => listPeriods()).subscribe({
    next: onNext,
    error: onError,
  })
}

export function subscribePeriodData(onNext, onError) {
  return liveQuery(async () => {
    const [settings, transactions] = await Promise.all([
      db.settings.toArray(),
      db.transactions.toArray(),
    ])
    const counts = new Map()
    for (const transaction of transactions) {
      const period = getTransactionPeriod(transaction)
      if (period) counts.set(period, (counts.get(period) ?? 0) + 1)
    }

    return getPeriodsFromSettings(settings).map((period) => ({
      value: period,
      label: formatPeriodLabel(period),
      transactionCount: counts.get(period) ?? 0,
    }))
  }).subscribe({ next: onNext, error: onError })
}
