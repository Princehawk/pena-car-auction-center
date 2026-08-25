import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'
import { supabase } from './lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || window.location.origin

function App () {
  const [cars, setCars] = useState([])
  const [selectedCar, setSelectedCar] = useState(null)
  const [filters, setFilters] = useState({
    search: '',
    brand: '',
    year: '',
    fuel_type: '',
    transmission: '',
    status: '',
    sort: 'newest'
  })
  const [showModal, setShowModal] = useState(false)
  const [bidAmount, setBidAmount] = useState('')
  const [session, setSession] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      supabase.auth.onAuthStateChange((_event, currentSession) =>
        setSession(currentSession)
      )
    }

    loadSession()
  }, [])

  const fetchCars = async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: '1',
      limit: '12',
      ...filters,
      sort: filters.sort
    })
    const response = await fetch(`${API_URL}/cars?${params.toString()}`)
    const data = await response.json()
    setCars(data.cars || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchCars()
  }, [
    filters.search,
    filters.brand,
    filters.year,
    filters.fuel_type,
    filters.transmission,
    filters.status,
    filters.sort
  ])

  const openCar = async carId => {
    const response = await fetch(`${API_URL}/cars/${carId}`)
    const data = await response.json()
    setSelectedCar(data)
  }

  const handleBid = async () => {
    if (!selectedCar) return
    if (!session) {
      setShowModal(true)
      return
    }

    const response = await fetch(`${API_URL}/bids`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ car_id: selectedCar.id, bid_amount: bidAmount })
    })

    const data = await response.json()
    setMessage(data.message || 'Bid submitted')
    setBidAmount('')
    setShowModal(false)
  }

  const navigate = useNavigate()

  const signIn = () => {
    if (session) {
      setMessage('You are already signed in.')
      return
    }
    navigate('/sign-in')
  }

  const summary = useMemo(() => {
    if (!selectedCar) return null
    const highest = selectedCar.bids?.length
      ? Math.max(...selectedCar.bids.map(bid => bid.bid_amount))
      : selectedCar.price
    return { highest }
  }, [selectedCar])

  return (
    <div className='app-shell'>
      <nav className='navbar'>
        <h1>Pena Auctions</h1>
        <div className='nav-links'>
          <a href='#cars'>Browse Cars</a>
          <button className='secondary' onClick={signIn}>
            Login
          </button>
        </div>
      </nav>

      <section className='hero'>
        <div className='hero-card'>
          <h2>Premium cars, simple bidding</h2>
          <p className='small'>
            Browse listings, inspect details, and submit a bid without leaving
            the page.
          </p>
          <div className='controls'>
            <input
              placeholder='Search brand or model'
              value={filters.search}
              onChange={event =>
                setFilters({ ...filters, search: event.target.value })
              }
            />
            <select
              value={filters.brand}
              onChange={event =>
                setFilters({ ...filters, brand: event.target.value })
              }
            >
              <option value=''>All brands</option>
              <option value='Toyota'>Toyota</option>
              <option value='Honda'>Honda</option>
            </select>
            <select
              value={filters.sort}
              onChange={event =>
                setFilters({ ...filters, sort: event.target.value })
              }
            >
              <option value='newest'>Newest</option>
              <option value='oldest'>Oldest</option>
              <option value='price-low'>Price Low → High</option>
              <option value='price-high'>Price High → Low</option>
            </select>
            <button onClick={fetchCars}>Refresh</button>
          </div>
        </div>
      </section>

      <section id='cars' className='grid'>
        {loading ? (
          <p>Loading...</p>
        ) : (
          cars.map(car => (
            <article key={car.id} className='card'>
              <img src={car.images?.[0] || ''} alt={car.title} />
              <div className='card-body'>
                <div className='row'>
                  <strong>{car.title}</strong>
                  <span className='small'>{car.status}</span>
                </div>
                <div className='small'>
                  {car.brand} • {car.model} • {car.year}
                </div>
                <div className='price'>KSh {car.price.toLocaleString()}</div>
                <button onClick={() => openCar(car.id)}>View Details</button>
              </div>
            </article>
          ))
        )}
      </section>

      {selectedCar && (
        <section className='detail-page'>
          <div className='detail-grid'>
            <div className='panel'>
              <img
                className='image-main'
                src={selectedCar.images?.[0] || ''}
                alt={selectedCar.title}
              />
              <h3>{selectedCar.title}</h3>
              <p>{selectedCar.description}</p>
              <div className='small'>
                Mileage: {selectedCar.mileage} • Fuel: {selectedCar.fuel_type} •
                Transmission: {selectedCar.transmission}
              </div>
            </div>
            <div className='panel'>
              <div className='row'>
                <h3>Seller Contact</h3>
                <span className='small'>{selectedCar.status}</span>
              </div>
              <p>
                <strong>{selectedCar.admin_profile?.name}</strong>
              </p>
              <p>{selectedCar.admin_profile?.phone}</p>
              <p>{selectedCar.admin_profile?.email}</p>
              <p>{selectedCar.admin_profile?.location}</p>
              <hr />
              <div className='row'>
                <strong>Current highest</strong>
                <span>KSh {summary?.highest?.toLocaleString() ?? '0'}</span>
              </div>
              <input
                placeholder='Enter bid amount'
                value={bidAmount}
                onChange={event => setBidAmount(event.target.value)}
              />
              <button onClick={() => handleBid()}>Place Bid</button>
              {message && <p className='small'>{message}</p>}
            </div>
          </div>
        </section>
      )}

      {showModal && (
        <div className='modal-backdrop'>
          <div className='modal'>
            <h3>Sign in to place a bid</h3>
            <p className='small'>
              You can continue bidding after authentication without leaving this
              page.
            </p>
            <button onClick={signIn}>Continue with Supabase</button>
            <button className='secondary' onClick={() => setShowModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
