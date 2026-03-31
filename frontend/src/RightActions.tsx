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

type CheckResult = {
  found: boolean;
  valid: boolean;
  status: string;
  onchain_right_id?: string;
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

type AuditRecord = {
  found: boolean;
  tx_digest?: string;
  onchain_object_id?: string;
  product_id?: string;
  right_key?: string;
  vendor_wallet?: string;
  owner_wallet?: string;
  network?: string;
  issued_at?: string;
  signature?: string;
  detail?: string;
};

type DisclosureResult = {
  found: boolean;
  disclosed_fields?: string[];
  payload?: Record<string, unknown>;
  signature?: string;
  detail?: string;
};

interface Props {
  currentPage: 'dashboard' | 'verify' | 'audit';
  account: ReturnType<typeof useCurrentAccount>;
  showToast: (msg: string) => void;
}

export function RightActions({ currentPage, account, showToast }: Props) {
  const { mutateAsync: signAndExecuteTransaction } =
    useSignAndExecuteTransaction();

  /* --- Dashboard State --- */
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

  /* --- Verify State --- */
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<CheckResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyHistory, setVerifyHistory] = useState<VerifyHistory[]>(() => {
    try {
      const saved = localStorage.getItem('seald_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  /* --- Audit State --- */
  const [auditDigest, setAuditDigest] = useState('');
  const [auditRecord, setAuditRecord] = useState<AuditRecord | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [discloseDigest, setDiscloseDigest] = useState('');
  const [discloseFields, setDiscloseFields] = useState<string[]>([]);
  const [discloseResult, setDiscloseResult] = useState<DisclosureResult | null>(null);
  const [discloseLoading, setDiscloseLoading] = useState(false);

  const DISCLOSABLE_FIELDS = [
    'version', 'record_type', 'product_id', 'right_key', 'tx_digest',
    'onchain_object_id', 'vendor_wallet', 'owner_wallet', 'network',
    'status', 'revoked', 'expiry_date', 'issued_at',
  ];

  /* --- Load rights from backend --- */
  useEffect(() => {
    fetchRights();
  }, []);

  async function fetchRights() {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/right/check/all`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setRights(data);
        }
      }
    } catch {
      // Backend offline — OK, empty table
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

  /* --- Verify Right --- */
  async function verifyRight() {
    const input = verifyInput.trim();
    if (!input) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/right/check/${input}`);
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
          product: data.product_id || '\u2014',
          valid: data.valid,
          time,
        };
        const newHistory = [entry, ...verifyHistory].slice(0, 50);
        setVerifyHistory(newHistory);
        localStorage.setItem('seald_history', JSON.stringify(newHistory));
      } else {
        setVerifyResult({
          found: false,
          valid: false,
          status: 'not_found',
          reason: 'Right not found',
        });
      }
    } catch {
      showToast('Backend unreachable');
    } finally {
      setVerifyLoading(false);
    }
  }

  /* --- Audit: View Record --- */
  async function viewAudit() {
    const digest = auditDigest.trim();
    if (!digest) return;
    setAuditLoading(true);
    setAuditRecord(null);
    try {
      const res = await fetch(`${BACKEND_URL}/audit/${digest}`);
      if (res.ok) {
        setAuditRecord(await res.json());
      } else {
        setAuditRecord({ found: false, detail: 'Audit record not found' });
      }
    } catch {
      showToast('Backend unreachable');
    } finally {
      setAuditLoading(false);
    }
  }

  /* --- Audit: Export JSON --- */
  async function exportAudit() {
    const digest = auditDigest.trim();
    if (!digest) return;
    try {
      const res = await fetch(`${BACKEND_URL}/audit/${digest}/export/partial`, { method: 'POST' });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-${digest}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Audit JSON exported');
      } else {
        showToast('Export failed — record not found');
      }
    } catch {
      showToast('Backend unreachable');
    }
  }

  /* --- Audit: Selective Disclosure --- */
  async function discloseAudit() {
    const digest = discloseDigest.trim();
    if (!digest || discloseFields.length === 0) {
      showToast('Enter a digest and select at least one field');
      return;
    }
    setDiscloseLoading(true);
    setDiscloseResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/audit/${digest}/disclose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: discloseFields }),
      });
      if (res.ok) {
        setDiscloseResult(await res.json());
      } else {
        setDiscloseResult({ found: false, detail: 'Audit record not found' });
      }
    } catch {
      showToast('Backend unreachable');
    } finally {
      setDiscloseLoading(false);
    }
  }

  /* --- Audit: Export Disclosed JSON --- */
  async function exportDisclosed() {
    const digest = discloseDigest.trim();
    if (!digest || discloseFields.length === 0) return;
    try {
      const res = await fetch(`${BACKEND_URL}/audit/${digest}/disclose/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: discloseFields }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `disclosed-${digest}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Disclosed JSON exported');
      } else {
        showToast('Export failed');
      }
    } catch {
      showToast('Backend unreachable');
    }
  }

  function toggleField(field: string) {
    setDiscloseFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  }

  /* --- Status badge helper --- */
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
    if (!h || h === '\u2014') return '\u2014';
    if (h.length > 16) return h.slice(0, 8) + '...' + h.slice(-4);
    return h;
  }

  /* ===============================================
     RENDER
     =============================================== */
  return (
    <>
      {/* ============ DASHBOARD PAGE ============ */}
      <div className={`page ${currentPage === 'dashboard' ? 'active' : ''}`}>
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
      </div>

      {/* ============ VERIFY PAGE ============ */}
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
                  if (e.key === 'Enter') verifyRight();
                }}
              />
              <button
                className="btn btn-primary"
                onClick={verifyRight}
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
                  {verifyResult.valid ? '\u2713' : '\u2717'}
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
                      {verifyResult.product_id || '\u2014'}
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
                      {verifyResult.owner_wallet || '\u2014'}
                    </div>
                  </div>
                  <div className="result-field">
                    <div className="result-field-label">Vendor</div>
                    <div className="result-field-value">
                      {verifyResult.vendor_wallet || '\u2014'}
                    </div>
                  </div>
                  <div className="result-field" style={{ gridColumn: '1 / -1' }}>
                    <div className="result-field-label">On-chain ID</div>
                    <div className="result-field-value">
                      {verifyResult.onchain_right_id || '\u2014'}
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

      {/* ============ AUDIT PAGE ============ */}
      <div className={`page ${currentPage === 'audit' ? 'active' : ''}`}>
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-title">
                Audit <span>Records</span>
              </div>
              <div className="section-desc">
                // view, export, and selectively disclose audit records
              </div>
            </div>
          </div>

          {/* Panel 1 — View Audit Record */}
          <div className="create-panel" style={{ marginBottom: 24 }}>
            <div className="create-panel-header">
              <div>
                <div className="table-title">View Audit Record</div>
                <div className="section-desc" style={{ marginTop: 2 }}>
                  // retrieve a signed audit record by transaction digest
                </div>
              </div>
            </div>
            <div className="create-panel-body open">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Transaction Digest</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 7xKp3..."
                    value={auditDigest}
                    onChange={(e) => setAuditDigest(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') viewAudit(); }}
                  />
                </div>
                <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={viewAudit} disabled={auditLoading}>
                    {auditLoading ? <><span className="spinner" /> Loading...</> : 'View Audit'}
                  </button>
                </div>
              </div>

              {auditRecord && (
                <div style={{ marginTop: 16 }}>
                  {auditRecord.found ? (
                    <div className="result-grid">
                      {[
                        ['TX Digest', auditRecord.tx_digest],
                        ['Object ID', auditRecord.onchain_object_id],
                        ['Product ID', auditRecord.product_id],
                        ['Right Key', auditRecord.right_key],
                        ['Vendor', auditRecord.vendor_wallet],
                        ['Owner', auditRecord.owner_wallet],
                        ['Network', auditRecord.network],
                        ['Issued At', auditRecord.issued_at],
                      ].map(([label, value]) => (
                        <div className="result-field" key={label}>
                          <div className="result-field-label">{label}</div>
                          <div className="result-field-value">{value || '\u2014'}</div>
                        </div>
                      ))}
                      <div className="result-field" style={{ gridColumn: '1 / -1' }}>
                        <div className="result-field-label">Signature</div>
                        <div className="result-field-value">{auditRecord.signature || '\u2014'}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {auditRecord.detail || 'Audit record not found'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Panel 2 — Export Audit */}
          <div className="create-panel" style={{ marginBottom: 24 }}>
            <div className="create-panel-header">
              <div>
                <div className="table-title">Export Audit</div>
                <div className="section-desc" style={{ marginTop: 2 }}>
                  // download the full audit record as JSON
                </div>
              </div>
            </div>
            <div className="create-panel-body open">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Transaction Digest</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 7xKp3..."
                    value={auditDigest}
                    onChange={(e) => setAuditDigest(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={exportAudit}>
                    Export JSON
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Panel 3 — Selective Disclosure */}
          <div className="create-panel">
            <div className="create-panel-header">
              <div>
                <div className="table-title">Selective Disclosure</div>
                <div className="section-desc" style={{ marginTop: 2 }}>
                  // reveal only chosen fields with a new signed payload
                </div>
              </div>
            </div>
            <div className="create-panel-body open">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Transaction Digest</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 7xKp3..."
                    value={discloseDigest}
                    onChange={(e) => setDiscloseDigest(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                  Fields to Disclose
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {DISCLOSABLE_FIELDS.map((field) => (
                    <label
                      key={field}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontFamily: 'var(--mono)',
                        fontSize: 11,
                        color: discloseFields.includes(field) ? 'var(--accent)' : 'var(--muted)',
                        background: discloseFields.includes(field) ? 'var(--accent-dim)' : 'var(--surface2)',
                        border: `1px solid ${discloseFields.includes(field) ? 'var(--accent)' : 'var(--border)'}`,
                        padding: '4px 10px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={discloseFields.includes(field)}
                        onChange={() => toggleField(field)}
                        style={{ display: 'none' }}
                      />
                      {field}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  onClick={discloseAudit}
                  disabled={discloseLoading}
                >
                  {discloseLoading ? <><span className="spinner" /> Loading...</> : 'Disclose'}
                </button>
                {discloseResult?.found && (
                  <button className="btn btn-ghost" onClick={exportDisclosed}>
                    Export Disclosed JSON
                  </button>
                )}
              </div>

              {discloseResult && (
                <div style={{ marginTop: 16 }}>
                  {discloseResult.found ? (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <div className="form-label" style={{ marginBottom: 4 }}>Disclosed Fields</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>
                          {discloseResult.disclosed_fields?.join(', ') || '\u2014'}
                        </div>
                      </div>
                      <div className="result-field" style={{ marginBottom: 12 }}>
                        <div className="result-field-label">Payload</div>
                        <pre className="result-field-value" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                          {JSON.stringify(discloseResult.payload, null, 2)}
                        </pre>
                      </div>
                      <div className="result-field">
                        <div className="result-field-label">Signature</div>
                        <div className="result-field-value">{discloseResult.signature || '\u2014'}</div>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {discloseResult.detail || 'Audit record not found'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
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
