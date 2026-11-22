import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Search, UserRound, UserRoundX } from 'lucide-react'
import Modal from './components/Modal.jsx'
import {
  listParticipants,
  saveParticipant,
  setParticipantActive,
} from './services/masterDataService.js'

const EMPTY_FORM = { name: '', description: '' }

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

function Participants() {
  const [participants, setParticipants] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingParticipant, setEditingParticipant] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)

  const refreshParticipants = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      setParticipants(await listParticipants())
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadParticipants() {
      try {
        const records = await listParticipants()
        if (isMounted) {
          setParticipants(records)
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

    loadParticipants()
    return () => {
      isMounted = false
    }
  }, [])

  const filteredParticipants = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID')

    return participants
      .filter((participant) => {
        const isActive = participant.isActive !== false
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'active' && isActive) ||
          (statusFilter === 'inactive' && !isActive)
        const matchesSearch =
          query === '' ||
          `${participant.name} ${participant.description ?? ''}`
            .toLocaleLowerCase('id-ID')
            .includes(query)

        return matchesStatus && matchesSearch
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'id-ID'))
  }, [participants, search, statusFilter])

  function openCreateModal() {
    setEditingParticipant(null)
    setForm(EMPTY_FORM)
    setActionError('')
    setModalOpen(true)
  }

  function openEditModal(participant) {
    setEditingParticipant(participant)
    setForm({
      name: participant.name,
      description: participant.description ?? '',
    })
    setActionError('')
    setModalOpen(true)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setActionError('')
    setSaving(true)

    try {
      await saveParticipant({
        id: editingParticipant?.id,
        ...form,
      })
      setModalOpen(false)
      await refreshParticipants()
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(participant) {
    const nextIsActive = participant.isActive === false
    const action = nextIsActive ? 'mengaktifkan' : 'menonaktifkan'
    if (
      !window.confirm(
        `Yakin ingin ${action} peserta "${participant.name}"? Riwayat pembelian tidak akan dihapus.`,
      )
    ) {
      return
    }

    setActionError('')
    setUpdatingId(participant.id)
    try {
      await setParticipantActive(participant.id, nextIsActive)
      await refreshParticipants()
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
          <h2>Master Participants</h2>
          <p>Kelola identitas peserta tanpa saldo individual.</p>
        </div>
        <button className="primary-button" onClick={openCreateModal}>
          <Plus size={18} />
          Tambah Peserta
        </button>
      </div>

      <div className="filter-toolbar">
        <label className="search-field">
          <Search aria-hidden="true" size={18} />
          <span className="visually-hidden">Cari peserta</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama atau deskripsi..."
            type="search"
            value={search}
          />
        </label>
        <label className="select-field">
          <span>Status</span>
          <select
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="all">Semua peserta</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </label>
      </div>

      {!modalOpen && actionError && (
        <p className="inline-error">{actionError}</p>
      )}
      {loadError && (
        <div className="error-panel" role="alert">
          <p>Data peserta gagal dimuat: {loadError}</p>
          <button className="secondary-button" onClick={refreshParticipants}>
            Coba lagi
          </button>
        </div>
      )}

      <div className="data-card">
        {loading ? (
          <div aria-live="polite" className="loading-state">
            Memuat data peserta...
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <UserRound size={32} />
            <h3>Data belum dapat ditampilkan</h3>
          </div>
        ) : filteredParticipants.length === 0 ? (
          <div className="empty-state">
            <UserRound size={32} />
            <h3>
              {participants.length === 0
                ? 'Belum ada peserta'
                : 'Peserta tidak ditemukan'}
            </h3>
            <p>
              {participants.length === 0
                ? 'Tambahkan peserta untuk mengaitkan mereka dengan pembelian.'
                : 'Coba ubah kata pencarian atau filter status.'}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Peserta</th>
                  <th>Deskripsi</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                  <th>
                    <span className="visually-hidden">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredParticipants.map((participant) => {
                  const isActive = participant.isActive !== false
                  return (
                    <tr key={participant.id}>
                      <td>
                        <div className="participant-name">
                          <span className="avatar">
                            <UserRound size={17} />
                          </span>
                          <span>{participant.name}</span>
                        </div>
                      </td>
                      <td>{participant.description || '-'}</td>
                      <td>
                        <span
                          className={`status-badge ${isActive ? 'is-active' : 'is-inactive'}`}
                        >
                          {isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td>{formatDate(participant.createdAt)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Edit ${participant.name}`}
                            className="icon-button"
                            onClick={() => openEditModal(participant)}
                            title="Edit peserta"
                            type="button"
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            className="text-button"
                            disabled={updatingId === participant.id}
                            onClick={() => handleStatusChange(participant)}
                            type="button"
                          >
                            {isActive ? (
                              <>
                                <UserRoundX size={16} />
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
          title={editingParticipant ? 'Edit Peserta' : 'Tambah Peserta'}
        >
          <form className="form-stack" onSubmit={handleSubmit}>
            {actionError && (
              <p className="inline-error" role="alert">
                {actionError}
              </p>
            )}
            <label className="form-field">
              <span>Nama peserta *</span>
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
              <span>Deskripsi</span>
              <textarea
                maxLength={500}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
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
                {saving ? 'Menyimpan...' : 'Simpan Peserta'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default Participants
