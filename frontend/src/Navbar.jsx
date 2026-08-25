import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function Navbar ({
  brand = 'Pena Auctions',
  links = [],
  ctaLabel,
  onCta,
  ctaClass = 'button button-secondary'
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className='navbar'>
      <div className='navbar-brand'>
        <h1>{brand}</h1>
      </div>

      <button
        type='button'
        className={`nav-toggle ${menuOpen ? 'open' : ''}`}
        onClick={() => setMenuOpen(open => !open)}
        aria-label='Toggle navigation'
        aria-expanded={menuOpen}
      >
        <span />
        <span />
        <span />
      </button>

      <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
        {links.map(link => (
          <Link
            key={link.label}
            to={link.to}
            className='nav-link'
            onClick={() => setMenuOpen(false)}
          >
            {link.label}
          </Link>
        ))}
        {ctaLabel && (
          <button
            type='button'
            className={ctaClass}
            onClick={() => {
              setMenuOpen(false)
              onCta?.()
            }}
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </nav>
  )
}
