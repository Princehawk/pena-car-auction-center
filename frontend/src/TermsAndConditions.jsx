import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router-dom'
import terms from '../../Pena_Car_Auction_Center_Terms_and_Conditions.md?raw'
import './App.css'

export default function TermsAndConditions () {
  return (
    <div className='app-shell'>
      <nav className='navbar'>
        <div className='navbar-brand'>
          <h1>Pena Auctions</h1>
        </div>
        <Link className='button button-secondary' to='/login'>
          Back to sign in
        </Link>
      </nav>

      <main className='terms-page'>
        <header className='terms-header'>
          <p className='eyebrow'>Pena Car Auction Center</p>
          <h2>Terms and Conditions</h2>
          <p className='small'>
            Please read these terms carefully before creating an account.
          </p>
        </header>
        <article className='terms-content'>
          <ReactMarkdown>{terms}</ReactMarkdown>
        </article>
      </main>
    </div>
  )
}
