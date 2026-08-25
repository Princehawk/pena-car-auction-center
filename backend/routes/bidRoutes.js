import express from 'express'
import {
  submitBid,
  listBidsForCar,
  listAllBids,
  changeBidStatus
} from '../controllers/bidController.js'
import { verifySupabaseToken, requireAdmin } from '../middleware/auth.js'
import rateLimit from 'express-rate-limit'

const router = express.Router()
const bidLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 })

router.get('/bids/car/:id', listBidsForCar)
router.get('/admin/bids', verifySupabaseToken, requireAdmin, listAllBids)
router.post('/bids', bidLimiter, verifySupabaseToken, submitBid)
router.put(
  '/admin/bids/:id',
  verifySupabaseToken,
  requireAdmin,
  changeBidStatus
)

export default router
