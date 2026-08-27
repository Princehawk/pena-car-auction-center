import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from './context/AuthContext.jsx'
import Navbar from './Navbar.jsx'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || window.location.origin

export default function Notifications () {
  const { session, isAdmin } = useAuth()
  const [notifications, setNotifications] = useState([])

  const loadNotifications = async () => {
    if (!session?.access_token) return
    try {
      const response = await fetch(`${API_URL}/notifications/mine`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      const data = await response.json()
      if (!response.ok)
        throw new Error(data?.message || 'Failed to load notifications')
      setNotifications(data)
    } catch (error) {
      toast.error(error.message)
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadNotifications, 0)
    return () => clearTimeout(timer)
  }, [session?.access_token])

  const markRead = async notification => {
    if (Number(notification.is_read)) return
    const response = await fetch(
      `${API_URL}/notifications/${notification.id}/read`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}` }
      }
    )
    if (response.ok) {
      setNotifications(current =>
        current.map(item =>
          item.id === notification.id ? { ...item, is_read: 1 } : item
        )
      )
      window.dispatchEvent(new Event('notificationsChanged'))
    }
  }

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
      />
      <main className='detail-page'>
        <div className='admin-hero'>
          <h2>Notifications</h2>
          <p className='small'>Outbid and auction result updates.</p>
        </div>
        <section className='panel notification-list'>
          {notifications.length ? (
            notifications.map(notification => (
              <article
                key={notification.id}
                className={`notification-item ${
                  Number(notification.is_read) ? '' : 'unread'
                }`}
                onClick={() => markRead(notification)}
              >
                <div>
                  <strong>
                    {notification.type === 'won'
                      ? 'Auction won'
                      : 'You were outbid'}
                  </strong>
                  <p>{notification.message}</p>
                  <span className='small'>
                    {new Date(notification.created_at).toLocaleString()}
                  </span>
                </div>
                {notification.car_id && (
                  <Link
                    className='button button-secondary'
                    to={`/cars/${notification.car_id}`}
                    onClick={() => markRead(notification)}
                  >
                    View vehicle
                  </Link>
                )}
              </article>
            ))
          ) : (
            <p className='small'>You have no notifications.</p>
          )}
        </section>
      </main>
    </div>
  )
}
