import { useLocation, useNavigate } from 'react-router-dom'
import AuthForm from './components/AuthForm.jsx'
import './App.css'

export default function Login () {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  return (
    <div className='app-shell'>
      <section className='hero'>
        <div className='hero-card auth-page'>
          <h2>Welcome back</h2>
          <p className='small'>Sign in or create an account to continue.</p>
          <AuthForm
            redirectTo={from}
            onSuccess={() => navigate(from, { replace: true })}
          />
        </div>
      </section>
    </div>
  )
}
