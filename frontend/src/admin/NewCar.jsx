import { useState } from 'react'
import { toast } from 'react-toastify'
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || window.location.origin
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

export default function NewCar () {
  const getMinDateTimeLocal = () => {
    const d = new Date()
    const tzOffset = d.getTimezoneOffset() * 60000
    return new Date(Date.now() - tzOffset).toISOString().slice(0, 16)
  }
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
  const [selectedImages, setSelectedImages] = useState([])
  const [submitting, setSubmitting] = useState(false)

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

  const handleSubmit = async event => {
    event.preventDefault()
    try {
      const session = await supabase.auth.getSession()
      if (!session.data.session) throw new Error('Not authenticated')
      if (!selectedImages.length) {
        throw new Error(
          'Please select at least one image before posting the vehicle.'
        )
      }

      // expiry validation
      if (form.expiry_at) {
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
        images: imageData
      }

      const res = await fetch(`${API_URL}/admin/cars`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.data.session.access_token}`
        },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Failed to create car')
      toast.success('Vehicle posted successfully')
      setForm({
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
      setSelectedImages([])
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
          <h2>Post a new vehicle</h2>
          <p className='small'>
            Upload car details and images to list a new vehicle.
          </p>
        </div>
      </div>

      <div className='new-car-shell'>
        <section className='new-car-card'>
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
                    value={form[field.name]}
                    onChange={e =>
                      setForm({ ...form, [field.name]: e.target.value })
                    }
                  />
                </label>
              ))}

              <label className='new-car-full'>
                Description
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={e =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>

              <label className='new-car-full'>
                Expiry date and time
                <input
                  type='datetime-local'
                  value={form.expiry_at}
                  min={getMinDateTimeLocal()}
                  onChange={e =>
                    setForm({ ...form, expiry_at: e.target.value })
                  }
                />
              </label>

              <label className='new-car-full'>
                Select images
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
              <button type='submit' className='button' disabled={submitting}>
                {submitting ? 'Posting...' : 'Post Vehicle'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
