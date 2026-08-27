import { cloneElement, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { supabase } from './lib/supabase'
import { io as socketClient } from 'socket.io-client'
import Navbar from './Navbar.jsx'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL

const navItems = [
  { key: 'stats', label: 'Stats', icon: 'fa-chart-line', to: '/admin' },
  { key: 'users', label: 'Users', icon: 'fa-users', to: '/admin/users' },
  { key: 'vehicles', label: 'Vehicles', icon: 'fa-car', to: '/admin/vehicles' },
  { key: 'bids', label: 'Bids', icon: 'fa-gavel', to: '/admin/bids' },
  { key: 'new', label: 'New Car', icon: 'fa-plus-circle', to: '/admin/new' }
]

export default function AdminLayout ({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut, isAdmin, session } = useAuth()
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 921
  )
  const [hovered, setHovered] = useState(false)
  const [unreadBidCount, setUnreadBidCount] = useState(0)

  useEffect(() => {
    let active = true
    const socket = socketClient(SOCKET_URL, {
      auth: { token: session?.access_token }
    })

    const loadUnreadCount = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) return
      const response = await fetch(`${API_URL}/admin/bids`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      })
      if (!response.ok || !active) return
      const bids = await response.json()
      setUnreadBidCount(bids.filter(bid => !Number(bid.is_read)).length)
    }

    loadUnreadCount()
    socket.on('newBid', () => setUnreadBidCount(count => count + 1))
    socket.on('bidRead', () => {
      setUnreadBidCount(count => Math.max(0, count - 1))
    })

    return () => {
      active = false
      socket.disconnect()
    }
  }, [session?.access_token])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 921) {
        setCollapsed(false)
        setHovered(false)
        return
      }
      setCollapsed(true)
      setHovered(false)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggleSidebar = () => {
    if (window.innerWidth < 921) {
      setCollapsed(open => !open)
      setHovered(false)
      return
    }
    setCollapsed(false)
    setHovered(false)
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className='admin-page'>
      <Navbar
        brand='Pena Auctions'
        links={[
          { label: 'Browse Cars', to: '/' },
          ...(isAdmin ? [{ label: 'Admin', to: '/admin' }] : [])
        ]}
        ctaLabel='Logout'
        onCta={handleLogout}
        ctaClass='button button-secondary'
      />

      <div className='admin-shell'>
        <aside
          className={`admin-sidebar ${
            collapsed && !hovered ? 'collapsed' : ''
          }`}
          onMouseEnter={() => {
            if (window.innerWidth < 921) setHovered(true)
          }}
          onMouseLeave={() => {
            if (window.innerWidth < 921) setHovered(false)
          }}
        >
          <button
            type='button'
            className='sidebar-toggle'
            onClick={toggleSidebar}
            aria-label='Toggle sidebar'
          >
            ☰
          </button>

          <nav className='sidebar-nav'>
            {navItems.map(item => (
              <Link
                key={item.key}
                to={item.to}
                className={`sidebar-link ${
                  location.pathname === item.to ? 'active' : ''
                }`}
                onClick={() => {
                  if (window.innerWidth < 921) {
                    setCollapsed(true)
                    setHovered(false)
                  }
                }}
              >
                <span className='sidebar-icon'>
                  <i className={`fa ${item.icon}`} />
                </span>
                <span className='sidebar-label'>{item.label}</span>
                {item.key === 'bids' && unreadBidCount > 0 && (
                  <span
                    className='unread-count'
                    aria-label={`${unreadBidCount} unread bids`}
                  >
                    {unreadBidCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </aside>

        <main className='admin-content'>
          <div className='admin-toolbar'>
            <div className='admin-toolbar-spacer' />
          </div>
          {cloneElement(children, { unreadBidCount, setUnreadBidCount })}
        </main>
      </div>
    </div>
  )
}
