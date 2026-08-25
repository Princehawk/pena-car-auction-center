import { useAuth } from './context/AuthContext.jsx'

export default function AdminGuard ({ children }) {
  const { loading, isAuthenticated, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className='app-shell'>
        <p>Checking admin access...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className='app-shell'>
        <section className='hero'>
          <div className='hero-card'>
            <h2>Admin access</h2>
            <p className='small'>
              You need to sign in before viewing admin pages.
            </p>
          </div>
        </section>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className='app-shell'>
        <section className='hero'>
          <div className='hero-card'>
            <h2>Access denied</h2>
            <p className='small'>Only administrators can view this area.</p>
          </div>
        </section>
      </div>
    )
  }

  return children
}
