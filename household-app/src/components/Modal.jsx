import { useEffect } from 'react'
import { X } from 'lucide-react'

function Modal({ title, onClose, children, className = '' }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        aria-labelledby="modal-title"
        aria-modal="true"
        className={`modal ${className}`.trim()}
        role="dialog"
      >
        <header className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button
            aria-label="Tutup dialog"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

export default Modal
