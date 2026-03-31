import { useState } from 'react';
import { BACKEND_URL } from './iotaConfig';

type VerifyResult = {
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
  has_audit: boolean;
  tx_digest?: string;
  audit_signature?: string;
  audit_network?: string;
  audit_issued_at?: string;
};

type DisclosureResult = {
  found: boolean;
  tx_digest?: string;
  disclosed_fields?: string[];
  disclosed_payload?: Record<string, unknown>;
  signature?: string;
};

interface Props {
  showToast: (msg: string) => void;
}

const DISCLOSABLE_FIELDS = [
  'version', 'record_type', 'product_id', 'right_key', 'tx_digest',
  'onchain_object_id', 'vendor_wallet', 'owner_wallet', 'network',
  'status', 'revoked', 'expiry_date', 'issued_at',
];

export function VerifyPage({ showToast }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  // Selective disclosure
  const [discloseFields, setDiscloseFields] = useState<string[]>([]);
  const [discloseResult, setDiscloseResult] = useState<DisclosureResult | null>(null);
  const [discloseLoading, setDiscloseLoading] = useState(false);

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied'));
  }

  function truncAddr(addr: string | undefined | null): string {
    if (!addr) return '\u2014';
    if (addr.length > 20) return addr.slice(0, 10) + '\u2026' + addr.slice(-6);
    return addr;
  }

  function formatExpiry(ms: number | undefined): string {
    if (!ms || ms === 0) return 'No expiry';
    return new Date(ms).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  function statusColor(r: VerifyResult): string {
    if (!r.found) return 'var(--muted)';
    if (r.revoked) return 'var(--red)';
    if (r.expiry_date && r.expiry_date > 0 && Date.now() > r.expiry_date) return 'var(--yellow)';
    if (r.valid) return 'var(--accent)';
    return 'var(--red)';
  }

  function statusIcon(r: VerifyResult): string {
    if (!r.found) return '?';
    if (r.valid) return '\u2713';
    return '\u2717';
  }

  function statusText(r: VerifyResult): string {
    if (!r.found) return 'NOT FOUND';
    if (r.revoked) return 'REVOKED';
    if (r.expiry_date && r.expiry_date > 0 && Date.now() > r.expiry_date) return 'EXPIRED';
    if (r.valid) return 'VALID';
    return 'INVALID';
  }

  async function verify() {
    const id = input.trim();
    if (!id) return;
    setLoading(true);
    setResult(null);
    setDiscloseResult(null);
    setDiscloseFields([]);
    try {
      const res = await fetch(`${BACKEND_URL}/right/verify/${id}`);
      if (res.ok) {
        setResult(await res.json());
      } else {
        setResult({
          found: false, valid: false, status: 'not_found',
          reason: 'Right not found', has_audit: false,
        });
      }
    } catch {
      showToast('Backend unreachable');
    } finally {
      setLoading(false);
    }
  }

  async function exportAudit() {
    if (!result?.tx_digest) return;
    try {
      const res = await fetch(`${BACKEND_URL}/audit/${result.tx_digest}/export/partial`, { method: 'POST' });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-${result.tx_digest}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Audit JSON exported');
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

  function buildPreview(): Record<string, string> {
    const preview: Record<string, string> = {};
    for (const f of discloseFields) {
      preview[f] = `<${f}>`;
    }
    return preview;
  }

  async function disclose() {
    if (!result?.tx_digest || discloseFields.length === 0) {
      showToast('Select at least one field');
      return;
    }
    setDiscloseLoading(true);
    setDiscloseResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/audit/${result.tx_digest}/disclose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: discloseFields }),
      });
      if (res.ok) {
        setDiscloseResult(await res.json());
      } else {
        showToast('Disclosure failed');
      }
    } catch {
      showToast('Backend unreachable');
    } finally {
      setDiscloseLoading(false);
    }
  }

  async function exportDisclosed() {
    if (!result?.tx_digest || discloseFields.length === 0) return;
    try {
      const res = await fetch(`${BACKEND_URL}/audit/${result.tx_digest}/disclose/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: discloseFields }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `disclosed-${result.tx_digest}.json`;
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

  return (
    <div className="container">
      {/* ═══ HERO ═══ */}
      <div className="vp-hero">
        <div className="vp-hero-label">Public Verification</div>
        <div className="vp-hero-title">Verify a Digital Right</div>
        <div className="vp-hero-desc">
          Trustless, on-chain verification. No wallet needed.
          Enter any right ID to check its validity against the IOTA blockchain.
        </div>
        <div className="vp-search-row">
          <input
            className="vp-search-input"
            placeholder="Enter on-chain right ID (0x...)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') verify(); }}
          />
          <button
            className="btn btn-primary vp-search-btn"
            onClick={verify}
            disabled={loading}
          >
            {loading ? <><span className="spinner" /> Verifying...</> : 'Verify'}
          </button>
        </div>
      </div>

      {/* ═══ STATUS CARD ═══ */}
      {result && (
        <div
          className="vp-status-card"
          style={{ borderColor: statusColor(result) }}
        >
          <div className="vp-status-header">
            <div
              className="vp-status-badge"
              style={{ background: statusColor(result) }}
            >
              <span className="vp-status-icon">{statusIcon(result)}</span>
              <span className="vp-status-text">{statusText(result)}</span>
            </div>
            {result.found && (
              <div className="vp-status-sub">
                {result.valid
                  ? 'This right is verified on the IOTA blockchain'
                  : result.reason || 'Verification failed'}
              </div>
            )}
            {!result.found && (
              <div className="vp-status-sub">
                No matching right found on-chain or in database
              </div>
            )}
          </div>

          {result.found && (
            <div className="vp-field-grid">
              <div className="vp-field" onClick={() => copyText(result.product_id || '')}>
                <div className="vp-field-label">Product ID</div>
                <div className="vp-field-value">{result.product_id || '\u2014'}</div>
              </div>
              <div className="vp-field" onClick={() => copyText(result.status)}>
                <div className="vp-field-label">Status</div>
                <div className="vp-field-value" style={{ color: statusColor(result) }}>
                  {statusText(result)}
                </div>
              </div>
              <div className="vp-field" onClick={() => copyText(result.owner_wallet || '')} title={result.owner_wallet || ''}>
                <div className="vp-field-label">Owner Wallet</div>
                <div className="vp-field-value vp-mono">{truncAddr(result.owner_wallet)}</div>
              </div>
              <div className="vp-field" onClick={() => copyText(result.vendor_wallet || '')} title={result.vendor_wallet || ''}>
                <div className="vp-field-label">Vendor Wallet</div>
                <div className="vp-field-value vp-mono">{truncAddr(result.vendor_wallet)}</div>
              </div>
              <div className="vp-field" onClick={() => copyText(result.onchain_right_id || '')} title={result.onchain_right_id || ''}>
                <div className="vp-field-label">On-chain Object ID</div>
                <div className="vp-field-value vp-mono">{result.onchain_right_id || '\u2014'}</div>
              </div>
              <div className="vp-field">
                <div className="vp-field-label">Expiry</div>
                <div className="vp-field-value">{formatExpiry(result.expiry_date)}</div>
              </div>
              <div className="vp-field">
                <div className="vp-field-label">Activated</div>
                <div className="vp-field-value">{result.activated ? 'Yes' : 'No'}</div>
              </div>
              <div className="vp-field">
                <div className="vp-field-label">Revoked</div>
                <div className="vp-field-value" style={{ color: result.revoked ? 'var(--red)' : undefined }}>
                  {result.revoked ? 'Yes' : 'No'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ AUDIT TRAIL ═══ */}
      {result?.has_audit && (
        <div className="vp-audit-section">
          <div className="vp-section-header">
            <div>
              <div className="vp-section-title">On-chain Audit Trail</div>
              <div className="vp-section-desc">
                This right has a signed audit record anchored to the IOTA blockchain
              </div>
            </div>
            <button className="btn btn-ghost" onClick={exportAudit}>
              Export Audit JSON
            </button>
          </div>
          <div className="vp-audit-grid">
            <div className="vp-field" onClick={() => copyText(result.tx_digest || '')} title={result.tx_digest || ''}>
              <div className="vp-field-label">Transaction Digest</div>
              <div className="vp-field-value vp-mono">{result.tx_digest || '\u2014'}</div>
            </div>
            <div className="vp-field">
              <div className="vp-field-label">Network</div>
              <div className="vp-field-value">
                <span className="vp-network-badge">{result.audit_network || 'testnet'}</span>
              </div>
            </div>
            <div className="vp-field">
              <div className="vp-field-label">Issued At</div>
              <div className="vp-field-value">{result.audit_issued_at || '\u2014'}</div>
            </div>
            <div className="vp-field" onClick={() => copyText(result.audit_signature || '')} title={result.audit_signature || ''}>
              <div className="vp-field-label">HMAC Signature</div>
              <div className="vp-field-value vp-mono">{truncAddr(result.audit_signature)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SELECTIVE DISCLOSURE ═══ */}
      {result?.has_audit && (
        <div className="vp-disclosure-section">
          <div className="vp-section-header">
            <div>
              <div className="vp-section-title">Selective Disclosure</div>
              <div className="vp-section-desc">
                Choose which fields to reveal to a verifier. Only selected fields will be included in the signed proof.
              </div>
            </div>
          </div>
          <div className="vp-disclosure-body">
            <div className="vp-disclosure-left">
              <div className="vp-chip-label">Select fields to disclose:</div>
              <div className="vp-chip-grid">
                {DISCLOSABLE_FIELDS.map((field) => (
                  <button
                    key={field}
                    className={`vp-chip ${discloseFields.includes(field) ? 'selected' : ''}`}
                    onClick={() => toggleField(field)}
                  >
                    {field}
                  </button>
                ))}
              </div>
              <div className="vp-disclosure-actions">
                <button
                  className="btn btn-primary"
                  onClick={disclose}
                  disabled={discloseLoading || discloseFields.length === 0}
                >
                  {discloseLoading ? <><span className="spinner" /> Signing...</> : 'Disclose'}
                </button>
                {discloseResult?.found && (
                  <button className="btn btn-ghost" onClick={exportDisclosed}>
                    Export Disclosed JSON
                  </button>
                )}
              </div>
            </div>
            <div className="vp-disclosure-right">
              <div className="vp-chip-label">Live Preview:</div>
              <pre className="vp-preview">
                {discloseResult?.found
                  ? JSON.stringify({
                      tx_digest: discloseResult.tx_digest,
                      disclosed_fields: discloseResult.disclosed_fields,
                      disclosed_payload: discloseResult.disclosed_payload,
                      signature: discloseResult.signature,
                    }, null, 2)
                  : discloseFields.length > 0
                    ? JSON.stringify({
                        tx_digest: result.tx_digest,
                        disclosed_fields: discloseFields,
                        disclosed_payload: buildPreview(),
                        signature: '(will be computed on disclose)',
                      }, null, 2)
                    : '// Select fields above to preview the disclosure payload'
                }
              </pre>
            </div>
          </div>

          {discloseResult?.found && (
            <div className="vp-disclosure-sig">
              <div className="vp-field-label">Disclosure Signature</div>
              <div className="vp-field-value vp-mono" onClick={() => copyText(discloseResult.signature || '')} title={discloseResult.signature || ''}>
                {discloseResult.signature || '\u2014'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ FOOTER ═══ */}
      {result && (
        <div className="vp-footer">
          <div>Verified against IOTA Testnet &middot; digital_rights::digital_rights</div>
          <div>SealD &mdash; Programmable Digital Rights on IOTA</div>
        </div>
      )}
    </div>
  );
}
