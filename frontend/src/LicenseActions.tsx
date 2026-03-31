import { useState, useEffect } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@iota/dapp-kit';
import { Transaction } from '@iota/iota-sdk/transactions';
import { IotaClient, getFullnodeUrl } from '@iota/iota-sdk/client';
import { PACKAGE_ID, REGISTRY_ID, BACKEND_URL, CLOCK_ID } from './iotaConfig';

/* â”€â”€â”€ Types â”€â”€â”€ */
type ObjectChange = {
  type?: string;
  objectType?: string;
  objectId?: string;
};

type TxResult = {
  digest: string;
  objectChanges?: ObjectChange[];
};

type LicenseRow = {
  id: number;
  product_id: string;
  license_key: string;
  vendor_wallet: string;
  owner_wallet: string;
  status: string;
  onchain_license_id: string;
  expiry_date: string;
  max_devices: number;
  current_devices: number;
  revoked: boolean;
  tx_digest: string;
};

type CheckResult = {
  found: boolean;
  valid: boolean;
  status: string;
  onchain_license_id?: string;
  product_id?: string;
  vendor_wallet?: string;
  owner_wallet?: string;
  activated?: boolean;
  revoked?: boolean;
  expiry_date?: number;
  reason?: string;
};

type VerifyHistory = {
  key: string;
  product: string;
  valid: boolean;
  time: string;
};

interface Props {
  currentPage: 'dashboard' | 'verify';
  account: ReturnType<typeof useCurrentAccount>;
  showToast: (msg: string) => void;
}

