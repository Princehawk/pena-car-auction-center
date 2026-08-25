import { v2 as cloudinary } from 'cloudinary'
import {
  createCar,
  getCars,
  getCarById,
  updateCar,
  deleteCar,
  toggleCarVisibility,
  getAdminProfile,
  getAdminStats,
  upsertUserFromSupabase,
  getAuthUserProfile,
  listUsersForAdmin,
  toggleUserBidding,
  toggleUserRole
} from '../services/carService.js'
import { io } from '../socket/socketHandler.js'

const cloudName = process.env.CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  })
}

const MAX_IMAGE_COUNT = 15
const MAX_IMAGE_SIZE_MB = 6
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024

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

export const listCars = async (req, res) => {
  try {
    const result = await getCars(req.query)
    res.json(result)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to fetch cars' })
  }
}

const parseIdFromParam = id => {
  const numericId = Number(id)
  return Number.isFinite(numericId) && numericId > 0 ? numericId : null
}

export const getCarDetails = async (req, res) => {
  try {
    const carId = parseIdFromParam(req.params.id)
    if (!carId) return res.status(400).json({ message: 'Invalid car id' })

    const car = await getCarById(carId)
    if (!car) return res.status(404).json({ message: 'Car not found' })
    res.json(car)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to fetch car' })
  }
}

export const createCarListing = async (req, res) => {
  try {
    const car = await createCar(req.body)
    io?.emit('carCreated', car)
    res.status(201).json(car)
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to create car' })
  }
}

export const editCarListing = async (req, res) => {
  try {
    const carId = parseIdFromParam(req.params.id)
    if (!carId) return res.status(400).json({ message: 'Invalid car id' })

    const car = await updateCar(carId, req.body)
    if (!car) return res.status(404).json({ message: 'Car not found' })
    res.json(car)
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to update car' })
  }
}

export const toggleCarVisibilityHandler = async (req, res) => {
  try {
    const body = req.body || {}
    // treat visibility toggle as payloads that include `status` and optionally `expiry_at`
    const isVisibilityToggle =
      body &&
      typeof body.status !== 'undefined' &&
      Object.keys(body).every(key => ['status', 'expiry_at'].includes(key))

    if (isVisibilityToggle) {
      const carId = parseIdFromParam(req.params.id)
      if (!carId) return res.status(400).json({ message: 'Invalid car id' })

      const car = await toggleCarVisibility(carId, body.status, body.expiry_at)
      if (!car) return res.status(404).json({ message: 'Car not found' })
      io?.emit('carVisibilityChanged', {
        id: carId,
        status: car.status,
        expiry_at: car.expiry_at
      })
      return res.json({ message: 'Vehicle visibility updated', car })
    }

    const carId = parseIdFromParam(req.params.id)
    if (!carId) return res.status(400).json({ message: 'Invalid car id' })

    const car = await updateCar(carId, body)
    if (!car) return res.status(404).json({ message: 'Car not found' })
    io?.emit('carUpdated', { id: carId, car })
    return res.json(car)
  } catch (error) {
    res
      .status(400)
      .json({ message: error.message || 'Failed to update vehicle visibility' })
  }
}

export const removeCarListing = async (req, res) => {
  try {
    const carId = parseIdFromParam(req.params.id)
    if (!carId) return res.status(400).json({ message: 'Invalid car id' })

    const removed = await deleteCar(carId)
    if (!removed) return res.status(404).json({ message: 'Car not found' })
    io?.emit('carRemoved', { id: carId })
    res.json({ message: 'Car deleted' })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to delete car' })
  }
}

export const adminProfile = async (req, res) => {
  try {
    const profile = await getAdminProfile()
    res.json(profile)
  } catch (error) {
    res
      .status(500)
      .json({ message: error.message || 'Failed to fetch profile' })
  }
}

export const getAdminStatsHandler = async (req, res) => {
  try {
    const stats = await getAdminStats()
    res.json(stats)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to fetch stats' })
  }
}

export const uploadCarImages = async (req, res) => {
  try {
    const { images } = req.body
    if (!Array.isArray(images) || !images.length)
      return res.status(400).json({ message: 'No images provided' })
    if (images.length > MAX_IMAGE_COUNT) {
      return res.status(400).json({
        message: `You can upload up to ${MAX_IMAGE_COUNT} images per vehicle.`
      })
    }

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({
        message:
          'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in the backend environment.'
      })
    }

    const uploaded = []
    for (const [index, image] of images.entries()) {
      const sizeBytes = getDataUrlSizeBytes(image)
      console.log(
        `[Cloudinary upload] image ${index + 1} size ${formatBytes(sizeBytes)}`
      )

      if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
        return res.status(400).json({
          message: `Image ${
            index + 1
          } exceeds the ${MAX_IMAGE_SIZE_MB}MB limit.`
        })
      }

      const response = await cloudinary.uploader.upload(image, {
        folder: 'eazycars/cars',
        resource_type: 'image',
        quality: 'auto:best',
        fetch_format: 'auto'
      })
      uploaded.push(response.secure_url)
    }

    res.json({ images: uploaded })
  } catch (error) {
    res
      .status(400)
      .json({ message: error.message || 'Failed to upload images' })
  }
}

export const syncAuthUser = async (req, res) => {
  try {
    const user = await upsertUserFromSupabase(req.user, req.body || {})
    res.json({ message: 'User synced', user })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to sync user' })
  }
}

export const getCurrentAuthUser = async (req, res) => {
  try {
    const user = await getAuthUserProfile(req.user || {})
    res.json({ user })
  } catch (error) {
    res
      .status(400)
      .json({ message: error.message || 'Failed to load current user' })
  }
}

export const listUsers = async (req, res) => {
  try {
    const result = await listUsersForAdmin(req.query)
    res.json(result)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load users' })
  }
}

export const updateUserBidding = async (req, res) => {
  try {
    const userId = Number(req.params.id)
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Invalid user id' })
    }

    const result = await toggleUserBidding(userId)
    if (!result) return res.status(404).json({ message: 'User not found' })
    io?.emit('biddingAccessChanged', { user: result })
    res.json({ message: 'Bidding access updated', user: result })
  } catch (error) {
    res
      .status(400)
      .json({ message: error.message || 'Failed to update bidding access' })
  }
}

export const updateUserRole = async (req, res) => {
  try {
    const userId = Number(req.params.id)
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Invalid user id' })
    }

    const result = await toggleUserRole(userId)
    if (!result) return res.status(404).json({ message: 'User not found' })
    res.json({ message: 'User role updated', user: result })
  } catch (error) {
    res
      .status(400)
      .json({ message: error.message || 'Failed to update user role' })
  }
}
