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
  const visibleTransactions = useMemo(
    () =>
      transactions
        .filter(
          (transaction) =>
            getTransactionPeriod(transaction) === selectedPeriodFilter,
        )
        .sort(
          (a, b) =>
            (b.createdAt ?? '').localeCompare(a.createdAt ?? '') ||
            b.id - a.id,
        ),
    [selectedPeriodFilter, transactions],
  )

  function openCreateModal(type) {
    setEditingTransaction(null)
    setActionError('')
    setForm({
      ...EMPTY_FORM,
      type,
      period: periodOptions.some(({ value }) => value === selectedPeriodFilter)
        ? selectedPeriodFilter
        : periodOptions[0]?.value ?? '',
    })
    setModalOpen(true)
  }

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
        <div className="transaction-create-actions">
          <button
            className="income-button"
            disabled={!periodOptions.length}
            onClick={() => openCreateModal('income')}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
            Uang Masuk
          </button>
          <button
            className="primary-button"
            disabled={!periodOptions.length}
            onClick={() => openCreateModal('expense')}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
            Uang Keluar
          </button>
        </div>
      </div>

      <div className="transaction-history-toolbar">
        <label className="transaction-filter">
          <span>Bulan dan tahun</span>
          <select
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
      {actionError && !modalOpen && (
        <p className="inline-error" role="alert">{actionError}</p>
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
                  <strong className={`transaction-history-amount ${isIncome ? 'income' : 'expense'}`}>
                    {isIncome ? '+' : '−'} {formatCurrency(transaction.amount)}
                  </strong>
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
