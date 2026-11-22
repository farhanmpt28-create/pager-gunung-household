import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  CircleDollarSign,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
  X,
} from 'lucide-react'
import Modal from './components/Modal.jsx'
import {
  ensureDefaultCategories,
  listCategories,
  listParticipants,
} from './services/masterDataService.js'
import {
  cancelPurchase,
  deleteDraftPurchase,
  listPurchases,
  markPurchasePaid,
  savePurchase,
} from './services/purchaseService.js'

const EMPTY_ITEM = { itemName: '', quantity: '', unit: '', unitPrice: '' }
const EMPTY_FORM = {
  participantId: '',
  date: '',
  categoryId: '',
  description: '',
  notes: '',
  items: [{ ...EMPTY_ITEM }],
}

function getToday() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value) {
  if (!value) return '-'

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Terjadi kesalahan.'
}

function getStatus(purchase) {
  return purchase.status === 'completed' ? 'PAID' : purchase.status
}

function calculateTotal(items) {
  return items.reduce((total, item) => {
    const quantity = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)
    const subtotal = quantity * unitPrice
    return Number.isSafeInteger(subtotal) && subtotal > 0
      ? total + subtotal
      : total
  }, 0)
}

function Purchases({ onNavigateParticipants }) {
  const [purchases, setPurchases] = useState([])
  const [participants, setParticipants] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [participantFilter, setParticipantFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)

  const refreshPurchases = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      await ensureDefaultCategories()
      const [purchaseRecords, participantRecords, categoryRecords] =
        await Promise.all([
          listPurchases(),
          listParticipants(),
          listCategories(),
        ])
      setPurchases(purchaseRecords)
      setParticipants(participantRecords)
      setCategories(categoryRecords)
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadPurchases() {
      try {
        await ensureDefaultCategories()
        const [purchaseRecords, participantRecords, categoryRecords] =
          await Promise.all([
            listPurchases(),
            listParticipants(),
            listCategories(),
          ])
        if (isMounted) {
          setPurchases(purchaseRecords)
          setParticipants(participantRecords)
          setCategories(categoryRecords)
          setLoadError('')
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(getErrorMessage(error))
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadPurchases()
    return () => {
      isMounted = false
    }
  }, [])

  const participantsById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  )
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )
  const visiblePurchases = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID')

    return purchases
      .filter((purchase) => {
        const status = getStatus(purchase)
        const participant = participantsById.get(purchase.participantId)
        const category = categoriesById.get(purchase.categoryId)
        const itemNames = (purchase.items ?? [])
          .map(({ itemName }) => itemName)
          .join(' ')
        const searchText = [
          purchase.purchaseNumber,
          purchase.description,
          purchase.notes,
          participant?.name,
          category?.name,
          itemNames,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('id-ID')

        return (
          (participantFilter === 'all' ||
            purchase.participantId === Number(participantFilter)) &&
          (categoryFilter === 'all' ||
            purchase.categoryId === Number(categoryFilter)) &&
          (statusFilter === 'all' || status === statusFilter) &&
          (!dateFrom || purchase.date >= dateFrom) &&
          (!dateTo || purchase.date <= dateTo) &&
          (!query || searchText.includes(query))
        )
      })
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      )
  }, [
    categoriesById,
    categoryFilter,
    dateFrom,
    dateTo,
    participantFilter,
    participantsById,
    purchases,
    search,
    statusFilter,
  ])

  const activeParticipants = useMemo(
    () => participants.filter((participant) => participant.isActive !== false),
    [participants],
  )
  const expenseCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.type === 'expense' &&
          (category.isActive !== false ||
            editingPurchase?.categoryId === category.id),
      ),
    [categories, editingPurchase],
  )
  const formTotal = calculateTotal(form.items)

  function openCreateModal() {
    setEditingPurchase(null)
    setActionError('')
    setForm({
      ...EMPTY_FORM,
      date: getToday(),
      participantId: activeParticipants[0]
        ? String(activeParticipants[0].id)
        : '',
      categoryId: expenseCategories.find((category) => category.isActive !== false)
        ? String(
            expenseCategories.find((category) => category.isActive !== false).id,
          )
        : '',
      items: [{ ...EMPTY_ITEM }],
    })
    setModalOpen(true)
  }

  function openEditModal(purchase) {
    setEditingPurchase(purchase)
    setActionError('')
    setForm({
      participantId: String(purchase.participantId ?? ''),
      date: purchase.date,
      categoryId: String(purchase.categoryId ?? ''),
      description: purchase.description ?? '',
      notes: purchase.notes ?? '',
      items:
        purchase.items?.length > 0
          ? purchase.items.map((item) => ({
              itemName: item.itemName,
              quantity: String(item.quantity),
              unit: item.unit,
              unitPrice: String(item.unitPrice),
            }))
          : [{ ...EMPTY_ITEM }],
    })
    setModalOpen(true)
  }

  function updateItem(index, field, value) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setActionError('')
    setSaving(true)

    try {
      const items = form.items.filter((item) =>
        Object.values(item).some((value) => String(value).trim() !== ''),
      )
      await savePurchase({
        ...form,
        id: editingPurchase?.id,
        participantId: Number(form.participantId),
        categoryId: Number(form.categoryId),
        items,
      })
      setModalOpen(false)
      await refreshPurchases()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkPaid(purchase) {
    if (
      !window.confirm(
        `Tandai "${purchase.description}" sebesar ${formatCurrency(purchase.totalAmount)} sebagai PAID? Anggaran bersama akan berkurang.`,
      )
    ) {
      return
    }

    setActionError('')
    setUpdatingId(purchase.id)
    try {
      await markPurchasePaid(purchase.id)
      await refreshPurchases()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleCancel(purchase) {
    const paid = getStatus(purchase) === 'PAID'
    if (
      !window.confirm(
        paid
          ? `Batalkan pembelian "${purchase.description}"? Transaksi Expense terkait akan dikoreksi dan tidak lagi mengurangi anggaran.`
          : `Batalkan pembelian "${purchase.description}"?`,
      )
    ) {
      return
    }

    setActionError('')
    setUpdatingId(purchase.id)
    try {
      await cancelPurchase(purchase.id)
      await refreshPurchases()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleDeleteDraft(purchase) {
    if (
      !window.confirm(
        `Hapus draft "${purchase.description}" beserta item-itemnya?`,
      )
    ) {
      return
    }

    setActionError('')
    setUpdatingId(purchase.id)
    try {
      await deleteDraftPurchase(purchase.id)
      await refreshPurchases()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <section className="master-page purchases-page">
      <div className="page-toolbar">
        <div>
          <h2>Purchase History</h2>
          <p>
            Kelola pembelian rumah tangga; hanya pembelian PAID mengurangi
            anggaran bersama.
          </p>
        </div>
        <button className="primary-button" onClick={openCreateModal} type="button">
          <Plus size={18} />
          Pembelian Baru
        </button>
      </div>

      {participants.length === 0 && (
        <div className="purchase-participant-notice" role="status">
          <p>
            Belum ada peserta. Tambahkan peserta terlebih dahulu melalui menu
            Participants.
          </p>
          <button
            className="secondary-button"
            onClick={onNavigateParticipants}
            type="button"
          >
            Buka Participants
          </button>
        </div>
      )}

      <div className="purchase-filter-card">
        <label className="search-field">
          <Search aria-hidden="true" size={18} />
          <span className="visually-hidden">Cari pembelian</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari keterangan, item, peserta..."
            type="search"
            value={search}
          />
        </label>
        <label className="transaction-filter">
          <span>Peserta</span>
          <select
            onChange={(event) => setParticipantFilter(event.target.value)}
            value={participantFilter}
          >
            <option value="all">Semua peserta</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
        </label>
        <label className="transaction-filter">
          <span>Kategori</span>
          <select
            onChange={(event) => setCategoryFilter(event.target.value)}
            value={categoryFilter}
          >
            <option value="all">Semua kategori</option>
            {categories
              .filter(({ type }) => type === 'expense')
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>
        <label className="transaction-filter">
          <span>Status</span>
          <select
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="all">Semua status</option>
            <option value="DRAFT">Draft</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <label className="transaction-filter">
          <span>Dari tanggal</span>
          <input
            aria-label="Filter tanggal mulai"
            onChange={(event) => setDateFrom(event.target.value)}
            type="date"
            value={dateFrom}
          />
        </label>
        <label className="transaction-filter">
          <span>Sampai tanggal</span>
          <input
            aria-label="Filter tanggal akhir"
            onChange={(event) => setDateTo(event.target.value)}
            type="date"
            value={dateTo}
          />
        </label>
      </div>

      {!modalOpen && actionError && (
        <p className="inline-error" role="alert">
          {actionError}
        </p>
      )}
      {loadError && (
        <div className="error-panel" role="alert">
          <p>Data pembelian gagal dimuat: {loadError}</p>
          <button
            className="secondary-button"
            onClick={refreshPurchases}
            type="button"
          >
            Coba lagi
          </button>
        </div>
      )}

      <div className="data-card purchase-data-card">
        {loading ? (
          <div aria-live="polite" className="loading-state">
            Memuat pembelian...
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <ShoppingBasket size={32} />
            <h3>Data belum dapat ditampilkan</h3>
          </div>
        ) : visiblePurchases.length === 0 ? (
          <div className="empty-state">
            <ShoppingBasket size={32} />
            <h3>
              {purchases.length === 0
                ? 'Belum ada pembelian'
                : 'Pembelian tidak ditemukan'}
            </h3>
            <p>
              {purchases.length === 0
                ? 'Buat pembelian pertama untuk mulai mencatat belanja bersama.'
                : 'Coba ubah pencarian atau filter pembelian.'}
            </p>
          </div>
        ) : (
          <>
            <div className="transaction-count">
              Menampilkan {visiblePurchases.length} dari {purchases.length}{' '}
              pembelian
            </div>
            <div className="table-scroll">
              <table className="data-table purchase-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Pembelian</th>
                    <th>Peserta</th>
                    <th>Kategori</th>
                    <th>Item</th>
                    <th className="amount-heading">Total</th>
                    <th>Status</th>
                    <th>
                      <span className="visually-hidden">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePurchases.map((purchase) => {
                    const status = getStatus(purchase)
                    const items = purchase.items ?? []
                    return (
                      <tr key={purchase.id}>
                        <td className="date-cell">
                          <CalendarDays size={15} />
                          {formatDate(purchase.date)}
                        </td>
                        <td>
                          <div className="transaction-description">
                            <strong>{purchase.description}</strong>
                            <small>{purchase.purchaseNumber}</small>
                            {purchase.notes && <small>{purchase.notes}</small>}
                          </div>
                        </td>
                        <td>
                          {participantsById.get(purchase.participantId)?.name ??
                            'Peserta tidak tersedia'}
                        </td>
                        <td>
                          {categoriesById.get(purchase.categoryId)?.name ??
                            'Kategori tidak tersedia'}
                        </td>
                        <td>
                          <div className="purchase-item-summary">
                            {items.slice(0, 2).map((item) => (
                              <span key={item.id}>
                                {item.itemName} × {item.quantity} {item.unit}
                              </span>
                            ))}
                            {items.length > 2 && (
                              <small>+{items.length - 2} item lainnya</small>
                            )}
                            {items.length === 0 && <span>Belum ada item</span>}
                          </div>
                        </td>
                        <td className="amount-cell expense">
                          {formatCurrency(purchase.totalAmount ?? 0)}
                        </td>
                        <td>
                          <span className={`purchase-status-badge ${status}`}>
                            {status === 'DRAFT'
                              ? 'Draft'
                              : status === 'PAID'
                                ? 'Paid'
                                : 'Cancelled'}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions purchase-row-actions">
                            {status !== 'CANCELLED' && (
                              <button
                                aria-label={`Edit ${purchase.description}`}
                                className="icon-button"
                                disabled={updatingId === purchase.id}
                                onClick={() => openEditModal(purchase)}
                                title="Edit pembelian"
                                type="button"
                              >
                                <span className="visually-hidden">Edit</span>
                                <ShoppingBasket size={16} />
                              </button>
                            )}
                            {status === 'DRAFT' && (
                              <>
                                <button
                                  className="text-button"
                                  disabled={updatingId === purchase.id}
                                  onClick={() => handleMarkPaid(purchase)}
                                  type="button"
                                >
                                  <CircleDollarSign size={16} />
                                  Bayar
                                </button>
                                <button
                                  aria-label={`Hapus draft ${purchase.description}`}
                                  className="icon-button danger-icon"
                                  disabled={updatingId === purchase.id}
                                  onClick={() => handleDeleteDraft(purchase)}
                                  title="Hapus draft"
                                  type="button"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                            {status !== 'CANCELLED' && (
                              <button
                                className="text-button purchase-cancel-action"
                                disabled={updatingId === purchase.id}
                                onClick={() => handleCancel(purchase)}
                                type="button"
                              >
                                <X size={15} />
                                Batalkan
                              </button>
                            )}
                            {status === 'PAID' && (
                              <span className="purchase-corrected-indicator">
                                <Check size={14} />
                                Tercatat
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <Modal
          className="purchase-modal"
          onClose={() => setModalOpen(false)}
          title={editingPurchase ? 'Edit Pembelian' : 'Pembelian Baru'}
        >
          <form
            className="form-stack purchase-form"
            onSubmit={handleSubmit}
          >
            {actionError && (
              <p className="inline-error" role="alert">
                {actionError}
              </p>
            )}
            {participants.length === 0 && (
              <div className="purchase-participant-notice" role="status">
                <p>
                  Belum ada peserta. Tambahkan peserta terlebih dahulu melalui
                  menu Participants.
                </p>
                <button
                  className="secondary-button"
                  onClick={onNavigateParticipants}
                  type="button"
                >
                  Buka Participants
                </button>
              </div>
            )}
            <div className="purchase-header-fields">
              <label className="form-field">
                <span>Peserta *</span>
                <select
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      participantId: event.target.value,
                    }))
                  }
                  required
                  value={form.participantId}
                >
                  <option value="">Pilih peserta</option>
                  {activeParticipants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                  {editingPurchase &&
                    !activeParticipants.some(
                      ({ id }) => id === editingPurchase.participantId,
                    ) && (
                      <option value={editingPurchase.participantId}>
                        {participantsById.get(editingPurchase.participantId)
                          ?.name ?? 'Peserta nonaktif'}{' '}
                        (Riwayat)
                      </option>
                    )}
                </select>
              </label>
              <label className="form-field">
                <span>Tanggal pembelian *</span>
                <input
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                  required
                  type="date"
                  value={form.date}
                />
              </label>
              <label className="form-field">
                <span>Kategori pengeluaran *</span>
                <select
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                  required
                  value={form.categoryId}
                >
                  <option value="">Pilih kategori</option>
                  {expenseCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.isActive === false ? ' (Nonaktif — riwayat)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Keterangan pembelian *</span>
                <input
                  maxLength={200}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  required
                  value={form.description}
                />
              </label>
            </div>

            <div className="purchase-items-section">
              <div className="purchase-items-heading">
                <div>
                  <h3>Daftar item</h3>
                  <p>Harga dan subtotal menggunakan Rupiah bulat.</p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      items: [...current.items, { ...EMPTY_ITEM }],
                    }))
                  }
                  type="button"
                >
                  <Plus size={16} />
                  Tambah item
                </button>
              </div>
              <div className="purchase-item-editor">
                {form.items.map((item, index) => {
                  const subtotal = Number(item.quantity) * Number(item.unitPrice)
                  const validSubtotal =
                    Number.isSafeInteger(subtotal) && subtotal > 0
                  return (
                    <div className="purchase-item-row" key={index}>
                      <label className="form-field item-name-field">
                        <span>Nama barang *</span>
                        <input
                          maxLength={100}
                          onChange={(event) =>
                            updateItem(index, 'itemName', event.target.value)
                          }
                          value={item.itemName}
                        />
                      </label>
                      <label className="form-field item-quantity-field">
                        <span>Kuantitas *</span>
                        <input
                          min="0.001"
                          onChange={(event) =>
                            updateItem(index, 'quantity', event.target.value)
                          }
                          step="any"
                          type="number"
                          value={item.quantity}
                        />
                      </label>
                      <label className="form-field item-unit-field">
                        <span>Satuan *</span>
                        <input
                          maxLength={30}
                          onChange={(event) =>
                            updateItem(index, 'unit', event.target.value)
                          }
                          value={item.unit}
                        />
                      </label>
                      <label className="form-field item-price-field">
                        <span>Harga satuan (Rp) *</span>
                        <input
                          inputMode="numeric"
                          min="1"
                          onChange={(event) =>
                            updateItem(index, 'unitPrice', event.target.value)
                          }
                          step="1"
                          type="number"
                          value={item.unitPrice}
                        />
                      </label>
                      <div className="purchase-item-subtotal">
                        <span>Subtotal</span>
                        <strong>
                          {validSubtotal ? formatCurrency(subtotal) : '—'}
                        </strong>
                      </div>
                      <button
                        aria-label={`Hapus item ${index + 1}`}
                        className="icon-button danger-icon remove-purchase-item"
                        disabled={form.items.length === 1}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            items: current.items.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                        title="Hapus item"
                        type="button"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  )
                })}
              </div>
              <div className="purchase-total-row">
                <span>Total pembelian</span>
                <strong>{formatCurrency(formTotal)}</strong>
              </div>
            </div>

            <label className="form-field">
              <span>Catatan (opsional)</span>
              <textarea
                maxLength={500}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={2}
                value={form.notes}
              />
            </label>
            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => setModalOpen(false)}
                type="button"
              >
                Tutup
              </button>
              <button
                className="primary-button"
                disabled={saving || participants.length === 0}
                type="submit"
              >
                {saving
                  ? 'Menyimpan...'
                  : getStatus(editingPurchase ?? {}) === 'PAID'
                    ? 'Simpan koreksi'
                    : 'Simpan draft'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default Purchases
