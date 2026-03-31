import { useState, useEffect } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@iota/dapp-kit';
import { Transaction } from '@iota/iota-sdk/transactions';
import { IotaClient, getFullnodeUrl } from '@iota/iota-sdk/client';
import { PACKAGE_ID, REGISTRY_ID, BACKEND_URL, CLOCK_ID } from './iotaConfig';

/* --- Types --- */
type ObjectChange = {
  type?: string;
  objectType?: string;
  objectId?: string;
};

type TxResult = {
  digest: string;
  objectChanges?: ObjectChange[];
};

type RightRow = {
  id: number;
  product_id: string;
  right_key: string;
  vendor_wallet: string;
  owner_wallet: string;
  status: string;
  onchain_right_id: string;
  expiry_date: string;
  max_devices: number;
  current_devices: number;
  revoked: boolean;
  tx_digest: string;
};

interface Props {
  account: ReturnType<typeof useCurrentAccount>;
  showToast: (msg: string) => void;
}

export function DashboardPage({ account, showToast }: Props) {
  const { mutateAsync: signAndExecuteTransaction } =
    useSignAndExecuteTransaction();

  /* --- State --- */
  const [rights, setRights] = useState<RightRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Form - Register Vendor
  const [companyName, setCompanyName] = useState('');

  // Form - Mint Right
  const [productId, setProductId] = useState('');
  const [rightKey, setRightKey] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [expiryDate, setExpiryDate] = useState('0');
  const [maxDevices, setMaxDevices] = useState('1');

  // Actions
  const [rightObjectId, setRightObjectId] = useState('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [mintingKey, setMintingKey] = useState('');
  const [minting, setMinting] = useState(false);

  /* --- Load rights --- */
  useEffect(() => {
    fetchRights();
  }, []);

  async function fetchRights() {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/right/check/all`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setRights(data);
      }
    } catch {
      // Backend offline
    } finally {
      setLoading(false);
    }
  }

  /* --- Stats --- */
  const totalCount = rights.length;
  const mintedCount = rights.filter(
    (r) => r.status === 'minted' || r.status === 'activated'
  ).length;
  const pendingCount = rights.filter((r) => r.status === 'submitted').length;

  /* --- Clipboard --- */
  function copyKey(text: string) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied: ' + text));
  }

  /* --- Register Vendor --- */
  async function registerVendor() {
    if (!account) { showToast('Connect your wallet'); return; }
    if (!companyName.trim()) { showToast('Enter your company name'); return; }
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::digital_rights::register_vendor`,
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

      showToast(`Vendor registered! Digest: ${result.digest.slice(0, 16)}...`);
      setCompanyName('');
    } catch (error) {
      console.error('Error registerVendor:', error);
      showToast('Vendor registration Error');
    }
  }

  /* --- Mint Right --- */
  async function mintRight() {
    if (!account) { showToast('Connect your wallet'); return; }
    if (!productId.trim() || !rightKey.trim() || !activationCode.trim()) {
      showToast('Please fill in all fields');
      return;
    }
    setMinting(true);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::digital_rights::mint_right`,
        arguments: [
          tx.object(REGISTRY_ID),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(productId))),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(rightKey))),
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

      const createdRight = txDetails.objectChanges?.find((change) => {
        return (
          change.type === 'created' &&
          typeof change.objectType === 'string' &&
          change.objectType.endsWith('::digital_rights::DigitalRight')
        );
      });

      const onchainRightId =
        createdRight && 'objectId' in createdRight
          ? (createdRight as { objectId: string }).objectId
          : null;

      if (onchainRightId) {
        await fetch(`${BACKEND_URL}/right/mint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: account.address,
            tx_digest: result.digest,
            onchain_right_id: onchainRightId,
            product_id: productId,
            right_key: rightKey,
            expiry_date: Number(expiryDate),
            max_devices: Number(maxDevices),
          }),
        });
        setRightObjectId(onchainRightId);
        showToast(`Right minted successfully! ID: ${onchainRightId.slice(0, 16)}...`);
      } else {
        showToast(`Mint complete! Digest: ${result.digest.slice(0, 16)}...`);
      }

      setProductId('');
      setRightKey('');
      setActivationCode('');
      setExpiryDate('0');
      setMaxDevices('1');
      setFormOpen(false);
      fetchRights();
    } catch (error) {
      console.error('Error mintRight:', error);
      showToast('Error during mint');
    } finally {
      setMinting(false);
    }
  }

  /* --- Activate Right --- */
  async function activateRight() {
    if (!account) { showToast('Connect your wallet'); return; }
    if (!rightObjectId) { showToast('Enter a right object ID'); return; }
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::digital_rights::activate_right`,
        arguments: [
          tx.object(rightObjectId),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(activationCode))),
          tx.object(CLOCK_ID),
        ],
      });

      const result = (await signAndExecuteTransaction({
        transaction: tx,
      })) as TxResult;

      await fetch(`${BACKEND_URL}/right/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: account.address,
          tx_digest: result.digest,
          onchain_right_id: rightObjectId,
        }),
      });

      showToast(`Right activated successfully! Digest: ${result.digest.slice(0, 16)}...`);
      fetchRights();
    } catch (error) {
      console.error('Error activateRight:', error);
      showToast('Activation Error');
    }
  }

  /* --- Revoke Right --- */
  async function revokeRight() {
    if (!account) { showToast('Connect your wallet'); return; }
    if (!rightObjectId) { showToast('Enter a right object ID'); return; }
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::digital_rights::revoke_right`,
        arguments: [tx.object(rightObjectId), tx.object(CLOCK_ID)],
      });

      const result = (await signAndExecuteTransaction({
        transaction: tx,
      })) as TxResult;

      await fetch(`${BACKEND_URL}/right/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: account.address,
          tx_digest: result.digest,
          onchain_right_id: rightObjectId,
        }),
      });

      showToast(`Right revoked! Digest: ${result.digest.slice(0, 16)}...`);
      fetchRights();
    } catch (error) {
      console.error('Error revokeRight:', error);
      showToast('Revoke Error');
    }
  }

  /* --- Helpers --- */
  function statusClass(status: string, revoked: boolean): string {
    if (revoked) return 'status revoked';
    switch (status) {
      case 'minted': return 'status minted';
      case 'activated': return 'status active-status';
      case 'submitted': return 'status pending';
      default: return 'status';
    }
  }

  function statusLabel(status: string, revoked: boolean): string {
    if (revoked) return 'Revoked';
    switch (status) {
      case 'minted': return 'Minted';
      case 'activated': return 'Activated';
      case 'submitted': return 'Submitted';
      default: return status;
    }
  }

  function truncHash(h: string): string {
    if (!h || h === '\u2014') return '\u2014';
    if (h.length > 16) return h.slice(0, 8) + '...' + h.slice(-4);
    return h;
  }

  return (
    <>
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <div>
            <div className="section-title">
              Dashboard <span>Vendor</span>
            </div>
            <div className="section-desc">// IOTA blockchain · right management</div>
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

            {/* Right Table */}
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
                  ) : rights.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="loading-row">
                          No right found. Create your first one using the form below.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rights.map((r) => (
                      <tr key={r.id || r.onchain_right_id}>
                        <td>{r.product_id}</td>
                        <td>
                          <span className="key-badge">
                            {r.right_key}{' '}
                            <button onClick={() => copyKey(r.right_key)}>&#8984;</button>
                          </span>
                        </td>
                        <td>
                          <span className="hash">
                            {truncHash(r.owner_wallet)}
                          </span>
                        </td>
                        <td>
                          <span className={statusClass(r.status, r.revoked)}>
                            {statusLabel(r.status, r.revoked)}
                          </span>
                        </td>
                        <td>
                          <span className="hash">
                            {truncHash(r.onchain_right_id)}{' '}
                            {r.onchain_right_id && r.onchain_right_id !== '\u2014' && (
                              <button onClick={() => copyKey(r.onchain_right_id)}>
                                &#8984;
                              </button>
                            )}
                          </span>
                        </td>
                        <td>
                          <div className="action-row">
                            {r.status === 'submitted' ? (
                              <button className="btn btn-mint" onClick={() => {
                                setMintingKey(r.right_key);
                                setModalOpen(true);
                              }}>
                                Mint
                              </button>
                            ) : !r.revoked && r.status !== 'activated' ? (
                              <button
                                className="btn btn-ghost"
                                onClick={() => {
                                  setRightObjectId(r.onchain_right_id);
                                  setActivationCode('');
                                }}
                              >
                                Activate
                              </button>
                            ) : (
                              <button className="btn btn-completed">Complete</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* --- Register Vendor Section --- */}
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
                      placeholder="e.g. Acme Corp"
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

            {/* --- Create (Mint) Right Panel --- */}
            <div className="create-panel">
              <div className="create-panel-header">
                <div>
                  <div className="table-title">+ Create New Right</div>
                  <div className="section-desc" style={{ marginTop: 2 }}>
                    // generate and register on IOTA blockchain
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => setFormOpen(!formOpen)}>
                  {formOpen ? 'Close' : 'Open Form'}
                </button>
              </div>
              <div className={`create-panel-body ${formOpen ? 'open' : ''}`}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Product ID</label>
                    <input
                      className="form-input"
                      placeholder="e.g. software-pro-2025"
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Right Key</label>
                    <input
                      className="form-input"
                      placeholder="e.g. SP25-XXXX-YYYY-ZZZZ"
                      value={rightKey}
                      onChange={(e) => setRightKey(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Activation Code</label>
                    <input
                      className="form-input"
                      placeholder="Secret activation code"
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
                    onClick={mintRight}
                    disabled={minting}
                  >
                    {minting ? (
                      <>
                        <span className="spinner" /> Minting...
                      </>
                    ) : (
                      'Mint Right'
                    )}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setFormOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>

            {/* --- Right Actions (Activate / Revoke) --- */}
            {rightObjectId && (
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
                        value={rightObjectId}
                        onChange={(e) => setRightObjectId(e.target.value)}
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
                    <button className="btn btn-primary" onClick={activateRight}>
                      Activate Right
                    </button>
                    <button className="btn btn-danger" onClick={revokeRight}>
                      Revoke Right
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============ MINT MODAL ============ */}
      <div className={`modal-overlay ${modalOpen ? 'show' : ''}`}>
        <div className="modal">
          <div className="modal-title">Confirm Mint</div>
          <div className="modal-desc">
            // Sending TX to IOTA blockchain...
          </div>
          <div className="modal-body">
            <div className="modal-body-label">KEY</div>
            <div className="modal-body-value">{mintingKey}</div>
            <div className="modal-body-label" style={{ marginTop: 8 }}>
              NETWORK
            </div>
            <div>IOTA Testnet · Move VM</div>
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
                mintRight();
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
