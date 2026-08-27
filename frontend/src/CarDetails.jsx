import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import './App.css'
import { io as socketClient } from 'socket.io-client'
import Navbar from './Navbar.jsx'
import ImagePreview from './ImagePreview.jsx'
import AuthModal from './components/AuthModal.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { ToastContainer, toast } from 'react-toastify'

const API_URL = import.meta.env.VITE_API_URL

if (!API_URL) {
  console.error('❌ VITE_API_URL is not defined in the environment variables.')
}
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
if (!SOCKET_URL) {
  console.error(
    '❌ VITE_SOCKET_URL is not defined in the environment variables.'
  )
}

function CarDetails () {
  const { id } = useParams()
  const navigate = useNavigate()
  const [car, setCar] = useState(null)
  const [bidAmount, setBidAmount] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const { session, dbUser, isAuthenticated, isAdmin, signOut } = useAuth()
  const [previewImages, setPreviewImages] = useState([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [biddingAllowed, setBiddingAllowed] = useState(true)
  const [bidMode, setBidMode] = useState('custom')
  const [bidIncrement] = useState('5000')

  useEffect(() => {
    const fetchCar = async () => {
      try {
        const response = await fetch(`${API_URL}/cars/${id}`)
        const data = await response.json()
        if (!response.ok)
          throw new Error(data?.message || 'Unable to load car details')
        setCar(data)
        setSelectedImageIndex(0)
      } catch (error) {
        toast.error(error.message || 'Unable to reach the backend server')
      }
    }
    fetchCar()
  }, [id])

  useEffect(() => {
    const socket = socketClient(SOCKET_URL, {
      auth: { token: session?.access_token }
    })
    socket.on('connect', () => {
      console.log('✅ CarDetails socket connected:', socket.id, SOCKET_URL)
      if (id) socket.emit('joinCar', id)
    })
    socket.on('connect_error', error => {
      console.error('❌ CarDetails socket connection error:', error)
    })
    socket.on('disconnect', reason => {
      console.log('🔌 CarDetails socket disconnected:', reason)
    })
    socket.on('newBid', payload => {
      if (String(payload?.car_id) !== String(id)) return
      setCar(current =>
        current && String(current.id) === String(payload.car_id)
          ? {
              ...current,
              bids: [payload, ...(current.bids || [])]
            }
          : current
      )
    })
    socket.on('bidAccepted', payload => {
      if (String(payload?.car_id) !== String(id)) return
      setCar(current =>
        current && String(current.id) === String(payload.car_id)
          ? {
              ...current,
              bids: current.bids?.some(bid => bid.id === payload.id)
                ? current.bids.map(bid =>
                    bid.id === payload.id ? payload : bid
                  )
                : [payload, ...(current.bids || [])]
            }
          : current
      )
    })

    return () => socket.disconnect()
  }, [id, session?.access_token])

  useEffect(() => {
    if (!session?.access_token) {
      setBiddingAllowed(true)
      return
    }

    const loadEligibility = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        })
        const data = await response.json().catch(() => ({}))
        setBiddingAllowed(Boolean(data?.user?.bidding_allowed))
      } catch (error) {
        setBiddingAllowed(false)
      }
    }

    loadEligibility()
  }, [session])

  const openPreview = index => {
    setPreviewImages(car?.images?.length ? car.images : [])
    setPreviewIndex(index)
    setPreviewVisible(true)
  }

  const handleBid = async () => {
    if (!session) {
      setShowModal(true)
      return
    }

    if (!biddingAllowed) {
      toast.info(
        'Bidding access is pending. Please contact the admin to activate your deposit-based bidding access.'
      )
      return
    }

    try {
      const parsedBid = Number(bidAmount)
      const validBidAmounts = (car?.bids || [])
        .map(bid => Number(bid.bid_amount))
        .filter(value => Number.isFinite(value) && value > 0)
      const priceValue = Number(car?.price)
      const currentHighest = validBidAmounts.length
        ? Math.max(...validBidAmounts)
        : Number.isFinite(priceValue)
        ? priceValue
        : 0

      if (bidMode === 'custom') {
        if (!Number.isFinite(parsedBid) || parsedBid <= 0) {
          throw new Error('Enter a valid bid amount')
        }
      }

      let finalBidAmount = parsedBid
      if (bidMode === 'auto') {
        const autoStep = Number(bidIncrement) || 5000
        if (!Number.isFinite(currentHighest) || currentHighest <= 0) {
          throw new Error('Unable to calculate auto bid amount')
        }
        finalBidAmount = currentHighest + autoStep
      }
      if (!Number.isFinite(finalBidAmount) || finalBidAmount <= 0) {
        throw new Error('Invalid bid amount')
      }

      const response = await fetch(`${API_URL}/bids`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          car_id: car.id,
          bid_amount: finalBidAmount,
          bid_mode: bidMode
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data?.message || 'Failed to place bid')
      toast.success(data.message || 'Bid submitted successfully')
      setBidAmount('')
      setShowModal(false)
    } catch (error) {
      toast.error(error.message || 'Failed to submit your bid')
    }
  }

  const handleBackToCars = () => {
    navigate('/')
    setTimeout(() => {
      document.getElementById('cars')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    }, 180)
  }

  const signIn = () => {
    if (isAuthenticated) {
      toast.info('You are already signed in.')
      return
    }
    setShowModal(true)
  }

  const highestBidRecord = useMemo(() => {
    if (!car?.bids?.length) return null
    return [...car.bids]
      .filter(bid => !['Outbid', 'Won'].includes(bid.status))
      .sort(
        (first, second) =>
          Number(second.bid_amount) - Number(first.bid_amount) ||
          new Date(second.created_at) - new Date(first.created_at)
      )[0]
  }, [car])

  const highestBid = highestBidRecord?.bid_amount || car?.price
  const isCurrentHighestBidder = Boolean(
    session &&
      !isAdmin &&
      dbUser?.id &&
      highestBidRecord?.user_id &&
      Number(highestBidRecord.user_id) === Number(dbUser.id) &&
      car.status === 'Available'
  )

  const isBidLocked = !session || !biddingAllowed

  if (!car)
    return (
      <div className='detail-page'>
        <p>Loading...</p>
      </div>
    )

  const images = car.images?.length ? car.images : []
  const selectedImage = images[selectedImageIndex] || ''

  return (
    <div className='app-shell'>
      <Navbar
        brand='Pena Auctions'
        links={[
          { label: 'Back to cars', to: '/' },
          ...(isAdmin ? [{ label: 'Admin', to: '/admin' }] : [])
        ]}
        ctaLabel={isAuthenticated ? 'Logout' : undefined}
        onCta={isAuthenticated ? () => signOut() : undefined}
      />

      <section className='detail-page'>
        <div className='detail-grid'>
          <div className='detail-main'>
            <div className='detail-top-actions'>
              <button
                type='button'
                className='button button-secondary'
                onClick={handleBackToCars}
              >
                Back to cars
              </button>
            </div>
            <button
              type='button'
              className='image-button large'
              onClick={() => openPreview(selectedImageIndex)}
            >
              <img className='image-main' src={selectedImage} alt={car.title} />
            </button>

            <div className='thumbnails'>
              {images.map((image, index) => (
                <button
                  type='button'
                  key={`${image}-${index}`}
                  className={`thumb ${
                    selectedImageIndex === index ? 'active' : ''
                  }`}
                  onClick={() => setSelectedImageIndex(index)}
                >
                  <img src={image} alt={`Thumbnail ${index + 1}`} />
                </button>
              ))}
            </div>

            <div className='detail-info'>
              <div className='row detail-header'>
                <div>
                  <h2>{car.title}</h2>
                  <p className='small muted'>
                    {car.brand} • {car.model} • {car.year}
                  </p>
                </div>
                <span className='badge'>{car.status}</span>
              </div>
              <p className='detail-description'>{car.description}</p>
              <div className='info-grid'>
                <div className='info-stat'>
                  <span>Mileage</span>
                  <strong>{car.mileage?.toLocaleString() || 'N/A'} km</strong>
                </div>
                <div className='info-stat'>
                  <span>Fuel</span>
                  <strong>{car.fuel_type}</strong>
                </div>
                <div className='info-stat'>
                  <span>Transmission</span>
                  <strong>{car.transmission}</strong>
                </div>
                <div className='info-stat'>
                  <span>Engine</span>
                  <strong>{car.engine || '—'}</strong>
                </div>
                <div className='info-stat'>
                  <span>Color</span>
                  <strong>{car.color || '—'}</strong>
                </div>
                <div className='info-stat'>
                  <span>Condition</span>
                  <strong>{car.condition || car.car_condition || '—'}</strong>
                </div>
                <div className='info-stat'>
                  <span>Price</span>
                  <strong>KSh {Number(car.price || 0).toLocaleString()}</strong>
                </div>
                <div className='info-stat'>
                  <span>Expiry</span>
                  <strong>
                    {car.expiry_at
                      ? new Date(car.expiry_at).toLocaleString()
                      : '—'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <aside className='detail-aside'>
            <div className='info-card'>
              <div className='row detail-header'>
                <h3>Seller Details</h3>
                <span className='small muted'>
                  {car.admin_profile?.location}
                </span>
              </div>
              <p>
                <strong>{car.admin_profile?.name}</strong>
              </p>
              <p>{car.admin_profile?.phone}</p>
              <p>{car.admin_profile?.email}</p>
              <p>{car.admin_profile?.whatsapp}</p>
            </div>

            <div className='info-card'>
              <div className='row detail-header'>
                <h3>Bid Summary</h3>
                <span className='small muted'>Current highest</span>
              </div>
              <div className='price large'>
                KSh {Number(highestBid || 0).toLocaleString()}
              </div>
              {isCurrentHighestBidder && (
                <p className='current-highest-message'>
                  <i className='fa fa-check-circle' aria-hidden='true' /> You
                  are currently the highest bidder.
                </p>
              )}
              {isBidLocked ? (
                <div className='locked-bid-block'>
                  <p className='small status-text'>
                    Deposit-based bidding requires admin approval before your
                    first bid. Pay the deposit to unlock bidding.
                  </p>
                  <div className='payment-box'>
                    <h4>
                      In order to place an Offer, please pay your refundable
                      deposit via MPESA:
                    </h4>
                    <p>Paybill No-4079527</p>
                    <p>Account-Your ID/Passport Number</p>
                    <p>Amount-KSH 5 000</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className='controls'>
                    <select
                      value={bidMode}
                      onChange={event => setBidMode(event.target.value)}
                    >
                      <option value='custom'>Custom</option>
                      <option value='auto'>Auto</option>
                    </select>
                  </div>
                  {bidMode === 'auto' ? (
                    <div className='locked-bid-block'>
                      <p className='small status-text'>
                        Auto bidding will place the next bid at KSh{' '}
                        {(
                          (Number(highestBid) || Number(car?.price || 0)) + 5000
                        ).toLocaleString()}
                        .
                      </p>
                      <button className='button' onClick={handleBid}>
                        Place Bid
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type='number'
                        min='1000'
                        step='1000'
                        placeholder='Enter bid amount'
                        value={bidAmount}
                        onChange={event => setBidAmount(event.target.value)}
                      />
                      <button className='button' onClick={handleBid}>
                        Place Bid
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      </section>

      <AuthModal
        open={showModal}
        onClose={() => setShowModal(false)}
        redirectTo={`/cars/${id}`}
      />

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

export default CarDetails
