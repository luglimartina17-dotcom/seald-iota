import { useState, useCallback } from 'react';
import { ConnectButton, useCurrentAccount } from '@iota/dapp-kit';
import { LicenseActions } from './LicenseActions';
import './App.css';

export default function App() {
  const account = useCurrentAccount();
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'verify'>('dashboard');
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  }, []);

  return (
    <>
      {/* â”€â”€â”€ NAVBAR â”€â”€â”€ */}
      <nav>
        <a className="nav-logo" href="#" onClick={(e) => e.preventDefault()}>
          <div className="logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <circle cx="12" cy="16" r="1.5" fill="#fff" />
            </svg>
          </div>
          <div>
            <span className="logo-text">SealD</span>
            <span className="logo-sub">IOTA Â· Move</span>
          </div>
        </a>

        <div className="nav-tabs">
          <button
            className={`nav-tab ${currentPage === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentPage('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`nav-tab ${currentPage === 'verify' ? 'active' : ''}`}
            onClick={() => setCurrentPage('verify')}
          >
            Check
          </button>
        </div>

        <div className="nav-right">
          <span className="iota-badge">IOTA Testnet</span>
          <ConnectButton />
        </div>
      </nav>

      {/* â”€â”€â”€ PAGES â”€â”€â”€ */}
      <LicenseActions
        currentPage={currentPage}
        account={account}
        showToast={showToast}
      />

      {/* â”€â”€â”€ TOAST â”€â”€â”€ */}
      <div className={`toast ${toastVisible ? 'show' : ''}`}>
        <span id="toast-msg">{toastMsg}</span>
      </div>
    </>
  );
}
