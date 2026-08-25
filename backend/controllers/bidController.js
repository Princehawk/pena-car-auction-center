import {
  createBid,
  getBidsForCar,
  getAllBids,
  updateBidStatus
} from '../services/bidService.js'

import { io } from '../socket/socketHandler.js'

export const submitBid = async (req, res) => {
  try {
    // Basic validation
    const carId = Number(req.body.car_id)
    const bidAmount = Number(req.body.bid_amount)
    if (!Number.isFinite(carId) || carId <= 0) {
      return res.status(400).json({ message: 'Invalid car id' })
    }
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      return res.status(400).json({ message: 'Invalid bid amount' })
    }

    req.body.car_id = carId
    req.body.bid_amount = bidAmount

    const bid = await createBid(req.body, req.user)
    io?.to(String(bid.car_id)).emit('newBid', bid)
    io?.emit('bidAccepted', bid)
    res.status(201).json(bid)
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to submit bid' })
  }
}

export const listBidsForCar = async (req, res) => {
  try {
    const carId = Number(req.params.id)
    if (!Number.isFinite(carId) || carId <= 0) {
      return res.status(400).json({ message: 'Invalid car id' })
    }
    const bids = await getBidsForCar(carId)
    res.json(bids)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to fetch bids' })
  }
}

export const listAllBids = async (req, res) => {
  try {
    const bids = await getAllBids()
    res.json(bids)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to fetch bids' })
  }
}

export const changeBidStatus = async (req, res) => {
  try {
    const bidId = Number(req.params.id)
    if (!Number.isFinite(bidId) || bidId <= 0) {
      return res.status(400).json({ message: 'Invalid bid id' })
    }

    const bid = await updateBidStatus(bidId, req.body.status)
    if (!bid) return res.status(404).json({ message: 'Bid not found' })
    io?.to(String(bid.car_id)).emit('bidAccepted', bid)
    io?.emit('bidAccepted', bid)
    res.json(bid)
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to update bid' })
  }
}
