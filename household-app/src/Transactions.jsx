import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react'
import Modal from './components/Modal.jsx'
import {
  deleteManualTransaction,
  saveManualTransaction,
  saveManualTransactions,
  subscribeTransactionData,
} from './services/transactionService.js'
import {
  formatPeriodLabel,
  getTransactionPeriod,
  listPeriodOptions,
} from './services/periodService.js'

const EMPTY_FORM = {
  type: 'expense',
  period: '',
  amount: '',
  categoryName: '',
  description: '',
}

const EMPTY_BULK_ROW = {
  description: '',
  categoryName: '',
  income: '',
  expense: '',
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Terjadi kesalahan.'
}

function Transactions({ onNavigateSettings }) {
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [periods, setPeriods] = useState([])
  const [periodFilter, setPeriodFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [bulkRows, setBulkRows] = useState([{ ...EMPTY_BULK_ROW }])
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkSuccess, setBulkSuccess] = useState('')

  useEffect(() => {
    const subscription = subscribeTransactionData(
      (data) => {
        setTransactions(data.transactions)
        setCategories(data.categories)
        setPeriods(data.periods)
        setLoadError('')
        setLoading(false)
      },
      (error) => {
        setLoadError(getErrorMessage(error))
        setLoading(false)
      },
    )
    return () => subscription.unsubscribe()
  }, [subscriptionAttempt])

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )
  const periodOptions = useMemo(
    () => listPeriodOptions(periods),
    [periods],
  )
  const selectedPeriodFilter = periodOptions.some(
    ({ value }) => value === periodFilter,
  )
    ? periodFilter
    : periodOptions[0]?.value ?? ''
  const visibleTransactions = useMemo(() => {
    const filtered = transactions.filter(
      (transaction) =>
        getTransactionPeriod(transaction) === selectedPeriodFilter,
    )

    const chronological = [...filtered].sort(
      (a, b) =>
        (a.createdAt ?? '').localeCompare(b.createdAt ?? '') ||
        (a.id ?? 0) - (b.id ?? 0),
    )

    let currentBalance = 0
    const countedPurchases = new Set()
    const withRunning = chronological.map((tx) => {
      if (tx.type === 'income') {
        currentBalance += tx.amount
      } else {
        if (tx.purchaseId != null) {
          if (!countedPurchases.has(tx.purchaseId)) {
            countedPurchases.add(tx.purchaseId)
            currentBalance -= tx.amount
          }
        } else {
          currentBalance -= tx.amount
        }
      }
      return {
        ...tx,
        runningBalance: currentBalance,
      }
    })

    return withRunning.reverse()
  }, [selectedPeriodFilter, transactions])

  function openEditModal(transaction) {
    setEditingTransaction(transaction)
    setActionError('')
    setForm({
      type: transaction.type,
      period:
        getTransactionPeriod(transaction) ||
        selectedPeriodFilter,
      amount: String(transaction.amount),
      categoryName:
        transaction.categoryName ??
        categoriesById.get(transaction.categoryId) ??
        '',
      description: transaction.description ?? '',
    })
    setModalOpen(true)
  }

  function updateBulkRow(index, field, value) {
    setBulkSuccess('')
    setBulkRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    )
  }

  function addBulkRow() {
    setBulkSuccess('')
    setBulkRows((current) => [...current, { ...EMPTY_BULK_ROW }])
  }

  function removeBulkRow(index) {
    setBulkSuccess('')
    setBulkRows((current) =>
      current.length === 1
        ? [{ ...EMPTY_BULK_ROW }]
        : current.filter((_, rowIndex) => rowIndex !== index),
    )
  }

  const bulkTotals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const row of bulkRows) {
      const incomeAmount = Number(row.income)
      const expenseAmount = Number(row.expense)
      const hasIncome = row.income.trim() !== ''
      const hasExpense = row.expense.trim() !== ''
      if (hasIncome && hasExpense) continue
      if (
        /^\d+$/.test(row.income.trim()) &&
        Number.isSafeInteger(incomeAmount)
      ) income += incomeAmount
      if (
        /^\d+$/.test(row.expense.trim()) &&
        Number.isSafeInteger(expenseAmount)
      ) expense += expenseAmount
    }
    return { income, expense, balance: income - expense }
  }, [bulkRows])

  async function handleBulkSubmit(event) {
    event.preventDefault()
    setActionError('')
    setBulkSuccess('')

    if (!selectedPeriodFilter) {
      setActionError('Pilih periode sebelum menyimpan transaksi.')
      return
    }

    setBulkSaving(true)
    try {
      const saved = await saveManualTransactions(
        bulkRows.map((row) => ({
          ...row,
          period: selectedPeriodFilter,
        })),
      )
      setBulkRows([{ ...EMPTY_BULK_ROW }])
      setBulkSuccess(
        saved.length
          ? `${saved.length} transaksi berhasil disimpan.`
          : 'Tidak ada baris transaksi yang diisi.',
      )
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setBulkSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setActionError('')
    setSaving(true)

    try {
      await saveManualTransaction({
        ...form,
        id: editingTransaction?.id,
        amount: Number(form.amount),
      })
      setModalOpen(false)
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(transaction) {
    if (
      !window.confirm(
        `Hapus transaksi "${transaction.description}" sebesar ${formatCurrency(transaction.amount)}?`,
      )
    ) {
      return
    }

    setActionError('')
    setDeletingId(transaction.id)
    try {
      await deleteManualTransaction(transaction.id)
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="master-page transactions-page">
      <div className="page-toolbar">
        <div>
          <h2>Transaksi</h2>
          <p>Catat uang masuk dan uang keluar rumah tangga.</p>
        </div>
      </div>

      <div className="transaction-history-toolbar">
        <label className="transaction-filter">
          <span>Bulan dan tahun</span>
          <select
            disabled={bulkSaving}
            onChange={(event) => setPeriodFilter(event.target.value)}
            value={selectedPeriodFilter}
          >
            {!periodOptions.length && (
              <option value="">Belum ada periode tersedia</option>
            )}
            {periodOptions.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <section aria-label="Input transaksi massal" className="bulk-transaction-card">
        <div className="bulk-transaction-header">
          <div>
            <h3>Catat Transaksi</h3>
            <p>
              {selectedPeriodFilter
                ? `Periode ${formatPeriodLabel(selectedPeriodFilter)}`
                : 'Pilih bulan dan tahun terlebih dahulu'}
            </p>
          </div>
        </div>

        {bulkSuccess && (
          <p className="bulk-success" role="status">{bulkSuccess}</p>
        )}

        {actionError && !modalOpen && (
          <p className="inline-error" role="alert">{actionError}</p>
        )}

        <form onSubmit={handleBulkSubmit}>
          <div className="bulk-table-wrap">
            <table className="bulk-transaction-table">
              <thead>
                <tr>
                  <th>Nomor</th>
                  <th>Keterangan</th>
                  <th>Kategori</th>
                  <th>Pemasukan</th>
                  <th>Pengeluaran</th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((row, index) => (
                  <tr key={index}>
                    <td className="bulk-row-number">
                      <span>{index + 1}</span>
                      <button
                        aria-label={`Hapus baris ${index + 1}`}
                        className="icon-button bulk-remove-row"
                        disabled={bulkSaving}
                        onClick={() => removeBulkRow(index)}
                        title="Hapus baris"
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={15} />
                      </button>
                    </td>
                    <td>
                      <input
                        aria-label={`Keterangan baris ${index + 1}`}
                        disabled={bulkSaving}
                        maxLength={200}
                        onChange={(event) =>
                          updateBulkRow(index, 'description', event.target.value)
                        }
                        placeholder="Contoh: Belanja dapur"
                        value={row.description}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Kategori baris ${index + 1}`}
                        disabled={bulkSaving}
                        maxLength={100}
                        onChange={(event) =>
                          updateBulkRow(index, 'categoryName', event.target.value)
                        }
                        placeholder="Untuk pengeluaran"
                        value={row.categoryName}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Pemasukan baris ${index + 1}`}
                        disabled={bulkSaving}
                        inputMode="numeric"
                        onChange={(event) =>
                          updateBulkRow(index, 'income', event.target.value)
                        }
                        placeholder="0"
                        type="text"
                        value={row.income}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Pengeluaran baris ${index + 1}`}
                        disabled={bulkSaving}
                        inputMode="numeric"
                        onChange={(event) =>
                          updateBulkRow(index, 'expense', event.target.value)
                        }
                        placeholder="0"
                        type="text"
                        value={row.expense}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bulk-transaction-actions">
            <button
              className="secondary-button"
              disabled={bulkSaving || !periodOptions.length}
              onClick={addBulkRow}
              type="button"
            >
              <Plus aria-hidden="true" size={17} />
              Tambah Baris
            </button>
            <button
              className="primary-button"
              disabled={
                bulkSaving ||
                !periodOptions.length ||
                !bulkRows.some((row) =>
                  row.description.trim() ||
                  row.categoryName.trim() ||
                  row.income.trim() ||
                  row.expense.trim(),
                )
              }
              type="submit"
            >
              {bulkSaving ? 'Menyimpan...' : 'Simpan Semua Transaksi'}
            </button>
          </div>

          <div className="bulk-totals" aria-live="polite">
            <div>
              <span>Total Pemasukan</span>
              <strong className="income">{formatCurrency(bulkTotals.income)}</strong>
            </div>
            <div>
              <span>Total Pengeluaran</span>
              <strong className="expense">{formatCurrency(bulkTotals.expense)}</strong>
            </div>
            <div>
              <span>Saldo Bersih</span>
              <strong className={bulkTotals.balance >= 0 ? 'income' : 'expense'}>
                {formatCurrency(bulkTotals.balance)}
              </strong>
            </div>
          </div>
        </form>
      </section>

      {!periodOptions.length && (
        <div className="settings-period-prompt">
          <p>Tambahkan periode melalui Settings sebelum mencatat transaksi.</p>
          <button
            className="secondary-button"
            onClick={onNavigateSettings}
            type="button"
          >
            Buka Settings
          </button>
        </div>
      )}
      {loadError && (
        <div className="error-panel" role="alert">
          <span>Data transaksi gagal dimuat: {loadError}</span>
          <button
            className="secondary-button"
            onClick={() => {
              setLoading(true)
              setSubscriptionAttempt((attempt) => attempt + 1)
            }}
            type="button"
          >
            Coba lagi
          </button>
        </div>
      )}

      <section aria-label={`Riwayat ${formatPeriodLabel(selectedPeriodFilter)}`} className="transaction-history">
        <h3 className="transaction-history-title">
          Riwayat {formatPeriodLabel(selectedPeriodFilter)}
        </h3>
        {loading ? (
          <div aria-live="polite" className="loading-state">
            Memuat transaksi...
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <Wallet aria-hidden="true" size={30} />
            <h3>Data belum dapat ditampilkan</h3>
          </div>
        ) : visibleTransactions.length === 0 ? (
          <div className="empty-state">
            <Wallet aria-hidden="true" size={30} />
            <h3>{selectedPeriodFilter ? 'Belum ada transaksi' : 'Belum ada periode tersedia'}</h3>
            <p>
              {selectedPeriodFilter
                ? 'Tambahkan uang masuk atau uang keluar untuk bulan ini.'
                : 'Tambahkan periode melalui Settings untuk mulai mencatat.'}
            </p>
          </div>
        ) : (
          <div className="transaction-history-list">
            {visibleTransactions.map((transaction) => {
              const isIncome = transaction.type === 'income'
              const isPurchaseLinked =
                transaction.source === 'purchase' ||
                transaction.purchaseId != null
              const categoryName =
                categoriesById.get(transaction.categoryId) ??
                transaction.categoryName

              return (
                <article className="transaction-history-row" key={transaction.id}>
                  <div className={`transaction-kind-icon ${isIncome ? 'income' : 'expense'}`}>
                    {isIncome ? (
                      <ArrowDownLeft aria-hidden="true" size={18} />
                    ) : (
                      <ArrowUpRight aria-hidden="true" size={18} />
                    )}
                  </div>
                  <div className="transaction-history-info">
                    <strong>{formatPeriodLabel(getTransactionPeriod(transaction))}</strong>
                    <span className={`transaction-kind-label ${isIncome ? 'income' : 'expense'}`}>
                      {isIncome ? 'Masuk' : 'Keluar'}
                      {!isIncome && categoryName ? ` · ${categoryName}` : ''}
                    </span>
                    <span className="transaction-history-description">
                      {transaction.description}
                    </span>
                  </div>
                  <div className="transaction-history-amount-group">
                    <strong className={`transaction-history-amount ${isIncome ? 'income' : 'expense'}`}>
                      {isIncome ? '+' : '−'} {formatCurrency(transaction.amount)}
                    </strong>
                    {transaction.runningBalance != null && (
                      <span className="transaction-running-balance">
                        Saldo: {formatCurrency(transaction.runningBalance)}
                      </span>
                    )}
                  </div>
                  {isPurchaseLinked ? (
                    <span className="managed-externally">
                      Transaksi pembelian lama
                    </span>
                  ) : (
                    <div className="row-actions">
                      <button
                        aria-label={`Edit transaksi ${transaction.description}`}
                        className="icon-button"
                        onClick={() => openEditModal(transaction)}
                        title="Edit transaksi"
                        type="button"
                      >
                        <Pencil aria-hidden="true" size={17} />
                      </button>
                      <button
                        aria-label={`Hapus transaksi ${transaction.description}`}
                        className="icon-button danger-icon"
                        disabled={deletingId === transaction.id}
                        onClick={() => handleDelete(transaction)}
                        title="Hapus transaksi"
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={17} />
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {modalOpen && (
        <Modal
          onClose={() => setModalOpen(false)}
          title={`${editingTransaction ? 'Edit' : 'Tambah'} Uang ${form.type === 'income' ? 'Masuk' : 'Keluar'}`}
        >
          <form className="form-stack transaction-form" onSubmit={handleSubmit}>
            {actionError && (
              <p className="inline-error" role="alert">{actionError}</p>
            )}
            <label className="form-field">
              <span>Bulan dan tahun *</span>
              <select
                onChange={(event) =>
                  setForm((current) => ({ ...current, period: event.target.value }))
                }
                required
                value={form.period}
              >
                {!periodOptions.length && (
                  <option value="">Belum ada periode tersedia</option>
                )}
                {periodOptions.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Nominal (Rupiah) *</span>
              <div className="amount-input-wrap">
                <span>Rp</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  min="1"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, amount: event.target.value }))
                  }
                  placeholder="Contoh: 150000"
                  required
                  step="1"
                  type="number"
                  value={form.amount}
                />
              </div>
              {form.amount && Number.isSafeInteger(Number(form.amount)) && (
                <small>{formatCurrency(Number(form.amount))}</small>
              )}
            </label>
            {form.type === 'expense' && (
              <label className="form-field">
                <span>Kategori *</span>
                <input
                  maxLength={100}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      categoryName: event.target.value,
                    }))
                  }
                  placeholder="Contoh: Konsumsi"
                  required
                  value={form.categoryName}
                />
              </label>
            )}
            <label className="form-field">
              <span>Keterangan *</span>
              <input
                maxLength={200}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                required
                value={form.description}
              />
            </label>
            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => setModalOpen(false)}
                type="button"
              >
                Batal
              </button>
              <button className="primary-button" disabled={saving} type="submit">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default Transactions
