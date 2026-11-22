import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, FolderOpen, Pencil, Plus, Tag, ToggleLeft } from 'lucide-react'
import Modal from './components/Modal.jsx'
import {
  ensureDefaultCategories,
  listCategories,
  saveCategory,
  setCategoryActive,
} from './services/masterDataService.js'

const EMPTY_FORM = { name: '', type: 'expense' }

function formatDate(value) {
  if (!value) return '-'

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Terjadi kesalahan.'
}

function Categories() {
  const [categories, setCategories] = useState([])
  const [typeFilter, setTypeFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)

  const refreshCategories = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      await ensureDefaultCategories()
      setCategories(await listCategories())
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadCategories() {
      try {
        await ensureDefaultCategories()
        const records = await listCategories()
        if (isMounted) {
          setCategories(records)
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

    loadCategories()
    return () => {
      isMounted = false
    }
  }, [])

  const filteredCategories = useMemo(
    () =>
      categories
        .filter((category) => typeFilter === 'all' || category.type === typeFilter)
        .sort(
          (a, b) =>
            a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'id-ID'),
        ),
    [categories, typeFilter],
  )

  function openCreateModal() {
    setEditingCategory(null)
    setForm(EMPTY_FORM)
    setActionError('')
    setModalOpen(true)
  }

  function openEditModal(category) {
    setEditingCategory(category)
    setForm({ name: category.name, type: category.type })
    setActionError('')
    setModalOpen(true)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setActionError('')
    setSaving(true)

    try {
      await saveCategory({
        id: editingCategory?.id,
        ...form,
      })
      setModalOpen(false)
      await refreshCategories()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(category) {
    const nextIsActive = category.isActive === false
    const action = nextIsActive ? 'mengaktifkan' : 'menonaktifkan'
    if (
      !window.confirm(
        `Yakin ingin ${action} kategori "${category.name}"?`,
      )
    ) {
      return
    }

    setActionError('')
    setUpdatingId(category.id)
    try {
      await setCategoryActive(category.id, nextIsActive)
      await refreshCategories()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <section className="master-page">
      <div className="page-toolbar">
        <div>
          <h2>Master Categories</h2>
          <p>Atur kategori untuk mengelompokkan pemasukan dan pengeluaran.</p>
        </div>
        <button className="primary-button" onClick={openCreateModal}>
          <Plus size={18} />
          Tambah Kategori
        </button>
      </div>

      <div className="filter-toolbar">
        <div className="result-count">
          <Tag aria-hidden="true" size={18} />
          {filteredCategories.length} kategori
        </div>
        <label className="select-field">
          <span>Jenis</span>
          <select
            onChange={(event) => setTypeFilter(event.target.value)}
            value={typeFilter}
          >
            <option value="all">Semua jenis</option>
            <option value="income">Pemasukan</option>
            <option value="expense">Pengeluaran</option>
          </select>
        </label>
      </div>

      {!modalOpen && actionError && (
        <p className="inline-error">{actionError}</p>
      )}
      {loadError && (
        <div className="error-panel" role="alert">
          <p>Data kategori gagal dimuat: {loadError}</p>
          <button className="secondary-button" onClick={refreshCategories}>
            Coba lagi
          </button>
        </div>
      )}

      <div className="data-card">
        {loading ? (
          <div aria-live="polite" className="loading-state">
            Memuat kategori...
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <FolderOpen size={32} />
            <h3>Data belum dapat ditampilkan</h3>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="empty-state">
            <FolderOpen size={32} />
            <h3>Tidak ada kategori</h3>
            <p>Tambahkan kategori untuk jenis yang dipilih.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nama kategori</th>
                  <th>Jenis</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                  <th>
                    <span className="visually-hidden">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.map((category) => {
                  const isActive = category.isActive !== false
                  const isIncome = category.type === 'income'

                  return (
                    <tr key={category.id}>
                      <td>
                        <div className="participant-name">
                          <span
                            className={`category-icon ${isIncome ? 'income' : 'expense'}`}
                          >
                            <Tag size={16} />
                          </span>
                          <span>{category.name}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`type-badge ${isIncome ? 'income' : 'expense'}`}
                        >
                          {isIncome ? 'Pemasukan' : 'Pengeluaran'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${isActive ? 'is-active' : 'is-inactive'}`}
                        >
                          {isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td>{formatDate(category.createdAt)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Edit ${category.name}`}
                            className="icon-button"
                            onClick={() => openEditModal(category)}
                            title="Edit kategori"
                            type="button"
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            className="text-button"
                            disabled={updatingId === category.id}
                            onClick={() => handleStatusChange(category)}
                            type="button"
                          >
                            {isActive ? (
                              <>
                                <ToggleLeft size={17} />
                                Nonaktifkan
                              </>
                            ) : (
                              <>
                                <Check size={16} />
                                Aktifkan
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <Modal
          onClose={() => setModalOpen(false)}
          title={editingCategory ? 'Edit Kategori' : 'Tambah Kategori'}
        >
          <form className="form-stack" onSubmit={handleSubmit}>
            {actionError && (
              <p className="inline-error" role="alert">
                {actionError}
              </p>
            )}
            <label className="form-field">
              <span>Nama kategori *</span>
              <input
                autoFocus
                maxLength={100}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
                value={form.name}
              />
            </label>
            <label className="form-field">
              <span>Jenis kategori *</span>
              <select
                disabled={Boolean(editingCategory)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
                value={form.type}
              >
                <option value="income">Pemasukan</option>
                <option value="expense">Pengeluaran</option>
              </select>
              {editingCategory && (
                <small>Jenis kategori tidak dapat diubah setelah dibuat.</small>
              )}
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
                {saving ? 'Menyimpan...' : 'Simpan Kategori'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default Categories
