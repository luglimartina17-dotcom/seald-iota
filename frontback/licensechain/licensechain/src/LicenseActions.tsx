import { useState } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@iota/dapp-kit';
import { Transaction } from '@iota/iota-sdk/transactions';
import { IotaClient, getFullnodeUrl } from '@iota/iota-sdk/client';
import { PACKAGE_ID, REGISTRY_ID, BACKEND_URL, CLOCK_ID } from './iotaConfig';

type ObjectChange = {
  type?: string;
  objectType?: string;
  objectId?: string;
};

type TxResult = {
  digest: string;
  objectChanges?: ObjectChange[];
};

export function LicenseActions() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction } =
    useSignAndExecuteTransaction();

  const [companyName, setCompanyName] = useState('');
  const [productId, setProductId] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [expiryDate, setExpiryDate] = useState('0');
  const [maxDevices, setMaxDevices] = useState('1');
  const [licenseObjectId, setLicenseObjectId] = useState('');

  if (!account) {
    return <p style={{ marginTop: 20 }}>Collega il wallet per continuare.</p>;
  }

  async function registerVendor() {
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
          wallet: account!.address,
          company_name: companyName,
          tx_digest: result.digest,
        }),
      });

      alert(`Vendor registrato. Digest: ${result.digest}`);
    } catch (error) {
      console.error('Errore registerVendor:', error);
      alert('Errore durante la registrazione del vendor');
    }
  }

  async function mintLicense() {
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

      // Rileggi la tx dall'RPC per ottenere objectChanges completi
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

      if (!onchainLicenseId) {
        console.error('Impossibile estrarre license_object_id', txDetails);
        alert(
          `Mint riuscito! Digest: ${result.digest}\nNon riesco a recuperare l'object ID automaticamente.`,
        );
        return;
      }

      await fetch(`${BACKEND_URL}/license/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: account!.address,
          tx_digest: result.digest,
          onchain_license_id: onchainLicenseId,
          product_id: productId,
          license_key: licenseKey,
          expiry_date: Number(expiryDate),
          max_devices: Number(maxDevices),
        }),
      });

      setLicenseObjectId(onchainLicenseId);
      alert(`Licenza mintata! Object ID: ${onchainLicenseId}`);
    } catch (error) {
      console.error('Errore mintLicense:', error);
      alert('Errore durante il mint della licenza');
    }
  }

  async function activateLicense() {
    try {
      if (!licenseObjectId) {
        alert('Inserisci o recupera un license object id valido');
        return;
      }

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
          wallet: account!.address,
          tx_digest: result.digest,
          onchain_license_id: licenseObjectId,
        }),
      });

      alert(`Licenza attivata. Digest: ${result.digest}`);
    } catch (error) {
      console.error('Errore activateLicense:', error);
      alert("Errore durante l'attivazione della licenza");
    }
  }

  async function revokeLicense() {
    try {
      if (!licenseObjectId) {
        alert('Inserisci un license object id valido');
        return;
      }

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
          wallet: account!.address,
          tx_digest: result.digest,
          onchain_license_id: licenseObjectId,
        }),
      });

      alert(`Licenza revocata. Digest: ${result.digest}`);
    } catch (error) {
      console.error('Errore revokeLicense:', error);
      alert('Errore durante la revoca della licenza');
    }
  }

  async function checkLicense() {
    try {
      if (!licenseObjectId) {
        alert('Inserisci un license object id valido');
        return;
      }

      const response = await fetch(
        `${BACKEND_URL}/license/check/${licenseObjectId}`,
      );
      const data = await response.json();
      alert(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Errore checkLicense:', error);
      alert('Errore durante il controllo della licenza');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12, marginTop: 24, maxWidth: 700 }}>
      <h2>Vendor</h2>
      <input
        placeholder="Company name"
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        style={{ padding: 10 }}
      />
      <button onClick={registerVendor} style={{ padding: 10 }}>
        Register Vendor
      </button>

      <hr />

      <h2>Mint License</h2>
      <input
        placeholder="Product ID"
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        style={{ padding: 10 }}
      />
      <input
        placeholder="License key"
        value={licenseKey}
        onChange={(e) => setLicenseKey(e.target.value)}
        style={{ padding: 10 }}
      />
      <input
        placeholder="Activation code"
        value={activationCode}
        onChange={(e) => setActivationCode(e.target.value)}
        style={{ padding: 10 }}
      />
      <input
        placeholder="Expiry date in ms (0 = no expiry)"
        value={expiryDate}
        onChange={(e) => setExpiryDate(e.target.value)}
        style={{ padding: 10 }}
      />
      <input
        placeholder="Max devices"
        value={maxDevices}
        onChange={(e) => setMaxDevices(e.target.value)}
        style={{ padding: 10 }}
      />
      <button onClick={mintLicense} style={{ padding: 10 }}>
        Mint License
      </button>

      <hr />

      <h2>License Actions</h2>
      <input
        placeholder="On-chain license object id"
        value={licenseObjectId}
        onChange={(e) => setLicenseObjectId(e.target.value)}
        style={{ padding: 10 }}
      />
      <button onClick={activateLicense} style={{ padding: 10 }}>
        Activate License
      </button>
      <button onClick={revokeLicense} style={{ padding: 10 }}>
        Revoke License
      </button>
      <button onClick={checkLicense} style={{ padding: 10 }}>
        Check License
      </button>
    </div>
  );
}
