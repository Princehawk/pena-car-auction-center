import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import AuthForm from './components/AuthForm.jsx'
import './App.css'

export default function SignIn () {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/admin', { replace: true })
    }
  }, [isAuthenticated, navigate])

  return (
    <div className='app-shell'>
      <section className='hero'>
        <div className='hero-card auth-page'>
          <h2>Sign in to Pena Car Auction Center</h2>
          <p className='small'>Use the secure login form below.</p>
          <AuthForm
            redirectTo='/admin'
            onSuccess={() => navigate('/admin', { replace: true })}
          />
        </div>
      </section>
    </div>
  )
}
