import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { io as socketClient } from 'socket.io-client'
import { toast } from 'react-toastify'
import { useAuth } from './context/AuthContext.jsx'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin
const API_URL = import.meta.env.VITE_API_URL || window.location.origin

export default function Navbar ({
  brand = 'Pena Auctions',
  links = [],
  ctaLabel,
  onCta,
  ctaClass = 'button button-secondary'
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const { session, isAdmin } = useAuth()

  useEffect(() => {
    if (!session?.access_token || isAdmin) return undefined
    const socket = socketClient(SOCKET_URL, {
      auth: { token: session.access_token }
    })
    const refreshCount = async () => {
      const response = await fetch(`${API_URL}/notifications/mine/count`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      if (!response.ok) return
      const data = await response.json()
      setUnreadNotificationCount(Number(data.count || 0))
    }
    socket.on('outbid', payload => {
      toast.info(payload.message)
      setUnreadNotificationCount(count => count + 1)
    })
    socket.on('auctionWon', payload => {
      toast.success(payload.message)
      setUnreadNotificationCount(count => count + 1)
    })

    refreshCount()
    window.addEventListener('notificationsChanged', refreshCount)
    return () => {
      window.removeEventListener('notificationsChanged', refreshCount)
      socket.disconnect()
    }
  }, [isAdmin, session?.access_token])

  return (
    <nav className='navbar'>
      <div className='navbar-brand'>
        <h1>{brand}</h1>
      </div>

      <button
        type='button'
        className={`nav-toggle ${menuOpen ? 'open' : ''}`}
        onClick={() => setMenuOpen(open => !open)}
        aria-label='Toggle navigation'
        aria-expanded={menuOpen}
      >
        <span />
        <span />
        <span />
      </button>

      <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
        {links.map(link => (
          <Link
            key={link.label}
            to={link.to}
            className='nav-link'
            onClick={() => setMenuOpen(false)}
          >
            {link.label}
          </Link>
        ))}
        {!isAdmin && session?.access_token && (
          <Link
            to='/notifications'
            className='nav-link notification-link'
            aria-label={`Notifications${
              unreadNotificationCount
                ? `, ${unreadNotificationCount} unread`
                : ''
            }`}
            onClick={() => setMenuOpen(false)}
          >
            <i className='fa fa-bell' aria-hidden='true' />
            {unreadNotificationCount > 0 && (
              <span className='unread-count'>{unreadNotificationCount}</span>
            )}
          </Link>
        )}
        {ctaLabel && (
          <button
            type='button'
            className={ctaClass}
            onClick={() => {
              setMenuOpen(false)
              onCta?.()
            }}
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </nav>
  )
}
