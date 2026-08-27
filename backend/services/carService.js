import { v2 as cloudinary } from 'cloudinary'
import db from '../config/db.js'

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

const getDefaultAdminProfile = () => ({
  name: 'Peter Nabiswa',
  phone: '+254 732 622466',
  email: 'peter@carhub.com',
  whatsapp: '+254 732 622466',
  location: 'Nairobi, Kenya'
})

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

const parseExpiryDate = value => {
  if (!value) return null
  const normalized = String(value).trim()
  let candidate = normalized

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(normalized)) {
    candidate = normalized.replace(' ', 'T')
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    candidate = `${normalized}T00:00:00`
  }

  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatExpiryForDb = value => {
  const parsed = parseExpiryDate(value)
  if (!parsed) return null
  const pad = num => String(num).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(
    parsed.getDate()
  )} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(
    parsed.getSeconds()
  )}`
}

const isFutureExpiry = value => {
  const parsed = parseExpiryDate(value)
  return parsed && parsed > new Date()
}

const ensureFutureExpiry = value => {
  if (!value || !isFutureExpiry(value)) {
    throw new Error('Expiry must be a future date and time')
  }
}

const ensureExpiryColumn = async connection => {
  const [rows] = await connection.execute(
    "SHOW COLUMNS FROM cars LIKE 'expiry_at'"
  )
  if (!rows.length) {
    await connection.execute(
      'ALTER TABLE cars ADD COLUMN expiry_at DATETIME NULL'
    )
  }
}

const ensureImagePublicIdColumn = async connection => {
  const [rows] = await connection.execute(
    "SHOW COLUMNS FROM car_images LIKE 'public_id'"
  )
  if (!rows.length) {
    await connection.execute(
      'ALTER TABLE car_images ADD COLUMN public_id VARCHAR(255) NULL'
    )
  }
}

const ensureBrandsTable = async connection => {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS brands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  )
}

const retractExpiredCars = async connection => {
  await connection.execute(
    "UPDATE cars SET status = 'Retreated' WHERE status = 'Available' AND expiry_at IS NOT NULL AND expiry_at <= NOW()"
  )
}

const uploadImagesToCloudinary = async images => {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in the backend environment.'
    )
  }

  if (!Array.isArray(images) || !images.length) return []
  if (images.length > MAX_IMAGE_COUNT) {
    throw new Error(
      `You can upload up to ${MAX_IMAGE_COUNT} images per vehicle.`
    )
  }

  const uploaded = []
  for (const [index, image] of images.entries()) {
    const sizeBytes = getDataUrlSizeBytes(image)
    if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(
        `Image ${index + 1} exceeds the ${MAX_IMAGE_SIZE_MB}MB limit.`
      )
    }

    const response = await cloudinary.uploader.upload(image, {
      folder: 'eazycars/cars',
      resource_type: 'image',
      quality: 'auto:best',
      fetch_format: 'auto'
    })

    uploaded.push({
      url: response.secure_url,
      publicId: response.public_id
    })
  }

  return uploaded
}

const deleteCloudinaryImages = async images => {
  if (!Array.isArray(images) || !images.length) return
  for (const image of images) {
    const publicId = image?.publicId || image
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId)
      } catch (error) {
        console.error('Cloudinary cleanup failed:', error.message)
      }
    }
  }
}

const enrichCar = async (connection, row) => {
  const [imagesRows] = await connection.execute(
    'SELECT image_url, display_order FROM car_images WHERE car_id = ? ORDER BY display_order ASC, created_at ASC',
    [row.id]
  )
  const [profileRows] = await connection.execute(
    'SELECT name, phone, email, whatsapp, location FROM admin_profile ORDER BY id LIMIT 1'
  )
  const [highestBidRows] = await connection.execute(
    `SELECT MAX(bid_amount) AS current_highest_bid
     FROM bids
     WHERE car_id = ?
       AND (is_deleted IS NULL OR is_deleted = 0)
       AND status NOT IN ('Outbid', 'Won')`,
    [row.id]
  )

  return {
    ...row,
    images: imagesRows.map(image => image.image_url),
    admin_profile: profileRows[0] || getDefaultAdminProfile(),
    current_highest_bid: highestBidRows[0]?.current_highest_bid || null
  }
}

export const getCars = async (query = {}) => {
  try {
    const connection = await db.getConnection()
    try {
      const {
        search,
        brand,
        year,
        fuel_type,
        transmission,
        status,
        sort,
        minPrice,
        maxPrice,
        page = 1,
        limit = 12,
        includeExpired
      } = query

      const pageNumber = Number(page) || 1
      const limitNumber = Number(limit) || 12
      const offset = (pageNumber - 1) * limitNumber

      const whereClauses = []
      const params = []

      if (search) {
        whereClauses.push(
          '(`title` LIKE ? OR `brand` LIKE ? OR `model` LIKE ? OR `year` LIKE ?)'
        )
        const searchValue = `%${search}%`
        params.push(searchValue, searchValue, searchValue, searchValue)
      }

      if (brand) {
        whereClauses.push('`brand` = ?')
        params.push(brand)
      }

      if (year) {
        whereClauses.push('`year` = ?')
        params.push(year)
      }

      if (fuel_type) {
        whereClauses.push('fuel_type = ?')
        params.push(fuel_type)
      }

      if (transmission) {
        whereClauses.push('transmission = ?')
        params.push(transmission)
      }

      if (status) {
        whereClauses.push('status = ?')
        params.push(status)
      }

      if (minPrice) {
        whereClauses.push('price >= ?')
        params.push(minPrice)
      }

      if (maxPrice) {
        whereClauses.push('price <= ?')
        params.push(maxPrice)
      }

      if (includeExpired !== 'true' && includeExpired !== true) {
        whereClauses.push('(expiry_at IS NULL OR expiry_at > NOW())')
        whereClauses.push("status != 'Retreated'")
      }
      // Exclude soft-deleted rows by default
      whereClauses.push('(is_deleted IS NULL OR is_deleted = 0)')

      const whereSql = whereClauses.length
        ? ` WHERE ${whereClauses.join(' AND ')}`
        : ''

      let orderBy = 'ORDER BY created_at DESC'
      if (sort === 'price-low') orderBy = 'ORDER BY price ASC'
      if (sort === 'price-high') orderBy = 'ORDER BY price DESC'
      if (sort === 'oldest') orderBy = 'ORDER BY year ASC'
      if (sort === 'newest' || sort === 'recent')
        orderBy = 'ORDER BY created_at DESC'

      await retractExpiredCars(connection)

      const [rows] = await connection.execute(
        `SELECT * FROM cars${whereSql} ${orderBy} LIMIT ${limitNumber} OFFSET ${offset}`,
        params
      )

      const [countRows] = await connection.execute(
        `SELECT COUNT(*) as total FROM cars${whereSql}`,
        params
      )

      const cars = []
      for (const row of rows) {
        cars.push(await enrichCar(connection, row))
      }

      return {
        cars,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          totalItems: Number(countRows[0].total),
          totalPages: Math.max(
            1,
            Math.ceil(Number(countRows[0].total) / limitNumber)
          )
        }
      }
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('getCars failed:', error.message)
    throw error
  }
}

export const getCarById = async id => {
  try {
    const connection = await db.getConnection()
    try {
      await retractExpiredCars(connection)

      const [rows] = await connection.execute(
        'SELECT * FROM cars WHERE id = ? AND (is_deleted IS NULL OR is_deleted = 0)',
        [id]
      )
      if (!rows.length) return null

      const car = await enrichCar(connection, rows[0])
      const [bidRows] = await connection.execute(
        'SELECT * FROM bids WHERE car_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY created_at DESC',
        [id]
      )

      return {
        ...car,
        bids: bidRows
      }
    } catch (error) {
      console.error('getCarById failed:', error.message)
      throw error
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('getCarById failed:', error.message)
    throw error
  }
}

export const createCar = async payload => {
  try {
    const connection = await db.getConnection()
    try {
      const imageList = Array.isArray(payload.images) ? payload.images : []

      await ensureExpiryColumn(connection)
      await ensureImagePublicIdColumn(connection)
      await ensureBrandsTable(connection)
      await retractExpiredCars(connection)

      // Validate expiry when creating a car with status 'Available'
      if ((payload.status || 'Available') === 'Available') {
        if (!payload.expiry_at) {
          throw new Error(
            'Expiry date/time is required when listing a vehicle as Available'
          )
        }
        ensureFutureExpiry(payload.expiry_at)
      }

      const uploadedImages = imageList.length
        ? await uploadImagesToCloudinary(imageList)
        : []

      await connection.beginTransaction()
      try {
        const [result] = await connection.execute(
          `INSERT INTO cars (title, brand, model, year, mileage, fuel_type, transmission, engine, color, car_condition, price, description, status, expiry_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payload.title,
            payload.brand,
            payload.model,
            Number(payload.year),
            Number(payload.mileage),
            payload.fuel_type,
            payload.transmission,
            payload.engine,
            payload.color,
            payload.condition,
            Number(payload.price),
            payload.description,
            payload.status || 'Available',
            formatExpiryForDb(payload.expiry_at)
          ]
        )

        const carId = result.insertId
        await connection.execute(
          'INSERT IGNORE INTO brands (name) VALUES (?)',
          [String(payload.brand).trim()]
        )

        if (uploadedImages.length) {
          for (const [index, image] of uploadedImages.entries()) {
            await connection.execute(
              'INSERT INTO car_images (car_id, image_url, public_id, display_order) VALUES (?, ?, ?, ?)',
              [carId, image.url, image.publicId, index]
            )
          }
        }

        await connection.commit()
        return getCarById(carId)
      } catch (error) {
        await connection.rollback()
        await deleteCloudinaryImages(uploadedImages)
        throw error
      }
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('createCar failed:', error.message)
    throw error
  }
}

