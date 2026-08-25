import { useEffect } from 'react'

export default function ImagePreview ({
  images = [],
  currentIndex = 0,
  visible = false,
  onClose,
  onPrev,
  onNext
}) {
  useEffect(() => {
    if (!visible) return

    const handleKey = event => {
      if (event.key === 'Escape') onClose?.()
      if (event.key === 'ArrowRight') onNext?.()
      if (event.key === 'ArrowLeft') onPrev?.()
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [visible, onClose, onNext, onPrev])

  if (!visible || !images?.length) return null

  const src = images[currentIndex] || images[0]

  return (
    <div className='image-preview-backdrop' onClick={onClose}>
      <div
        className='image-preview-modal'
        onClick={event => event.stopPropagation()}
      >
        <button type='button' className='preview-close' onClick={onClose}>
          ×
        </button>
        <img className='image-preview-main' src={src} alt='Preview' />
        <div className='preview-footer'>
          <button
            type='button'
            className='button button-icon'
            onClick={onPrev}
            aria-label='Previous image'
          >
            ‹
          </button>
          <span className='preview-counter'>
            {currentIndex + 1} / {images.length}
          </span>
          <button
            type='button'
            className='button button-icon'
            onClick={onNext}
            aria-label='Next image'
          >
            ›
          </button>
        </div>
      </div>
    </div>
  )
}
