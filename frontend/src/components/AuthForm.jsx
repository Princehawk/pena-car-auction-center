import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function AuthForm ({
  mode = 'login',
  onSuccess,
  redirectTo = '/',
  compact = false
}) {
  const navigate = useNavigate()
  const {
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    authError,
    isAdmin,
    dbUser
  } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [activeMode, setActiveMode] = useState(mode)

  const isLogin = activeMode === 'login'

  const handleSubmit = async event => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')

    if (!isLogin && !acceptedTerms) {
      setMessage('Please accept the Terms and Conditions to create an account.')
      setIsSubmitting(false)
      return
    }

    try {
      if (isLogin) {
        await signInWithPassword(email, password)
        setMessage('Signed in successfully.')
      } else {
        await signUpWithPassword(email, password, fullName)
        setMessage(
          'Account created. Please check your email for confirmation if required.'
        )
      }

      onSuccess?.()
      if (redirectTo) {
        const targetPath = dbUser?.role === 'admin' ? '/admin' : '/'
        navigate(targetPath, { replace: true })
      }
    } catch (error) {
      setMessage(error.message || 'Unable to complete authentication.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogle = async () => {
    setIsSubmitting(true)
    setMessage('')
    try {
      await signInWithGoogle(redirectTo)
    } catch (error) {
      setMessage(error.message || 'Unable to start Google sign-in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={`auth-card ${compact ? 'compact' : ''}`}>
      <div className='auth-switcher'>
        <button
          type='button'
          className={`auth-switch ${isLogin ? 'active' : ''}`}
          onClick={() => setActiveMode('login')}
        >
          Login
        </button>
        <button
          type='button'
          className={`auth-switch ${!isLogin ? 'active' : ''}`}
          onClick={() => setActiveMode('signup')}
        >
          Sign up
        </button>
      </div>

      <form className='form-grid' onSubmit={handleSubmit}>
        {!isLogin && (
          <label>
            Full name
            <input
              type='text'
              value={fullName}
              onChange={event => setFullName(event.target.value)}
              placeholder='Your name'
            />
          </label>
        )}

        <label>
          Email
          <input
            type='email'
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder='you@example.com'
            required
          />
        </label>

        <label>
          Password
          <input
            type='password'
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder='At least 6 characters'
            required
            minLength={6}
          />
        </label>

        {!isLogin && (
          <label className='terms-checkbox'>
            <input
              type='checkbox'
              checked={acceptedTerms}
              onChange={event => setAcceptedTerms(event.target.checked)}
              required
            />
            <span>
              I have read and accept the{' '}
              <Link to='/terms-and-conditions'>Terms and Conditions</Link>
            </span>
          </label>
        )}

        <button type='submit' className='button' disabled={isSubmitting}>
          {isSubmitting
            ? isLogin
              ? 'Signing in...'
              : 'Creating account...'
            : isLogin
            ? 'Log in'
            : 'Create account'}
        </button>
      </form>

      <button
        type='button'
        className='button button-secondary'
        onClick={handleGoogle}
        disabled={isSubmitting}
      >
        Continue with Google
      </button>

      {(message || authError) && (
        <p className='small status-text'>{message || authError}</p>
      )}
    </div>
  )
}
