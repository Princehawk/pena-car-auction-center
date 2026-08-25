import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { supabase } from '../lib/supabase'
import { io as socketClient } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || window.location.origin
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  window.location.origin

export default function Users () {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [sort, setSort] = useState('newest')

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const session = await supabase.auth.getSession()
      if (!session.data.session) throw new Error('Not authenticated')

      const params = new URLSearchParams({
        search,
        role,
        sort,
        page: '1',
        limit: '50'
      })

      const res = await fetch(`${API_URL}/admin/users?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`
        }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Failed to load users')
      setUsers(data.users || [])
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()

    const socket = socketClient(SOCKET_URL)
    socket.on('connect', () => {
      console.log('✅ Users socket connected:', socket.id, SOCKET_URL)
    })
    socket.on('connect_error', error => {
      console.error('❌ Users socket connection error:', error)
    })
    socket.on('disconnect', reason => {
      console.log('🔌 Users socket disconnected:', reason)
    })
    socket.on('biddingAccessChanged', () => fetchUsers())

    return () => socket.disconnect()
  }, [search, role, sort])

  const handleAllowBidding = async userId => {
    try {
      const session = await supabase.auth.getSession()
      const res = await fetch(
        `${API_URL}/admin/users/${userId}/allow-bidding`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.data.session.access_token}`
          }
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Failed to update user')
      toast.success('Bidding access updated')
      fetchUsers()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const handleToggleRole = async userId => {
    try {
      const session = await supabase.auth.getSession()
      const res = await fetch(`${API_URL}/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`
        }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Failed to update role')
      toast.success('Role updated')
      fetchUsers()
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className='admin-panel'>
      <div className='admin-hero'>
        <div>
          <h2>Users</h2>
          <p className='small'>
            Search, filter, sort, and manage bidding access.
          </p>
        </div>
      </div>

      <section className='panel'>
        <div className='controls admin-controls'>
          <input
            placeholder='Search name, email or phone'
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          <select value={role} onChange={event => setRole(event.target.value)}>
            <option value=''>All roles</option>
            <option value='admin'>Admin</option>
            <option value='client'>Client</option>
          </select>
          <select value={sort} onChange={event => setSort(event.target.value)}>
            <option value='newest'>Newest</option>
            <option value='oldest'>Oldest</option>
            <option value='name-asc'>Name A–Z</option>
            <option value='name-desc'>Name Z–A</option>
          </select>
        </div>

        {loading ? (
          <p>Loading users…</p>
        ) : (
          <div className='table-scroll'>
            <table className='admin-table'>
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Bidding</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>{user.full_name || '—'}</td>
                    <td>{user.email}</td>
                    <td>{user.role || 'client'}</td>
                    <td>{user.bidding_allowed ? 'Allowed' : 'Pending'}</td>
                    <td className='actions'>
                      <button
                        type='button'
                        className='button button-secondary'
                        onClick={() => handleAllowBidding(user.id)}
                      >
                        {user.bidding_allowed
                          ? 'Revoke access'
                          : 'Allow bidding'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
