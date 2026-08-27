import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { io as socketClient } from 'socket.io-client'
import { useAuth } from './context/AuthContext.jsx'
import Navbar from './Navbar.jsx'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || window.location.origin
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

export default function BidHistory () {
  const navigate = useNavigate()
  const { session, isAdmin, signOut } = useAuth()
  const [bids, setBids] = useState([])
  const [selectedCarId, setSelectedCarId] = useState(null)

  useEffect(() => {
    const loadBids = async () => {
      if (!session?.access_token) return
      try {
        const response = await fetch(`${API_URL}/bids/mine`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        })
        const data = await response.json()
        if (!response.ok)
          throw new Error(data?.message || 'Failed to load bid history')
        setBids(data)
      } catch (error) {
        toast.error(error.message)
      }
    }
    loadBids()
  }, [session?.access_token])

  useEffect(() => {
    if (!session?.access_token) return undefined
    const socket = socketClient(SOCKET_URL, {
      auth: { token: session.access_token }
    })
    socket.on('bidOutbid', payload => {
      setBids(current =>
        current.map(bid =>
          bid.id === payload.id ? { ...bid, status: 'Outbid' } : bid
        )
      )
    })
    return () => socket.disconnect()
  }, [session?.access_token])

  const groupedBids = useMemo(() => {
    const groups = {}
    bids.forEach(bid => {
      const key = String(bid.car_id)
      if (!groups[key]) groups[key] = []
      groups[key].push(bid)
    })
    return Object.entries(groups).map(([carId, carBids]) => ({
      carId,
      bids: carBids.sort(
        (first, second) =>
          new Date(second.created_at) - new Date(first.created_at)
      )
    }))
  }, [bids])

  const selectedHistory =
    groupedBids.find(item => item.carId === selectedCarId)?.bids || []

  return (
    <div className='app-shell'>
      <Navbar
        brand='Pena Auctions'
        links={[
          { label: 'Browse Cars', to: '/' },
          { label: 'My Bid History', to: '/my-bids' },
          ...(isAdmin ? [{ label: 'Admin', to: '/admin' }] : [])
        ]}
        ctaLabel='Logout'
        onCta={async () => {
          await signOut()
          navigate('/', { replace: true })
        }}
        ctaClass='button button-secondary'
      />

      <main className='detail-page'>
        <div className='admin-hero'>
          <h2>My bid history</h2>
          <p className='small'>
            Review the vehicles you have bid on and every bid you placed.
          </p>
        </div>
        <section className='panel'>
          {groupedBids.length ? (
            <div className='bid-groups'>
              {groupedBids.map(group => (
                <button
                  type='button'
                  className='bid-group-card'
                  key={group.carId}
                  onClick={() => setSelectedCarId(group.carId)}
                >
                  <strong>
                    {group.bids[0]?.car_title || `Vehicle ${group.carId}`}
                  </strong>
                  <span>
                    {group.bids.length} bid{group.bids.length === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className='small'>You have not placed any bids yet.</p>
          )}
        </section>
      </main>

      {selectedCarId && (
        <div className='modal-backdrop' onClick={() => setSelectedCarId(null)}>
          <div className='modal' onClick={event => event.stopPropagation()}>
            <div className='row'>
              <h3>{selectedHistory[0]?.car_title || 'Bid history'}</h3>
              <button
                type='button'
                className='button button-secondary'
                onClick={() => setSelectedCarId(null)}
              >
                Close
              </button>
            </div>
            <div className='table-scroll'>
              <table className='admin-table'>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedHistory.map(bid => (
                    <tr key={bid.id}>
                      <td>{bid.bid_type || 'custom'}</td>
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
