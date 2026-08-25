import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCar,
  faGavel,
  faUsers,
  faChartLine,
  faShieldAlt
} from '@fortawesome/free-solid-svg-icons'
import { toast } from 'react-toastify'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || window.location.origin

export default function Dashboard () {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const session = await supabase.auth.getSession()
        if (!session.data.session) throw new Error('Not authenticated')

        const [statsRes, profileRes] = await Promise.all([
          fetch(`${API_URL}/admin/stats`, {
            headers: {
              Authorization: `Bearer ${session.data.session.access_token}`
            }
          }),
          fetch(`${API_URL}/admin/profile`, {
            headers: {
              Authorization: `Bearer ${session.data.session.access_token}`
            }
          })
        ])

        const statsData = await statsRes.json()
        const profileData = await profileRes.json()

        if (!statsRes.ok)
          throw new Error(statsData?.message || 'Failed to load stats')
        if (!profileRes.ok)
          throw new Error(profileData?.message || 'Failed to load profile')

        setStats(statsData)
        setProfile(profileData)
      } catch (error) {
        toast.error(error.message)
      }
    }
    load()
  }, [])

  const statCards = [
    {
      key: 'totalCars',
      label: 'Total Vehicles',
      value: stats?.totalCars ?? '—',
      icon: faCar,
      accent: 'violet'
    },
    {
      key: 'totalBids',
      label: 'Total Bids',
      value: stats?.totalBids ?? '—',
      icon: faGavel,
      accent: 'amber'
    },
    {
      key: 'totalUsers',
      label: 'Total Users',
      value: stats?.totalUsers ?? '—',
      icon: faUsers,
      accent: 'teal'
    }
  ]

  return (
    <div className='admin-panel'>
      <div className='admin-hero-card'>
        <div className='hero-copy'>
          <span className='hero-pill'>
            <FontAwesomeIcon icon={faChartLine} /> Live admin overview
          </span>
          <h2>
            Welcome back,{' '}
            {user?.user_metadata?.full_name ||
              user?.user_metadata?.name ||
              user?.email ||
              'Admin'}
          </h2>
          <p className='small'>
            Keep track of listings, bidding activity, and customer engagement
            from one polished dashboard.
          </p>
        </div>
        <div className='hero-side-card'>
          <div className='hero-side-icon'>
            <FontAwesomeIcon icon={faShieldAlt} />
          </div>
          <div>
            <p className='hero-side-label'>Secure admin access</p>
            <strong>Everything is synced live</strong>
          </div>
        </div>
      </div>

      <section className='stats-grid'>
        {statCards.map(card => (
          <div className={`stat-card ${card.accent}`} key={card.key}>
            <div className='stat-icon'>
              <FontAwesomeIcon icon={card.icon} />
            </div>
            <div className='stat-content'>
              <span className='stat-label'>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          </div>
        ))}
      </section>

      <section className='dashboard-grid'>
        <div className='panel-card'>
          <div className='panel-head'>
            <h3>Admin profile</h3>
            <span className='panel-pill'>Active</span>
          </div>
          {profile ? (
            <div className='profile-grid'>
              <div className='profile-item'>
                <p className='profile-title'>Full name</p>
                <strong>{profile.name}</strong>
              </div>
              <div className='profile-item'>
                <p className='profile-title'>Email</p>
                <strong>{profile.email}</strong>
              </div>
              <div className='profile-item'>
                <p className='profile-title'>Phone</p>
                <strong>{profile.phone || 'Not provided'}</strong>
              </div>
              <div className='profile-item'>
                <p className='profile-title'>Location</p>
                <strong>{profile.location || 'Not provided'}</strong>
              </div>
            </div>
          ) : (
            <p className='muted'>Loading profile…</p>
          )}
        </div>

        <div className='panel-card'>
          <div className='panel-head'>
            <h3>Quick insights</h3>
            <span className='panel-pill alt'>Updated now</span>
          </div>
          <ul className='insight-list'>
            <li>
              <span>Listings</span>
              <strong>{stats?.totalCars ?? '—'}</strong>
            </li>
            <li>
              <span>Bidding activity</span>
              <strong>{stats?.totalBids ?? '—'}</strong>
            </li>
            <li>
              <span>Registered accounts</span>
              <strong>{stats?.totalUsers ?? '—'}</strong>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
