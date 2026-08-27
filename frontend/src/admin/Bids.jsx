import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { supabase } from '../lib/supabase'
import { io as socketClient } from 'socket.io-client'
import { useAuth } from '../context/AuthContext.jsx'

const API_URL = import.meta.env.VITE_API_URL || window.location.origin
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  window.location.origin

export default function Bids ({ setUnreadBidCount }) {
  const [bids, setBids] = useState([])
  const [selectedCarId, setSelectedCarId] = useState(null)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [sortMode, setSortMode] = useState('newest')
  const { session } = useAuth()
  const markBidRead = async bid => {
    if (Number(bid.is_read)) return
    const session = await supabase.auth.getSession()
    if (!session.data.session) return
    const response = await fetch(`${API_URL}/admin/bids/${bid.id}/read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.data.session.access_token}`
      }
    })
    if (!response.ok) return
    setBids(current =>
      current.map(item => (item.id === bid.id ? { ...item, is_read: 1 } : item))
    )
  }

  const loadBids = async () => {
    try {
      const session = await supabase.auth.getSession()
      if (!session.data.session) throw new Error('Not authenticated')
      const res = await fetch(`${API_URL}/admin/bids`, {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`
        }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Failed to load bids')
      setBids(data)
    } catch (error) {
      toast.error(error.message)
    }
  }

  useEffect(() => {
    loadBids()
    const socket = socketClient(SOCKET_URL, {
      auth: { token: session?.access_token }
    })

    socket.on('connect', () => {
      console.log('✅ Bids socket connected:', socket.id, SOCKET_URL)
    })
    socket.on('connect_error', error => {
      console.error('❌ Bids socket connection error:', error)
    })
    socket.on('disconnect', reason => {
      console.log('🔌 Bids socket disconnected:', reason)
    })
    socket.on('newBid', payload => {
      setBids(curr => [payload, ...curr])
      toast.info('New bid received')
    })
    socket.on('bidRead', payload => {
      setBids(curr =>
        curr.map(bid => (bid.id === payload.id ? { ...bid, is_read: 1 } : bid))
      )
    })
    socket.on('bidOutbid', payload => {
      setBids(curr =>
        curr.map(bid =>
          bid.id === payload.id ? { ...bid, status: 'Outbid' } : bid
        )
      )
    })
    socket.on('bidAccepted', () => {
      loadBids()
      toast.success('Bid status updated')
    })

    return () => {
      socket.disconnect()
    }
  }, [session?.access_token])

  const groupedBids = useMemo(() => {
    const groups = {}
    bids.forEach(bid => {
      const key = bid.car_id || 'unknown'
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(bid)
    })

    return Object.entries(groups).map(([carId, carBids]) => ({
      carId,
      bids: carBids.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )
    }))
  }, [bids])

  const selectedHistory = useMemo(() => {
    const group = groupedBids.find(item => item.carId === selectedCarId)
    if (!group) return []

    const list = [...group.bids]
    if (sortMode === 'oldest') {
      list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    }
    if (sortMode === 'custom-first') {
      list.sort(
        (a, b) =>
          Number(b.bid_type === 'custom') - Number(a.bid_type === 'custom')
      )
    }
    if (sortMode === 'auto-first') {
      list.sort(
        (a, b) => Number(b.bid_type === 'auto') - Number(a.bid_type === 'auto')
      )
    }
    return list
  }, [groupedBids, selectedCarId, sortMode])

  const openHistory = carId => {
    setSelectedCarId(carId)
    setShowHistoryModal(true)
    const group = groupedBids.find(item => item.carId === carId)
    const unreadBids = group?.bids.filter(bid => !Number(bid.is_read)) || []
    unreadBids.forEach(markBidRead)
    if (unreadBids.length) {
      setUnreadBidCount?.(count => Math.max(0, count - unreadBids.length))
    }
  }

  return (
    <div className='admin-panel'>
      <div className='admin-hero'>
        <div>
          <h2>Bids</h2>
          <p className='small'>Grouped by vehicle with bid history details.</p>
        </div>
      </div>

      <section className='panel'>
        <div className='bid-groups'>
          {groupedBids.map(group => (
            <button
              key={group.carId}
              type='button'
              className='bid-group-card'
              onClick={() => openHistory(group.carId)}
            >
              <strong>
                {group.bids[0]?.car_title ||
                  group.bids[0]?.car_brand ||
                  group.carId}
              </strong>
              <span>
                {group.bids.filter(bid => !Number(bid.is_read)).length > 0 && (
                  <span className='unread-count'>
                    {group.bids.filter(bid => !Number(bid.is_read)).length}
                  </span>
                )}{' '}
                {group.bids[0]?.car_brand && group.bids[0]?.car_model
                  ? `${group.bids[0].car_brand} ${group.bids[0].car_model}`
                  : `${group.bids.length} bids`}
              </span>
            </button>
          ))}
        </div>
      </section>

      {showHistoryModal && selectedCarId && (
        <div
          className='modal-backdrop'
          onClick={() => setShowHistoryModal(false)}
        >
          <div className='modal' onClick={event => event.stopPropagation()}>
            <div className='row'>
              <h3>
                Bid history for{' '}
                {selectedHistory[0]?.car_title
                  ? `${selectedHistory[0].car_title} (${selectedHistory[0].car_brand} ${selectedHistory[0].car_model})`
                  : selectedCarId}
              </h3>
              <button
                type='button'
                className='button button-secondary'
                onClick={() => setShowHistoryModal(false)}
              >
                Close
              </button>
            </div>
            <div className='row'>
              <select
                value={sortMode}
                onChange={event => setSortMode(event.target.value)}
              >
                <option value='newest'>Newest first</option>
                <option value='oldest'>Oldest first</option>
                <option value='custom-first'>Custom first</option>
                <option value='auto-first'>Auto first</option>
              </select>
            </div>
            <div className='table-scroll'>
              <table className='admin-table'>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>User ID</th>
                    <th>Bidder</th>
                    <th>Email</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedHistory.map(bid => (
                    <tr key={bid.id}>
                      <td>{bid.bid_type || 'custom'}</td>
                      <td>{bid.user_id || '—'}</td>
                      <td>{bid.user_full_name || bid.full_name || '—'}</td>
                      <td>{bid.user_email || bid.email || '—'}</td>
                      <td>KSh {Number(bid.bid_amount).toLocaleString()}</td>
                      <td>{bid.status}</td>
                      <td>{new Date(bid.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
