import express from 'express'
import {
  listCars,
  getCarDetails,
  createCarListing,
  editCarListing,
  toggleCarVisibilityHandler,
  removeCarListing,
  adminProfile,
  getAdminStatsHandler,
  uploadCarImages,
  syncAuthUser,
  getCurrentAuthUser,
  listUsers,
  updateUserBidding,
  updateUserRole
} from '../controllers/carController.js'
import { verifySupabaseToken, requireAdmin } from '../middleware/auth.js'

const router = express.Router()

router.get('/cars', listCars)
router.get('/cars/:id', getCarDetails)
router.post('/admin/cars', verifySupabaseToken, requireAdmin, createCarListing)
router.put(
  '/admin/cars/:id',
  verifySupabaseToken,
  requireAdmin,
  toggleCarVisibilityHandler
)
router.delete(
  '/admin/cars/:id',
  verifySupabaseToken,
  requireAdmin,
  removeCarListing
)
router.get('/admin/profile', verifySupabaseToken, requireAdmin, adminProfile)
router.get(
  '/admin/stats',
  verifySupabaseToken,
  requireAdmin,
  getAdminStatsHandler
)
router.get('/admin/users', verifySupabaseToken, requireAdmin, listUsers)
router.put(
  '/admin/users/:id/allow-bidding',
  verifySupabaseToken,
  requireAdmin,
  updateUserBidding
)
router.put(
  '/admin/users/:id/role',
  verifySupabaseToken,
  requireAdmin,
  updateUserRole
)
router.post('/admin/upload', verifySupabaseToken, requireAdmin, uploadCarImages)
router.post('/auth/sync', verifySupabaseToken, syncAuthUser)
router.get('/auth/me', verifySupabaseToken, getCurrentAuthUser)

export default router
