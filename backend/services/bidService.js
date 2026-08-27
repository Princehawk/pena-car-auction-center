import db from '../config/db.js'
import { io } from '../socket/socketHandler.js'

const fallbackBids = []

const getUserRecord = async (connection, user) => {
  const authUserKey = user.id || user.supabase_id || user.email || 'unknown'
  const [existingUsers] = await connection.execute(
    'SELECT id, bidding_allowed FROM users WHERE supabase_id = ? OR email = ?',
    [authUserKey, user.email || 'unknown@example.com']
  )
  return existingUsers[0] || null
}

const insertBidRecord = async (connection, carId, userId, amount, bidType) => {
  const [result] = await connection.execute(
    'INSERT INTO bids (car_id, user_id, bid_amount, status, bid_type, is_read) VALUES (?, ?, ?, ?, ?, ?)',
    [carId, userId, Number(amount), 'Pending', bidType, 0]
  )
  return result
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

      const [previousBids] = await connection.execute(
        `SELECT bids.user_id, users.supabase_id, bids.bid_amount
         FROM bids
         LEFT JOIN users ON users.id = bids.user_id
         WHERE bids.car_id = ? AND (bids.is_deleted IS NULL OR bids.is_deleted = 0)
         ORDER BY bids.bid_amount DESC, bids.created_at DESC
         LIMIT 1`,
        [payload.car_id]
      )
      const previousHighest = previousBids[0]

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
        `SELECT bids.id, bids.car_id, bids.user_id, bids.bid_amount, bids.status, bids.bid_type, bids.is_read, bids.created_at,
                cars.title AS car_title, cars.brand AS car_brand, cars.model AS car_model, cars.year AS car_year, cars.price AS car_price, cars.status AS car_status,
                users.full_name AS user_full_name, users.email AS user_email
         FROM bids
         LEFT JOIN cars ON cars.id = bids.car_id
         LEFT JOIN users ON users.id = bids.user_id
         WHERE bids.id = ?`,
        [bidId]
      )

      let outbid = null
      if (
        previousHighest &&
        Number(payload.bid_amount) > Number(previousHighest.bid_amount) &&
        Number(previousHighest.user_id) !== Number(dbUserId)
      ) {
        await connection.execute(
          `UPDATE bids SET status = 'Outbid'
           WHERE id = (
             SELECT bid_id FROM (
               SELECT id AS bid_id FROM bids
               WHERE car_id = ? AND user_id = ? AND bid_amount = ?
                 AND (is_deleted IS NULL OR is_deleted = 0)
               ORDER BY created_at DESC LIMIT 1
             ) AS previous_bid
           )`,
          [payload.car_id, previousHighest.user_id, previousHighest.bid_amount]
        )
        const [carDetails] = await connection.execute(
          'SELECT title FROM cars WHERE id = ?',
          [payload.car_id]
        )
        const carTitle = carDetails[0]?.title || 'a vehicle'
        const message = `You have been outbid on ${carTitle}. The current bid is KSh ${Number(
          payload.bid_amount
        ).toLocaleString()}.`
        await connection.execute(
          `INSERT INTO notifications (user_id, type, car_id, message)
           VALUES (?, 'outbid', ?, ?)`,
          [previousHighest.user_id, payload.car_id, message]
        )
        outbid = {
          bidId: previousHighest.id,
          userId: previousHighest.supabase_id,
          carId: Number(payload.car_id),
          bidAmount: Number(payload.bid_amount),
          message
        }
      }

      return {
        ...(rows[0] || {}),
        bid_type: bidType,
        outbid
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
        `SELECT bids.id, bids.car_id, bids.user_id, bids.bid_amount, bids.status, bids.bid_type, bids.is_read, bids.created_at,
                cars.title AS car_title, cars.brand AS car_brand, cars.model AS car_model, cars.year AS car_year, cars.price AS car_price, cars.status AS car_status,
                users.full_name AS user_full_name, users.email AS user_email
         FROM bids
         LEFT JOIN cars ON cars.id = bids.car_id
         LEFT JOIN users ON users.id = bids.user_id
         WHERE bids.car_id = ? AND (bids.is_deleted IS NULL OR bids.is_deleted = 0)
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
        `SELECT bids.id, bids.car_id, bids.user_id, bids.bid_amount, bids.status, bids.bid_type, bids.is_read, bids.created_at,
                cars.title AS car_title, cars.brand AS car_brand, cars.model AS car_model, cars.year AS car_year, cars.price AS car_price, cars.status AS car_status,
                users.full_name AS user_full_name, users.email AS user_email
         FROM bids
         LEFT JOIN cars ON cars.id = bids.car_id
         LEFT JOIN users ON users.id = bids.user_id
         WHERE (bids.is_deleted IS NULL OR bids.is_deleted = 0)
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

export const getBidsForUser = async user => {
  const connection = await db.getConnection()
  try {
    const userRecord = await getUserRecord(connection, user)
    if (!userRecord) return []
    const [rows] = await connection.execute(
      `SELECT bids.id, bids.car_id, bids.user_id, bids.bid_amount, bids.status, bids.bid_type, bids.created_at,
              cars.title AS car_title, cars.brand AS car_brand, cars.model AS car_model, cars.year AS car_year
       FROM bids
       LEFT JOIN cars ON cars.id = bids.car_id
       WHERE bids.user_id = ?
         AND (bids.is_deleted IS NULL OR bids.is_deleted = 0)
         AND (cars.is_deleted IS NULL OR cars.is_deleted = 0)
       ORDER BY bids.created_at DESC`,
      [userRecord.id]
    )
    return rows
  } finally {
    connection.release()
  }
}

export const getNotificationsForUser = async user => {
  const connection = await db.getConnection()
  try {
    const userRecord = await getUserRecord(connection, user)
    if (!userRecord) return []
    const [rows] = await connection.execute(
      `SELECT notifications.id, notifications.type, notifications.car_id,
              notifications.message, notifications.is_read, notifications.created_at,
              cars.title AS car_title
       FROM notifications
       LEFT JOIN cars ON cars.id = notifications.car_id
       WHERE notifications.user_id = ?
       ORDER BY notifications.created_at DESC`,
      [userRecord.id]
    )
    return rows
  } finally {
    connection.release()
  }
}

export const getUnreadNotificationCount = async user => {
  const connection = await db.getConnection()
  try {
    const userRecord = await getUserRecord(connection, user)
    if (!userRecord) return 0
    const [[row]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0',
      [userRecord.id]
    )
    return Number(row.total || 0)
  } finally {
    connection.release()
  }
}

export const processExpiredAuctions = async () => {
  const connection = await db.getConnection()
  try {
    const [cars] = await connection.execute(
      `SELECT id, title FROM cars
         WHERE status IN ('Available', 'Retreated') AND expiry_at IS NOT NULL
         AND expiry_at <= NOW()
         AND (is_deleted IS NULL OR is_deleted = 0)
         AND (winner_notified IS NULL OR winner_notified = 0)`
    )

    for (const car of cars) {
      await connection.beginTransaction()
      try {
        const [claimed] = await connection.execute(
          `UPDATE cars SET status = 'Retreated', winner_notified = 1
           WHERE id = ?
             AND (winner_notified IS NULL OR winner_notified = 0)`,
          [car.id]
        )
        if (!claimed.affectedRows) {
          await connection.rollback()
          continue
        }

        const [highestBids] = await connection.execute(
          `SELECT bids.id, bids.user_id, bids.bid_amount, users.supabase_id
           FROM bids
           LEFT JOIN users ON users.id = bids.user_id
           WHERE bids.car_id = ? AND (bids.is_deleted IS NULL OR bids.is_deleted = 0)
           ORDER BY bids.bid_amount DESC, bids.created_at DESC
           LIMIT 1`,
          [car.id]
        )
        const winner = highestBids[0]
        if (winner) {
          await connection.execute(
            "UPDATE bids SET status = 'Won' WHERE id = ?",
            [winner.id]
          )
          const message = `Congratulations! You have won the auction for ${
            car.title
          } with a bid of KSh ${Number(winner.bid_amount).toLocaleString()}.`
          await connection.execute(
            `INSERT INTO notifications (user_id, type, car_id, message)
             VALUES (?, 'won', ?, ?)`,
            [winner.user_id, car.id, message]
          )
          io?.to(`user:${winner.supabase_id}`).emit('auctionWon', {
            carId: car.id,
            message
          })
        }
        await connection.commit()
        io?.emit('carVisibilityChanged', { id: car.id, status: 'Retreated' })
      } catch (error) {
        await connection.rollback()
        throw error
      }
    }
  } finally {
    connection.release()
  }
}

export const markNotificationRead = async (user, notificationId) => {
  const connection = await db.getConnection()
  try {
    const userRecord = await getUserRecord(connection, user)
    if (!userRecord) return false
    const [result] = await connection.execute(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [notificationId, userRecord.id]
    )
    return result.affectedRows > 0
  } finally {
    connection.release()
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

export const markBidRead = async bidId => {
  try {
    const connection = await db.getConnection()
    try {
      await connection.execute('UPDATE bids SET is_read = 1 WHERE id = ?', [
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
    console.error('markBidRead failed:', error.message)
    const bid = fallbackBids.find(item => item.id === bidId)
    if (!bid) return null
    bid.is_read = 1
    return bid
  }
}