export function LicenseActions({ currentPage, account, showToast }: Props) {
  const { mutateAsync: signAndExecuteTransaction } =
    useSignAndExecuteTransaction();

  /* â”€â”€â”€ Dashboard State â”€â”€â”€ */
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Form - Register Vendor
  const [companyName, setCompanyName] = useState('');

  // Form - Mint License
  const [productId, setProductId] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [expiryDate, setExpiryDate] = useState('0');
  const [maxDevices, setMaxDevices] = useState('1');

  // Actions
  const [licenseObjectId, setLicenseObjectId] = useState('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [mintingKey, setMintingKey] = useState('');
  const [minting, setMinting] = useState(false);

  /* â”€â”€â”€ Verify State â”€â”€â”€ */
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<CheckResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyHistory, setVerifyHistory] = useState<VerifyHistory[]>(() => {
    try {
      const saved = localStorage.getItem('licensechain_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  /* â”€â”€â”€ Load licenses from backend â”€â”€â”€ */
  useEffect(() => {
    fetchLicenses();
  }, []);

  async function fetchLicenses() {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/license/check/all`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLicenses(data);
        }
      }
    } catch {
      // Backend offline â€” OK, tabella vuota
    } finally {
      setLoading(false);
    }
  }

  /* â”€â”€â”€ Stats â”€â”€â”€ */
  const totalCount = licenses.length;
  const mintedCount = licenses.filter(
    (l) => l.status === 'minted' || l.status === 'activated'
  ).length;
  const pendingCount = licenses.filter((l) => l.status === 'submitted').length;

  /* â”€â”€â”€ Clipboard â”€â”€â”€ */
  function copyKey(text: string) {
    navigator.clipboard.writeText(text).then(() => showToast('âœ“ Copied: ' + text));
  }

  /* â”€â”€â”€ Register Vendor â”€â”€â”€ */
  async function registerVendor() {
    if (!account) { showToast('âš  Connect your wallet'); return; }
    if (!companyName.trim()) { showToast('âš  Enter your company name'); return; }
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::software_license::register_vendor`,
        arguments: [
          tx.object(REGISTRY_ID),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(companyName))),
          tx.object(CLOCK_ID),
        ],
      });

      const result = (await signAndExecuteTransaction({
        transaction: tx,
      })) as TxResult;

      await fetch(`${BACKEND_URL}/vendor/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: account.address,
          company_name: companyName,
          tx_digest: result.digest,
        }),
      });

      showToast(`âœ“ Vendor registered! Digest: ${result.digest.slice(0, 16)}...`);
      setCompanyName('');
    } catch (error) {
      console.error('Error registerVendor:', error);
      showToast('âš  Vendor registration Error');
    }
  }

  /* â”€â”€â”€ Mint License â”€â”€â”€ */
  async function mintLicense() {
    if (!account) { showToast('âš  Connect your wallet'); return; }
    if (!productId.trim() || !licenseKey.trim() || !activationCode.trim()) {
      showToast('âš  Please fill in all fields');
      return;
    }
    setMinting(true);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::software_license::mint_license`,
        arguments: [
          tx.object(REGISTRY_ID),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(productId))),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(licenseKey))),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(activationCode))),
          tx.pure.u64(BigInt(expiryDate)),
          tx.pure.u8(Number(maxDevices)),
          tx.object(CLOCK_ID),
        ],
      });

      const result = (await signAndExecuteTransaction({
        transaction: tx,
      })) as TxResult;

      const client = new IotaClient({ url: getFullnodeUrl('testnet') });
      const txDetails = await client.getTransactionBlock({
        digest: result.digest,
        options: { showObjectChanges: true },
      });

      const createdLicense = txDetails.objectChanges?.find((change) => {
        return (
          change.type === 'created' &&
          typeof change.objectType === 'string' &&
          change.objectType.endsWith('::software_license::SoftwareLicense')
        );
      });

      const onchainLicenseId =
        createdLicense && 'objectId' in createdLicense
          ? (createdLicense as { objectId: string }).objectId
          : null;

      if (onchainLicenseId) {
        await fetch(`${BACKEND_URL}/license/mint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: account.address,
            tx_digest: result.digest,
            onchain_license_id: onchainLicenseId,
            product_id: productId,
            license_key: licenseKey,
            expiry_date: Number(expiryDate),
            max_devices: Number(maxDevices),
          }),
        });
        setLicenseObjectId(onchainLicenseId);
        showToast(`âœ“ Right minted successfully! ID: ${onchainLicenseId.slice(0, 16)}...`);
      } else {
        showToast(`âœ“ Mint complete! Digest: ${result.digest.slice(0, 16)}...`);
      }

      setProductId('');
      setLicenseKey('');
      setActivationCode('');
      setExpiryDate('0');
      setMaxDevices('1');
      setFormOpen(false);
      fetchLicenses();
    } catch (error) {
      console.error('Error mintRight:', error);
      showToast('âš  Error during mint');
    } finally {
      setMinting(false);
    }
  }

  /* â”€â”€â”€ Activate License â”€â”€â”€ */
  async function activateLicense() {
    if (!account) { showToast('âš  Connect your wallet'); return; }
    if (!licenseObjectId) { showToast('âš  Enter a right object ID'); return; }
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::software_license::activate_license`,
        arguments: [
          tx.object(licenseObjectId),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(activationCode))),
          tx.object(CLOCK_ID),
        ],
      });

      const result = (await signAndExecuteTransaction({
        transaction: tx,
      })) as TxResult;

      await fetch(`${BACKEND_URL}/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: account.address,
          tx_digest: result.digest,
          onchain_license_id: licenseObjectId,
        }),
      });

      showToast(`âœ“ Right activated successfully! Digest: ${result.digest.slice(0, 16)}...`);
      fetchLicenses();
    } catch (error) {
      console.error('Error activateRight:', error);
      showToast('âš  Activation Error');
    }
  }

  /* â”€â”€â”€ Revoke License â”€â”€â”€ */
  async function revokeLicense() {
    if (!account) { showToast('âš  Connect your wallet'); return; }
    if (!licenseObjectId) { showToast('âš  Enter a right object ID'); return; }
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::software_license::revoke_license`,
        arguments: [tx.object(licenseObjectId), tx.object(CLOCK_ID)],
      });

      const result = (await signAndExecuteTransaction({
        transaction: tx,
      })) as TxResult;

      await fetch(`${BACKEND_URL}/license/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: account.address,
          tx_digest: result.digest,
          onchain_license_id: licenseObjectId,
        }),
      });

      showToast(`âœ“ Right revoked! Digest: ${result.digest.slice(0, 16)}...`);
      fetchLicenses();
    } catch (error) {
      console.error('Error revokeRight:', error);
      showToast('âš  Revoke Error');
    }
  }

  /* â”€â”€â”€ Verify License â”€â”€â”€ */
  async function verifyLicense() {
    const input = verifyInput.trim();
    if (!input) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/license/check/${input}`);
      if (res.ok) {
        const data: CheckResult = await res.json();
        setVerifyResult(data);

        const now = new Date();
        const time =
          now.toLocaleDateString('it-IT') +
          ' ' +
          now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const entry: VerifyHistory = {
          key: input,
          product: data.product_id || 'â€”',
          valid: data.valid,
          time,
        };
        const newHistory = [entry, ...verifyHistory].slice(0, 50);
        setVerifyHistory(newHistory);
        localStorage.setItem('licensechain_history', JSON.stringify(newHistory));
      } else {
        setVerifyResult({
          found: false,
          valid: false,
          status: 'not_found',
          reason: 'Right not found',
        });
      }
    } catch {
      showToast('âš  Backend unreachable');
    } finally {
      setVerifyLoading(false);
    }
  }

  /* â”€â”€â”€ Status badge helper â”€â”€â”€ */
  function statusClass(status: string, revoked: boolean): string {
    if (revoked) return 'status revoked';
    switch (status) {
      case 'minted':
        return 'status minted';
      case 'activated':
        return 'status active-status';
      case 'submitted':
        return 'status pending';
      default:
        return 'status';
    }
  }

  function statusLabel(status: string, revoked: boolean): string {
    if (revoked) return 'Revoked';
    switch (status) {
      case 'minted':
        return 'Minted';
      case 'activated':
        return 'Activated';
      case 'submitted':
        return 'Submitted';
      default:
        return status;
    }
  }

  function truncHash(h: string): string {
    if (!h || h === 'â€”') return 'â€”';
    if (h.length > 16) return h.slice(0, 8) + '...' + h.slice(-4);
    return h;
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     RENDER
     â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  return (
    <>
      {/* â•â•â•â•â•â•â•â•â•â•â•â• DASHBOARD PAGE â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className={`page ${currentPage === 'dashboard' ? 'active' : ''}`}>
        <div className="container">
          {/* Header */}
          <div className="section-header">
            <div>
              <div className="section-title">
                Dashboard <span>Vendor</span>
              </div>
              <div className="section-desc">// IOTA blockchain Â· right management</div>
            </div>
          </div>

          {!account ? (
            <div className="wallet-prompt">
              Connect your IOTA wallet to manage your rights.
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="stats-row">
                <div className="stat-card" style={{ animationDelay: '0s' }}>
                  <div className="stat-label">Total Rights</div>
                  <div className="stat-value">{totalCount}</div>
                </div>
                <div className="stat-card" style={{ animationDelay: '0.07s' }}>
                  <div className="stat-label">Minted on Blockchain</div>
                  <div className="stat-value green">{mintedCount}</div>
                </div>
                <div className="stat-card" style={{ animationDelay: '0.14s' }}>
                  <div className="stat-label">Mint Pending</div>
                  <div className="stat-value yellow">{pendingCount}</div>
                </div>
              </div>

              {/* License Table */}
              <div className="table-wrap">
                <div className="table-header">
                  <span className="table-title">Right Management</span>
                  <span className="tag">Create and mint your rights on blockchain</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Right Key</th>
                      <th>Owner</th>
                      <th>Status</th>
                      <th>Blockchain Hash</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="loading-row">
                            <span className="spinner" /> Loading...
                          </div>
                        </td>
                      </tr>
                    ) : licenses.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="loading-row">
                            No right found. Create your first one using the form below.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      licenses.map((l) => (
                        <tr key={l.id || l.onchain_license_id}>
                          <td>{l.product_id}</td>
                          <td>
                            <span className="key-badge">
                              {l.license_key}{' '}
                              <button onClick={() => copyKey(l.license_key)}>âŽ˜</button>
                            </span>
                          </td>
                          <td>
                            <span className="hash">
                              {truncHash(l.owner_wallet)}
                            </span>
                          </td>
                          <td>
                            <span className={statusClass(l.status, l.revoked)}>
                              {statusLabel(l.status, l.revoked)}
                            </span>
                          </td>
                          <td>
                            <span className="hash">
                              {truncHash(l.onchain_license_id)}{' '}
                              {l.onchain_license_id && l.onchain_license_id !== 'â€”' && (
                                <button onClick={() => copyKey(l.onchain_license_id)}>
                                  âŽ˜
                                </button>
                              )}
                            </span>
                          </td>
                          <td>
                            <div className="action-row">
                              {l.status === 'submitted' ? (
                                <button className="btn btn-mint" onClick={() => {
                                  setMintingKey(l.license_key);
                                  setModalOpen(true);
                                }}>
                                  â¬¡ Mint
                                </button>
                              ) : !l.revoked && l.status !== 'activated' ? (
                                <button
                                  className="btn btn-ghost"
                                  onClick={() => {
                                    setLicenseObjectId(l.onchain_license_id);
                                    setActivationCode('');
                                  }}
                                >
                                  Active
                                </button>
                              ) : (
                                <button className="btn btn-completed">âœ“ Complete</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* â”€â”€â”€ Register Vendor Section â”€â”€â”€ */}
              <div className="create-panel" style={{ marginBottom: 24 }}>
                <div className="create-panel-header">
                  <div>
                    <div className="table-title">Register Vendor</div>
                    <div className="section-desc" style={{ marginTop: 2 }}>
                      // register company on IOTA blockchain
                    </div>
                  </div>
                </div>
                <div className="create-panel-body open">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Company name</label>
                      <input
                        className="form-input"
                        placeholder="es. MioSoftware Srl"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary" onClick={registerVendor}>
                        Register Vendor
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* â”€â”€â”€ Create (Mint) License Panel â”€â”€â”€ */}
              <div className="create-panel">
                <div className="create-panel-header">
                  <div>
                    <div className="table-title">+ Create New Right</div>
                    <div className="section-desc" style={{ marginTop: 2 }}>
                      // generate and register on IOTA blockchain 
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={() => setFormOpen(!formOpen)}>
                    {formOpen ? 'Chiudi' : 'Apri Form'}
                  </button>
                </div>
                <div className={`create-panel-body ${formOpen ? 'open' : ''}`}>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Product ID</label>
                      <input
                        className="form-input"
                        placeholder="es. software-pro-2025"
                        value={productId}
                        onChange={(e) => setProductId(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Right Key</label>
                      <input
                        className="form-input"
                        placeholder="es. SP25-XXXX-YYYY-ZZZZ"
                        value={licenseKey}
                        onChange={(e) => setLicenseKey(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Activation Code</label>
                      <input
                        className="form-input"
                        placeholder="Codice segreto di attivazione"
                        value={activationCode}
                        onChange={(e) => setActivationCode(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Expiry Date (ms, 0 = none)</label>
                      <input
                        className="form-input"
                        placeholder="0"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Max Devices</label>
                      <input
                        className="form-input"
                        placeholder="1"
                        value={maxDevices}
                        onChange={(e) => setMaxDevices(e.target.value)}
                      />
                    </div>
                    <div className="form-group" />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button
                      className="btn btn-primary"
                      onClick={mintLicense}
                      disabled={minting}
                    >
                      {minting ? (
                        <>
                          <span className="spinner" /> Mining...
                        </>
                      ) : (
                        'â¬¡ Mint Right'
                      )}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setFormOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>

              {/* â”€â”€â”€ License Actions (Activate / Revoke / Check) â”€â”€â”€ */}
              {licenseObjectId && (
                <div className="create-panel" style={{ marginTop: 24 }}>
                  <div className="create-panel-header">
                    <div>
                      <div className="table-title">Right Actions</div>
                      <div className="section-desc" style={{ marginTop: 2 }}>
                        // activate, revoke or verify a right 
                      </div>
                    </div>
                  </div>
                  <div className="create-panel-body open">
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Right Object ID</label>
                        <input
                          className="form-input"
                          placeholder="0x..."
                          value={licenseObjectId}
                          onChange={(e) => setLicenseObjectId(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Activation Code (to activate)</label>
                        <input
                          className="form-input"
                          placeholder="secret code"
                          value={activationCode}
                          onChange={(e) => setActivationCode(e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <button className="btn btn-primary" onClick={activateLicense}>
                        Activate Right
                      </button>
                      <button className="btn btn-danger" onClick={revokeLicense}>
                        Revoke Right
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â• VERIFY PAGE â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className={`page ${currentPage === 'verify' ? 'active' : ''}`}>
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-title">
                Verify <span>Right</span>
              </div>
              <div className="section-desc">
                // check the authenticity on the IOTA blockchain
              </div>
            </div>
          </div>

          {/* Verify Hero */}
          <div className="verify-hero">
            <div className="verify-title">Verify Right</div>
            <div className="verify-desc">
              Enter the on-chain right ID to verify its validity
              on the blockchain
            </div>
            <div className="verify-input-row">
              <input
                className="verify-input"
                placeholder="ex. 0x831ad445..."
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') verifyLicense();
                }}
              />
              <button
                className="btn btn-primary"
                onClick={verifyLicense}
                disabled={verifyLoading}
                style={{ padding: '12px 24px', fontSize: 14 }}
              >
                {verifyLoading ? (
                  <>
                    <span className="spinner" /> ...
                  </>
                ) : (
                  'Verify'
                )}
              </button>
            </div>
          </div>

          {/* Result */}
          {verifyResult && (
            <div
              className={`verify-result show ${
                verifyResult.valid ? 'valid' : 'invalid'
              }`}
            >
              <div className="result-header">
                <div
                  className={`result-icon ${
                    verifyResult.valid ? 'valid' : 'invalid'
                  }`}
                >
                  {verifyResult.valid ? 'âœ“' : 'âœ—'}
                </div>
                <div>
                  <div
                    className={`result-title ${
                      verifyResult.valid ? 'valid' : 'invalid'
                    }`}
                  >
                    {verifyResult.valid ? 'Valid Right' : 'Invalid Right'}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      color: 'var(--muted)',
                      marginTop: 2,
                    }}
                  >
                    {verifyResult.valid
                      ? 'Verification on IOTA blockchain completed'
                      : verifyResult.reason || 'No matches found'}
                  </div>
                </div>
              </div>
              {verifyResult.found && (
                <div className="result-grid">
                  <div className="result-field">
                    <div className="result-field-label">Product</div>
                    <div className="result-field-value">
                      {verifyResult.product_id || 'â€”'}
                    </div>
                  </div>
                  <div className="result-field">
                    <div className="result-field-label">Status</div>
                    <div
                      className="result-field-value"
                      style={{
                        color: verifyResult.valid
                          ? 'var(--accent)'
                          : 'var(--red)',
                      }}
                    >
                      {verifyResult.status}
                    </div>
                  </div>
                  <div className="result-field">
                    <div className="result-field-label">Owner</div>
                    <div className="result-field-value">
                      {verifyResult.owner_wallet || 'â€”'}
                    </div>
                  </div>
                  <div className="result-field">
                    <div className="result-field-label">Vendor</div>
                    <div className="result-field-value">
                      {verifyResult.vendor_wallet || 'â€”'}
                    </div>
                  </div>
                  <div className="result-field" style={{ gridColumn: '1 / -1' }}>
                    <div className="result-field-label">On-chain ID</div>
                    <div className="result-field-value">
                      {verifyResult.onchain_license_id || 'â€”'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recent Verifications */}
          {verifyHistory.length > 0 && (
            <div>
              <div className="table-title" style={{ marginBottom: 16 }}>
                Recent Checks
              </div>
              <div className="history-list">
                {verifyHistory.map((h, i) => (
                  <div
                    className="history-item"
                    key={`${h.key}-${i}`}
                    style={{ animationDelay: `${i * 0.07}s` }}
                  >
                    <span
                      className={h.valid ? 'status minted' : 'status revoked'}
                    >
                      {h.valid ? 'Valid' : 'Invalid'}
                    </span>
                    <span className="history-key">{truncHash(h.key)}</span>
                    <span className="history-product">{h.product}</span>
                    <span className="history-time">{h.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â• MINT MODAL â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className={`modal-overlay ${modalOpen ? 'show' : ''}`}>
        <div className="modal">
          <div className="modal-title">â¬¡ Confirm Mint</div>
          <div className="modal-desc">
            // Sending TX to IOTA blockchain...
          </div>
          <div className="modal-body">
            <div className="modal-body-label">KEY</div>
            <div className="modal-body-value">{mintingKey}</div>
            <div className="modal-body-label" style={{ marginTop: 8 }}>
              NETWORK
            </div>
            <div>IOTA Testnet Â· Move VM</div>
            <div className="modal-body-label" style={{ marginTop: 8 }}>
              ESTIMATED GAS
            </div>
            <div>~0.001 MIOTA</div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setModalOpen(false);
                mintLicense();
              }}
            >
              Confirm Mint
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
