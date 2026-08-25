import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { supabase } from '../lib/supabase'
import { io as socketClient } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || window.location.origin
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  window.location.origin
const MAX_IMAGES = 15
const MAX_IMAGE_SIZE_MB = 6

const formatBytes = bytes => {
  if (!bytes) return '0 MB'
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const getDataUrlSizeBytes = dataUrl => {
  if (!dataUrl?.includes(',')) return 0
  const [, payload = ''] = dataUrl.split(',')
  const padding = (payload.match(/=+$/) || [''])[0].length
  return Math.floor((payload.length * 3) / 4) - padding
}

export default function Vehicles () {
  const [cars, setCars] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    brand: '',
    model: '',
    year: '',
    mileage: '',
    fuel_type: '',
    transmission: '',
    engine: '',
    color: '',
    condition: '',
    price: '',
    status: 'Available',
    description: '',
    expiry_at: ''
  })
  const [existingImages, setExistingImages] = useState([])
  const [removedImageUrls, setRemovedImageUrls] = useState([])
  const [selectedImages, setSelectedImages] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const fetchCars = async () => {
    setLoading(true)
    try {
      const session = await supabase.auth.getSession()
      if (!session.data.session) throw new Error('Not authenticated')

      const res = await fetch(
        `${API_URL}/cars?page=1&limit=100&includeExpired=true`,
        {
          headers: {
            Authorization: `Bearer ${session.data.session.access_token}`
          }
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Failed to fetch vehicles')
      setCars(data.cars || [])
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCars()

    const socket = socketClient(SOCKET_URL)
    socket.on('connect', () => {
      console.log('✅ Vehicles socket connected:', socket.id, SOCKET_URL)
    })
    socket.on('connect_error', error => {
      console.error('❌ Vehicles socket connection error:', error)
    })
    socket.on('disconnect', reason => {
      console.log('🔌 Vehicles socket disconnected:', reason)
    })
    socket.on('carVisibilityChanged', () => fetchCars())
    socket.on('carUpdated', () => fetchCars())
    socket.on('carRemoved', () => fetchCars())
    socket.on('carCreated', () => fetchCars())

    return () => socket.disconnect()
  }, [])

  const compressImage = async file => {
    const originalSize = file.size
    const originalSizeLabel = formatBytes(originalSize)

    const imageData = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })

    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Failed to decode image'))
      image.src = imageData
    })

    const maxDimension = 1600
    let width = img.width
    let height = img.height

    if (width > maxDimension || height > maxDimension) {
      const ratio = Math.min(maxDimension / width, maxDimension / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.drawImage(img, 0, 0, width, height)

    const targetBytes = MAX_IMAGE_SIZE_MB * 1024 * 1024
    let quality = 0.92
    let compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
    let compressedSize = getDataUrlSizeBytes(compressedDataUrl)

    while (compressedSize > targetBytes && quality > 0.4) {
      quality -= 0.12
      compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
      compressedSize = getDataUrlSizeBytes(compressedDataUrl)
    }

    console.log(
      `[Image compression] ${
        file.name
      }: before ${originalSizeLabel} -> after ${formatBytes(
        compressedSize
      )} at quality ${quality.toFixed(2)}`
    )

    return compressedDataUrl
  }

  const handleEdit = car => {
    setSelected(car)
    setForm({
      title: car.title || '',
      brand: car.brand || '',
      model: car.model || '',
      year: car.year || '',
      mileage: car.mileage || '',
      fuel_type: car.fuel_type || '',
      transmission: car.transmission || '',
      engine: car.engine || '',
      color: car.color || '',
      condition: car.condition || '',
      price: car.price || '',
      status: car.status || 'Available',
      description: car.description || '',
      expiry_at: car.expiry_at
        ? (() => {
            try {
              const source = String(car.expiry_at).replace(' ', 'T')
              const d = new Date(source)
              if (Number.isNaN(d.getTime())) return ''
              const pad = num => String(num).padStart(2, '0')
              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
                d.getDate()
              )}T${pad(d.getHours())}:${pad(d.getMinutes())}`
            } catch (e) {
              return ''
            }
          })()
        : ''
    })
    setExistingImages(car.images || [])
    setRemovedImageUrls([])
    setSelectedImages([])
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setSelected(null)
    setExistingImages([])
    setRemovedImageUrls([])
    setSelectedImages([])
    setIsModalOpen(false)
  }

  const handleImageSelection = async event => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const validFiles = []
    for (const file of files) {
      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        toast.error(
          `${file.name} exceeds ${MAX_IMAGE_SIZE_MB}MB and was skipped.`
        )
        continue
      }
      validFiles.push(file)
    }

    if (!validFiles.length) return

    const remainingSlots = MAX_IMAGES - selectedImages.length
    if (remainingSlots <= 0) {
      toast.error(`You can select up to ${MAX_IMAGES} images per vehicle.`)
      event.target.value = ''
      return
    }

    const limitedFiles = validFiles.slice(0, remainingSlots)
    if (validFiles.length > remainingSlots) {
      toast.error(`You can select up to ${MAX_IMAGES} images per vehicle.`)
    }

    const prepared = await Promise.all(
      limitedFiles.map(async file => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        preview: await compressImage(file)
      }))
    )

    setSelectedImages(current => [...current, ...prepared])
    event.target.value = ''
  }

  const removeSelectedImage = imageId => {
    setSelectedImages(current => current.filter(image => image.id !== imageId))
  }

  const removeExistingImage = imageUrl => {
    setExistingImages(current => current.filter(image => image !== imageUrl))
    setRemovedImageUrls(current =>
      current.includes(imageUrl) ? current : [...current, imageUrl]
    )
  }

  const toggleVisibility = async car => {
    const nextStatus = car.status === 'Retreated' ? 'Available' : 'Retreated'
    const actionLabel = nextStatus === 'Available' ? 'post' : 'retract'
    if (
      !window.confirm(`Are you sure you want to ${actionLabel} this vehicle?`)
    )
      return

    try {
      const session = await supabase.auth.getSession()
      const payload = { status: nextStatus }
      // when posting, ensure expiry exists and is in the future
      if (nextStatus === 'Available') {
        const expiry = car.expiry_at
        if (!expiry) {
          toast.error(
            'Cannot post: set a future expiry date/time in the edit form first.'
          )
          return
        }
        const parsed = new Date(expiry)
        if (isNaN(parsed.getTime()) || parsed <= new Date()) {
          toast.error(
            'Cannot post: the current expiry has already passed. Edit the vehicle and set a future expiry.'
          )
          return
        }
        payload.expiry_at = expiry
      }

      const res = await fetch(`${API_URL}/admin/cars/${car.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.data.session.access_token}`
        },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok)
        throw new Error(data?.message || 'Failed to update vehicle visibility')
      toast.success(data.message || `Vehicle ${actionLabel}ed`)
      fetchCars()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const handleSubmit = async event => {
    event.preventDefault()
    try {
      const session = await supabase.auth.getSession()
      if (!session.data.session) throw new Error('Not authenticated')

      const requiredFields = [
        'title',
        'brand',
        'model',
        'year',
        'mileage',
        'fuel_type',
        'transmission',
        'engine',
        'color',
        'condition',
        'price',
        'description'
      ]
      const missingFields = requiredFields.filter(
        key => !String(form[key] || '').trim()
      )
      if (missingFields.length) {
        throw new Error('Please complete all vehicle details before saving.')
      }

      const totalImages = existingImages.length + selectedImages.length
      if (totalImages === 0) {
        throw new Error(
          'Please keep at least one existing image or add a new one.'
        )
      }
      if (totalImages > MAX_IMAGES) {
        throw new Error(
          `You can upload up to ${MAX_IMAGES} images per vehicle.`
        )
      }

      if (form.status === 'Available') {
        if (!form.expiry_at) {
          throw new Error(
            'Expiry date/time is required for Available vehicles.'
          )
        }
        const expiry = new Date(form.expiry_at)
        if (isNaN(expiry.getTime()) || expiry <= new Date()) {
          throw new Error('Expiry must be a future date and time')
        }
      }

      setSubmitting(true)
      const imageData = await Promise.all(
        selectedImages.map(item => compressImage(item.file))
      )

      const payload = {
        ...form,
        images: imageData,
        removeImages: removedImageUrls
      }

      const res = await fetch(`${API_URL}/admin/cars/${selected.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.data.session.access_token}`
        },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Failed to save vehicle')
      toast.success('Vehicle updated')
      handleCloseModal()
      fetchCars()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className='admin-panel'>
      <div className='admin-hero'>
        <div>
          <h2>Vehicles</h2>
          <p className='small'>View, edit, and remove vehicle listings.</p>
        </div>
      </div>

      <section className='panel'>
        <div className='row detail-header'>
          <h3>All vehicles</h3>
          <span className='small'>Edit or remove listings</span>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : cars.length ? (
          <div className='vehicle-grid'>
            {cars.map(car => (
              <article key={car.id} className='card vehicle-card'>
                <img src={car.images?.[0] || ''} alt={car.title} />
                <div className='card-body'>
                  <div className='row'>
                    <strong>{car.title}</strong>
                    <span className='small badge'>{car.status}</span>
                  </div>
                  <div className='small'>
                    {car.brand} • {car.model} • {car.year}
                  </div>
                  <div className='price'>
                    KSh {Number(car.price || 0).toLocaleString()}
                  </div>
                  <div className='vehicle-actions'>
                    <button
                      type='button'
                      className='button button-secondary'
                      onClick={() => handleEdit(car)}
                    >
                      Edit
                    </button>
                    <button
                      type='button'
                      className='button button-secondary'
                      onClick={() => toggleVisibility(car)}
                    >
                      {car.status === 'Retreated' ? 'Post' : 'Retract'}
                    </button>
                    <button
                      type='button'
                      className='button button-danger'
                      onClick={() => {
                        setDeleteTarget(car)
                        setIsDeleteOpen(true)
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>No vehicles available.</p>
        )}
      </section>

      {isModalOpen && (
        <div className='modal-backdrop' onClick={handleCloseModal}>
          <div className='modal' onClick={event => event.stopPropagation()}>
            <div className='row detail-header'>
              <h3>Edit vehicle</h3>
              <button
                type='button'
                className='button button-secondary'
                onClick={handleCloseModal}
              >
                Close
              </button>
            </div>
            <form className='form-grid' onSubmit={handleSubmit}>
              <div className='new-car-grid'>
                {[
                  { name: 'title', label: 'Title' },
                  { name: 'brand', label: 'Brand' },
                  { name: 'model', label: 'Model' },
                  { name: 'year', label: 'Year' },
                  { name: 'mileage', label: 'Mileage' },
                  { name: 'fuel_type', label: 'Fuel type' },
                  { name: 'transmission', label: 'Transmission' },
                  { name: 'engine', label: 'Engine' },
                  { name: 'color', label: 'Color' },
                  { name: 'condition', label: 'Condition' },
                  { name: 'price', label: 'Price' },
                  { name: 'status', label: 'Status' }
                ].map(field => (
                  <label key={field.name}>
                    {field.label}
                    <input
                      value={form[field.name] || ''}
                      onChange={event =>
                        setForm({ ...form, [field.name]: event.target.value })
                      }
                    />
                  </label>
                ))}

                <label className='new-car-full'>
                  Description
                  <textarea
                    rows={4}
                    value={form.description || ''}
                    onChange={event =>
                      setForm({ ...form, description: event.target.value })
                    }
                  />
                </label>

                <label className='new-car-full'>
                  Expiry date and time
                  <input
                    type='datetime-local'
                    value={form.expiry_at || ''}
                    min={new Date(
                      Date.now() - new Date().getTimezoneOffset() * 60000
                    )
                      .toISOString()
                      .slice(0, 16)}
                    onChange={event =>
                      setForm({ ...form, expiry_at: event.target.value })
                    }
                  />
                </label>

                <label className='new-car-full'>
                  Existing images
                  <div className='image-preview-row'>
                    {existingImages.map(imageUrl => (
                      <div
                        key={imageUrl}
                        className='image-preview-thumb-wrapper'
                      >
                        <img
                          src={imageUrl}
                          alt='Current vehicle'
                          className='image-preview-thumb'
                          onClick={e => e.stopPropagation()}
                        />
                        <button
                          type='button'
                          className='button button-secondary'
                          onClick={() => removeExistingImage(imageUrl)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </label>

                <label className='new-car-full'>
                  Add images
                  <input
                    type='file'
                    accept='image/*'
                    multiple
                    onChange={handleImageSelection}
                  />
                </label>

                <div className='image-preview-row new-car-full'>
                  {selectedImages.map(image => (
                    <div key={image.id} className='image-preview-thumb-wrapper'>
                      <img
                        src={image.preview}
                        alt={image.name}
                        className='image-preview-thumb'
                      />
                      <button
                        type='button'
                        className='button button-secondary'
                        onClick={() => removeSelectedImage(image.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className='new-car-actions'>
                <button
                  type='button'
                  className='button button-secondary'
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>
                <button type='submit' className='button' disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isDeleteOpen && (
        <div className='modal-backdrop' onClick={() => setIsDeleteOpen(false)}>
          <div className='modal' onClick={event => event.stopPropagation()}>
            <div className='row detail-header'>
              <h3>Confirm delete</h3>
              <button
                type='button'
                className='button button-secondary'
                onClick={() => setIsDeleteOpen(false)}
              >
                Close
              </button>
            </div>
            <div className='panel'>
              <p>
                Warning: this will remove the vehicle from public listings. Are
                you sure you want to delete{' '}
                <strong>{deleteTarget?.title || 'this vehicle'}</strong>?
              </p>
              <div className='new-car-actions'>
                <button
                  type='button'
                  className='button button-secondary'
                  onClick={() => setIsDeleteOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type='button'
                  className='button button-danger'
                  onClick={async () => {
                    try {
                      const session = await supabase.auth.getSession()
                      if (!session.data.session)
                        throw new Error('Not authenticated')
                      const res = await fetch(
                        `${API_URL}/admin/cars/${deleteTarget.id}`,
                        {
                          method: 'DELETE',
                          headers: {
                            Authorization: `Bearer ${session.data.session.access_token}`
                          }
                        }
                      )
                      const data = await res.json()
                      if (!res.ok)
                        throw new Error(
                          data?.message || 'Failed to delete vehicle'
                        )
                      toast.success(data.message || 'Vehicle deleted')
                      setIsDeleteOpen(false)
                      setDeleteTarget(null)
                      fetchCars()
                    } catch (error) {
                      toast.error(error.message)
                    }
                  }}
                >
                  Confirm delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
