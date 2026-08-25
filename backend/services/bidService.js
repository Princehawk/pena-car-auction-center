import db from '../config/db.js'

const fallbackBids = []

const insertBidRecord = async (connection, carId, userId, amount, bidType) => {
  try {
    const [result] = await connection.execute(
      'INSERT INTO bids (car_id, user_id, bid_amount, status, bid_type) VALUES (?, ?, ?, ?, ?)',
      [carId, userId, Number(amount), 'Pending', bidType]
    )
    return result
  } catch (error) {
    if (
      error.code === 'ER_BAD_FIELD_ERROR' &&
      /bid_type/i.test(error.message)
    ) {
      const [fallbackResult] = await connection.execute(
        'INSERT INTO bids (car_id, user_id, bid_amount, status) VALUES (?, ?, ?, ?)',
        [carId, userId, Number(amount), 'Pending']
      )
      return fallbackResult
    }
    throw error
  }
}

export const createBid = async (payload, user) => {
  if (!user) throw new Error('Authentication required')
  if (!payload.car_id) throw new Error('Car id is required')
  if (!payload.bid_amount || Number(payload.bid_amount) <= 0)
    throw new Error('Bid amount must be greater than zero')

  try {
    const connection = await db.getConnection()
    try {
      const authUserKey = user.id || user.supabase_id || user.email || 'unknown'
      const [existingUsers] = await connection.execute(
        'SELECT id, bidding_allowed FROM users WHERE supabase_id = ? OR email = ?',
        [authUserKey, user.email || 'unknown@example.com']
      )

      let dbUserId = existingUsers[0]?.id

      if (!existingUsers.length) {
        const [result] = await connection.execute(
          'INSERT INTO users (supabase_id, email, full_name, phone_number, role, bidding_allowed) VALUES (?, ?, ?, ?, ?, ?)',
          [
            authUserKey,
            user.email || 'unknown@example.com',
            user.full_name || 'Guest User',
            user.phone_number || null,
            'client',
            0
          ]
        )
        dbUserId = result.insertId
      } else if (!existingUsers[0].bidding_allowed) {
        throw new Error(
          'Bidding access is pending. Please contact the admin to enable deposit-based bidding.'
        )
      }

      const [carRows] = await connection.execute(
        'SELECT id, status FROM cars WHERE id = ?',
        [payload.car_id]
      )

      if (!carRows.length) throw new Error('Car not found')
      if (carRows[0].status !== 'Available')
        throw new Error('Car is not available')

      const bidType = payload.bid_mode || payload.bid_type || 'custom'
      const insertResult = await insertBidRecord(
        connection,
        Number(payload.car_id),
        dbUserId,
        Number(payload.bid_amount),
        bidType
      )
      const bidId = insertResult.insertId

      const [rows] = await connection.execute(
        `SELECT bids.id, bids.car_id, bids.user_id, bids.bid_amount, bids.status, bids.bid_type, bids.created_at,
                cars.title AS car_title, cars.brand AS car_brand, cars.model AS car_model, cars.year AS car_year, cars.price AS car_price, cars.status AS car_status,
                users.full_name AS user_full_name, users.email AS user_email
         FROM bids
         LEFT JOIN cars ON cars.id = bids.car_id
         LEFT JOIN users ON users.id = bids.user_id
         WHERE bids.id = ?`,
        [bidId]
      )

      return {
        ...(rows[0] || {}),
        bid_type: bidType
      }
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('createBid failed:', error.message)
    throw error
  }
}

export const getBidsForCar = async carId => {
  try {
    const connection = await db.getConnection()
    try {
      const [rows] = await connection.execute(
        `SELECT bids.id, bids.car_id, bids.user_id, bids.bid_amount, bids.status, bids.bid_type, bids.created_at,
                cars.title AS car_title, cars.brand AS car_brand, cars.model AS car_model, cars.year AS car_year, cars.price AS car_price, cars.status AS car_status,
                users.full_name AS user_full_name, users.email AS user_email
         FROM bids
         LEFT JOIN cars ON cars.id = bids.car_id
         LEFT JOIN users ON users.id = bids.user_id
         WHERE bids.car_id = ?
         ORDER BY bids.created_at DESC`,
        [carId]
      )
      return rows
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('getBidsForCar fell back to demo data:', error.message)
    return fallbackBids.filter(bid => bid.car_id === carId)
  }
}

export const getAllBids = async () => {
  try {
    const connection = await db.getConnection()
    try {
      const [rows] = await connection.execute(
        `SELECT bids.id, bids.car_id, bids.user_id, bids.bid_amount, bids.status, bids.bid_type, bids.created_at,
                cars.title AS car_title, cars.brand AS car_brand, cars.model AS car_model, cars.year AS car_year, cars.price AS car_price, cars.status AS car_status,
                users.full_name AS user_full_name, users.email AS user_email
         FROM bids
         LEFT JOIN cars ON cars.id = bids.car_id
         LEFT JOIN users ON users.id = bids.user_id
         ORDER BY bids.created_at DESC`
      )
      return rows
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('getAllBids fell back to demo data:', error.message)
    return fallbackBids
  }
}

export const updateBidStatus = async (bidId, status) => {
  try {
    const connection = await db.getConnection()
    try {
      await connection.execute('UPDATE bids SET status = ? WHERE id = ?', [
        status,
        bidId
      ])
      const [rows] = await connection.execute(
        'SELECT * FROM bids WHERE id = ?',
        [bidId]
      )
      return rows[0] || null
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('updateBidStatus fell back to demo data:', error.message)
    const bid = fallbackBids.find(item => item.id === bidId)
    if (!bid) return null
    bid.status = status
    return bid
  }
}
