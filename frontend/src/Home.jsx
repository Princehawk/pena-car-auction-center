import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'
import Navbar from './Navbar.jsx'
import ImagePreview from './ImagePreview.jsx'
import AuthModal from './components/AuthModal.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { ToastContainer, toast } from 'react-toastify'

const API_URL = import.meta.env.VITE_API_URL || window.location.origin

const formatCountdown = expiryAt => {
  if (!expiryAt) return ''
  const difference = new Date(expiryAt) - new Date()
  if (difference <= 0) return 'Expired'
  const days = Math.floor(difference / (1000 * 60 * 60 * 24))
  const hours = Math.floor((difference / (1000 * 60 * 60)) % 24)
  const minutes = Math.floor((difference / (1000 * 60)) % 60)
  return `${days}d ${hours}h ${minutes}m left`
}

function Home () {
  const [cars, setCars] = useState([])
  const [filters, setFilters] = useState({
    search: '',
    brand: '',
    year: '',
    fuel_type: '',
    transmission: '',
    status: '',
    sort: 'newest'
  })
  const [loading, setLoading] = useState(true)
  const [previewImages, setPreviewImages] = useState([])
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const { session, isAuthenticated, isAdmin, signOut } = useAuth()
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewVisible, setPreviewVisible] = useState(false)

  const openPreview = (images, index = 0) => {
    setPreviewImages(images)
    setPreviewIndex(index)
    setPreviewVisible(true)
  }

  const fetchCars = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '12',
        ...filters,
        sort: filters.sort
      })
      const response = await fetch(`${API_URL}/cars?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data?.message || 'Unable to load cars')
      setCars(data.cars || [])
    } catch (error) {
      setCars([])
      toast.error(error.message || 'Unable to reach the backend server')
    } finally {
      setLoading(false)
    }
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

  const navigate = useNavigate()
  const statusText = useMemo(
    () => (isAuthenticated ? 'Signed in' : 'Guest'),
    [isAuthenticated]
  )

  return (
    <div className='app-shell'>
      <Navbar
        brand='Pena Auctions'
        links={[
          { label: 'Browse Cars', to: '/' },
          ...(isAdmin ? [{ label: 'Admin', to: '/admin' }] : [])
        ]}
        ctaLabel={isAuthenticated ? 'Logout' : 'Login'}
        onCta={isAuthenticated ? () => signOut() : () => setAuthModalOpen(true)}
        ctaClass={isAuthenticated ? 'button button-secondary' : 'button'}
      />

      <section className='hero'>
        <div className='hero-card'>
          <h2>Premium cars, simple bidding</h2>
          <p className='small'>
            Browse listings, inspect details, and contact the seller directly.
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
          <p className='small status-text'>{statusText}</p>
        </div>
      </section>

      <section id='cars' className='grid'>
        {loading ? (
          <p>Loading...</p>
        ) : cars.length ? (
          cars.map(car => {
            const images = car.images?.length ? car.images : []
            return (
              <article key={car.id} className='card'>
                <button
                  type='button'
                  className='image-button'
                  onClick={() => openPreview(images, 0)}
                >
                  <img src={images[0]} alt={car.title} />
                </button>
                <div className='card-body'>
                  <div className='row'>
                    <strong>{car.title}</strong>
                    <span className='small badge'>{car.status}</span>
                  </div>
                  <div className='small'>
                    {car.brand} • {car.model} • {car.year}
                  </div>
                  <div className='price'>KSh {car.price.toLocaleString()}</div>
                  {car.expiry_at ? (
                    <div className='small'>
                      <i className='fa fa-clock' />{' '}
                      {formatCountdown(car.expiry_at)}
                    </div>
                  ) : null}
                  <a
                    className='button button-secondary button-block'
                    href={`/cars/${car.id}`}
                  >
                    View Details
                  </a>
                </div>
              </article>
            )
          })
        ) : (
          <div className='empty-state'>
            <p>No cars found. Try a different search or filter.</p>
          </div>
        )}
      </section>

      <ImagePreview
        images={previewImages}
        currentIndex={previewIndex}
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        onPrev={() =>
          setPreviewIndex(index =>
            index === 0 ? previewImages.length - 1 : index - 1
          )
        }
        onNext={() =>
          setPreviewIndex(index =>
            index === previewImages.length - 1 ? 0 : index + 1
          )
        }
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        redirectTo='/'
      />

      <ToastContainer
        position='top-right'
        autoClose={3500}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme='light'
      />
    </div>
  )
}

export default Home