export const updateCar = async (id, payload) => {
  try {
    const connection = await db.getConnection()
    try {
      await ensureExpiryColumn(connection)
      await ensureImagePublicIdColumn(connection)
      await retractExpiredCars(connection)

      if (payload.status === 'Available' && !payload.expiry_at) {
        throw new Error(
          'Expiry date/time is required when the vehicle is listed as Available.'
        )
      }

      const newImages = Array.isArray(payload.images) ? payload.images : []
      const removeImages = Array.isArray(payload.removeImages)
        ? payload.removeImages
        : []

      const [existingImageRows] = await connection.execute(
        'SELECT image_url, public_id FROM car_images WHERE car_id = ?',
        [id]
      )
      const currentImageCount = existingImageRows.length
      const totalImageCount =
        currentImageCount - removeImages.length + newImages.length
      if (totalImageCount > MAX_IMAGE_COUNT) {
        throw new Error(
          `You can upload up to ${MAX_IMAGE_COUNT} images per vehicle.`
        )
      }

      const uploadedImages = newImages.length
        ? await uploadImagesToCloudinary(newImages)
        : []

      await connection.beginTransaction()
      try {
        const fields = []
        const values = []

        for (const [key, value] of Object.entries(payload)) {
          if (['images', 'removeImages', 'admin_profile'].includes(key))
            continue
          const dbColumn = key === 'condition' ? 'car_condition' : key
          if (key === 'expiry_at') {
            // validate expiry is future
            if (value) {
              ensureFutureExpiry(value)
            }
            fields.push('expiry_at = ?')
            values.push(formatExpiryForDb(value))
            continue
          }
          fields.push(`${dbColumn} = ?`)
          values.push(value)
        }

        if (fields.length) {
          values.push(id)
          await connection.execute(
            `UPDATE cars SET ${fields.join(', ')} WHERE id = ?`,
            values
          )
        }

        if (removeImages.length) {
          const placeholders = removeImages.map(() => '?').join(', ')
          await connection.execute(
            `DELETE FROM car_images WHERE car_id = ? AND image_url IN (${placeholders})`,
            [id, ...removeImages]
          )
        }

        if (uploadedImages.length) {
          for (const [index, image] of uploadedImages.entries()) {
            await connection.execute(
              'INSERT INTO car_images (car_id, image_url, public_id, display_order) VALUES (?, ?, ?, ?)',
              [id, image.url, image.publicId, currentImageCount + index]
            )
          }
        }

        await connection.commit()

        const removedPublicIds = existingImageRows
          .filter(row => removeImages.includes(row.image_url))
          .map(row => row.public_id)
          .filter(Boolean)
        if (removedPublicIds.length) {
          await deleteCloudinaryImages(
            removedPublicIds.map(publicId => ({ publicId }))
          )
        }

        return getCarById(id)
      } catch (error) {
        await connection.rollback()
        await deleteCloudinaryImages(uploadedImages)
        throw error
      }
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('updateCar failed:', error.message)
    throw error
  }
}

export const deleteCar = async id => {
  try {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute(
        "UPDATE cars SET is_deleted = 1, status = 'Retreated' WHERE id = ?",
        [id]
      )
      await connection.execute(
        'UPDATE bids SET is_deleted = 1 WHERE car_id = ?',
        [id]
      )
      const [rows] = await connection.execute(
        'SELECT id, status, is_deleted FROM cars WHERE id = ?',
        [id]
      )
      await connection.commit()
      return Boolean(rows[0] && Number(rows[0].is_deleted) === 1)
    } catch (error) {
      await connection.rollback()
      console.error('deleteCar failed:', error.message)
      throw error
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('deleteCar failed:', error.message)
    throw error
  }
}

export const toggleCarVisibility = async (id, nextStatus, providedExpiry) => {
  try {
    const connection = await db.getConnection()
    try {
      const status = nextStatus === 'Available' ? 'Available' : 'Retreated'

      // Fetch current expiry to enforce rules when posting
      const [carRows] = await connection.execute(
        'SELECT id, status, expiry_at FROM cars WHERE id = ?',
        [id]
      )
      const existing = carRows[0] || null

      if (!existing) throw new Error('Car not found')

      // When posting (making Available), ensure expiry is present and in the future.
      // If the client provided a new expiry, validate and set it. Otherwise rely on existing expiry.
      if (status === 'Available') {
        if (providedExpiry) {
          ensureFutureExpiry(providedExpiry)
          // set the new expiry
          await connection.execute(
            'UPDATE cars SET expiry_at = ? WHERE id = ?',
            [formatExpiryForDb(providedExpiry), id]
          )
        } else {
          if (!existing.expiry_at) {
            throw new Error(
              'Cannot post vehicle without an expiry. Please set an expiry time before posting.'
            )
          }
          const existingExpiry = parseExpiryDate(existing.expiry_at)
          if (!existingExpiry || existingExpiry <= new Date()) {
            throw new Error(
              'Cannot post vehicle because the expiry time has already passed'
            )
          }
        }
      }

      const [updateResult] = await connection.execute(
        'UPDATE cars SET status = ? WHERE id = ?',
        [status, id]
      )
      if (!updateResult.affectedRows) {
        throw new Error('Failed to update vehicle visibility')
      }

      const [rows] = await connection.execute(
        'SELECT id, status, expiry_at FROM cars WHERE id = ?',
        [id]
      )
      return rows[0] || null
    } catch (error) {
      console.error('toggleCarVisibility failed:', error.message)
      throw error
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('toggleCarVisibility failed:', error.message)
    throw error
  }
}

export const upsertUserFromSupabase = async (authUser = {}, payload = {}) => {
  try {
    const connection = await db.getConnection()
    try {
      const supabaseId =
        authUser?.sub ||
        authUser?.id ||
        payload.id ||
        authUser?.email ||
        'unknown'
      const fullName =
        payload.fullName ||
        payload.full_name ||
        authUser?.user_metadata?.full_name ||
        authUser?.full_name ||
        authUser?.name ||
        'Guest User'
      const email = payload.email || authUser?.email || 'unknown@example.com'
      const phone = payload.phone || authUser?.phone || null

      const [existingUsers] = await connection.execute(
        'SELECT id, supabase_id, email, full_name, phone_number, role, bidding_allowed FROM users WHERE supabase_id = ? OR email = ?',
        [supabaseId, email]
      )

      if (!existingUsers.length) {
        const [result] = await connection.execute(
          'INSERT INTO users (supabase_id, email, full_name, phone_number, role, bidding_allowed) VALUES (?, ?, ?, ?, ?, ?)',
          [supabaseId, email, fullName, phone, 'client', 0]
        )

        const [rows] = await connection.execute(
          'SELECT id, supabase_id, email, full_name, phone_number, role, bidding_allowed FROM users WHERE id = ?',
          [result.insertId]
        )
        return rows[0] || null
      }

      await connection.execute(
        'UPDATE users SET email = ?, full_name = ?, phone_number = ?, role = COALESCE(NULLIF(?, ""), role) WHERE supabase_id = ? OR email = ?',
        [email, fullName, phone, payload.role || '', supabaseId, email]
      )

      const [rows] = await connection.execute(
        'SELECT id, supabase_id, email, full_name, phone_number, role, bidding_allowed FROM users WHERE supabase_id = ? OR email = ?',
        [supabaseId, email]
      )

      return rows[0] || null
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('upsertUserFromSupabase failed:', error.message)
    throw error
  }
}

export const getAuthUserProfile = async (authUser = {}) => {
  try {
    const connection = await db.getConnection()
    try {
      const supabaseId =
        authUser?.sub || authUser?.id || authUser?.supabase_id || null
      const email = authUser?.email || null
      const [rows] = await connection.execute(
        'SELECT id, supabase_id, email, full_name, phone_number, role, bidding_allowed FROM users WHERE supabase_id = ? OR email = ? LIMIT 1',
        [supabaseId, email]
      )
      return rows[0] || null
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('getAuthUserProfile failed:', error.message)
    throw error
  }
}

export const listUsersForAdmin = async (query = {}) => {
  try {
    const connection = await db.getConnection()
    try {
      const search = query.search || ''
      const role = query.role || ''
      const sort = query.sort || 'newest'
      const page = Number(query.page) || 1
      const limit = Number(query.limit) || 20
      const offset = (page - 1) * limit

      const whereClauses = []
      const params = []

      if (search) {
        whereClauses.push(
          '(full_name LIKE ? OR email LIKE ? OR phone_number LIKE ? OR supabase_id LIKE ?)'
        )
        const searchValue = `%${search}%`
        params.push(searchValue, searchValue, searchValue, searchValue)
      }

      if (role) {
        whereClauses.push('role = ?')
        params.push(role)
      }

      const whereSql = whereClauses.length
        ? ` WHERE ${whereClauses.join(' AND ')}`
        : ''
      let orderBy = 'ORDER BY created_at DESC'
      if (sort === 'name-asc') orderBy = 'ORDER BY full_name ASC'
      if (sort === 'name-desc') orderBy = 'ORDER BY full_name DESC'
      if (sort === 'oldest') orderBy = 'ORDER BY created_at ASC'

      const [rows] = await connection.execute(
        `SELECT id, supabase_id, email, full_name, phone_number, role, bidding_allowed, created_at FROM users${whereSql} ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
        params
      )
      const [countRows] = await connection.execute(
        `SELECT COUNT(*) AS total FROM users${whereSql}`,
        params
      )

      return {
        users: rows,
        pagination: {
          page,
          limit,
          totalItems: Number(countRows[0].total || 0),
          totalPages: Math.max(
            1,
            Math.ceil(Number(countRows[0].total || 0) / limit)
          )
        }
      }
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('listUsersForAdmin failed:', error.message)
    throw error
  }
}

export const toggleUserBidding = async userId => {
  try {
    const connection = await db.getConnection()
    try {
      const [rows] = await connection.execute(
        'SELECT bidding_allowed FROM users WHERE id = ?',
        [userId]
      )
      if (!rows.length) return null

      const nextValue = rows[0].bidding_allowed ? 0 : 1
      await connection.execute(
        'UPDATE users SET bidding_allowed = ? WHERE id = ?',
        [nextValue, userId]
      )

      const [updatedRows] = await connection.execute(
        'SELECT id, bidding_allowed FROM users WHERE id = ?',
        [userId]
      )
      return updatedRows[0] || null
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('toggleUserBidding failed:', error.message)
    throw error
  }
}

export const toggleUserRole = async userId => {
  try {
    const connection = await db.getConnection()
    try {
      const [rows] = await connection.execute(
        'SELECT role FROM users WHERE id = ?',
        [userId]
      )
      if (!rows.length) return null

      const nextRole = rows[0].role === 'admin' ? 'client' : 'admin'
      await connection.execute('UPDATE users SET role = ? WHERE id = ?', [
        nextRole,
        userId
      ])

      const [updatedRows] = await connection.execute(
        'SELECT id, role FROM users WHERE id = ?',
        [userId]
      )
      return updatedRows[0] || null
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('toggleUserRole failed:', error.message)
    throw error
  }
}

export const getAdminProfile = async () => {
  try {
    const connection = await db.getConnection()
    try {
      const [rows] = await connection.execute(
        'SELECT name, phone, email, whatsapp, location FROM admin_profile ORDER BY id LIMIT 1'
      )
      return rows[0] || getDefaultAdminProfile()
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('getAdminProfile failed:', error.message)
    throw error
  }
}

export const getAdminStats = async () => {
  try {
    const connection = await db.getConnection()
    try {
      const [[carCount]] = await connection.execute(
        'SELECT COUNT(*) as totalCars FROM cars WHERE is_deleted IS NULL OR is_deleted = 0'
      )
      const [[bidCount]] = await connection.execute(
        'SELECT COUNT(*) as totalBids FROM bids WHERE is_deleted IS NULL OR is_deleted = 0'
      )
      const [[userCount]] = await connection.execute(
        'SELECT COUNT(*) as totalUsers FROM users'
      )

      return {
        totalCars: Number(carCount.totalCars || 0),
        totalBids: Number(bidCount.totalBids || 0),
        totalUsers: Number(userCount.totalUsers || 0)
      }
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('getAdminStats failed:', error.message)
    throw error
  }
}

export const getBrands = async () => {
  const connection = await db.getConnection()
  try {
    await ensureBrandsTable(connection)
    await connection.execute(
      `DELETE brands FROM brands
       LEFT JOIN (
         SELECT DISTINCT TRIM(brand) AS name FROM cars
         WHERE brand IS NOT NULL AND TRIM(brand) <> ''
           AND (is_deleted IS NULL OR is_deleted = 0)
       ) AS active_brands ON active_brands.name = brands.name
       WHERE active_brands.name IS NULL`
    )
    await connection.execute(
      `INSERT IGNORE INTO brands (name)
       SELECT DISTINCT TRIM(brand) FROM cars
       WHERE brand IS NOT NULL AND TRIM(brand) <> ''
         AND (is_deleted IS NULL OR is_deleted = 0)`
    )
    const [rows] = await connection.execute(
      'SELECT name FROM brands ORDER BY name ASC'
    )
    return rows.map(row => row.name)
  } finally {
    connection.release()
  }
}
