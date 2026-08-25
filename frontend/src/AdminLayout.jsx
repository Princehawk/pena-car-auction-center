import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Navbar from './Navbar.jsx'
import './App.css'

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
  const { signOut, isAdmin } = useAuth()
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 921
  )
  const [hovered, setHovered] = useState(false)

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
              </Link>
            ))}
          </nav>
        </aside>

        <main className='admin-content'>
          <div className='admin-toolbar'>
            <div className='admin-toolbar-spacer' />
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}
