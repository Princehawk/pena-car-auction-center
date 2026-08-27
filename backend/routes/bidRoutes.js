import express from 'express'
import {
  submitBid,
  listBidsForCar,
  listAllBids,
  changeBidStatus,
  markAsRead,
  listMyBids,
  listMyNotifications,
  readMyNotification,
  countMyNotifications
} from '../controllers/bidController.js'
import { verifySupabaseToken, requireAdmin } from '../middleware/auth.js'
import rateLimit from 'express-rate-limit'

const router = express.Router()
const bidLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 })

router.get('/bids/car/:id', listBidsForCar)
router.get('/bids/mine', verifySupabaseToken, listMyBids)
router.get('/notifications/mine', verifySupabaseToken, listMyNotifications)
router.get(
  '/notifications/mine/count',
  verifySupabaseToken,
  countMyNotifications
)
router.patch('/notifications/:id/read', verifySupabaseToken, readMyNotification)
router.get('/admin/bids', verifySupabaseToken, requireAdmin, listAllBids)
router.post('/bids', bidLimiter, verifySupabaseToken, submitBid)
router.put(
  '/admin/bids/:id',
  verifySupabaseToken,
  requireAdmin,
  changeBidStatus
)
router.patch(
  '/admin/bids/:id/read',
  verifySupabaseToken,
  requireAdmin,
  markAsRead
)

export default router
