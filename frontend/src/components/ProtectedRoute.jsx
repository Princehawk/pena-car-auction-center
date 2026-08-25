import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute ({ children, redirectTo = '/login' }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className='app-shell'>
        <p>Checking access...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />
  }

  return children
}
