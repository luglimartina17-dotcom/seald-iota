import { ConnectButton } from '@iota/dapp-kit';
import { LicenseActions } from './LicenseActions';

export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>IOTA License dApp</h1>
      <p>Collega il wallet e usa le azioni qui sotto.</p>
      <ConnectButton />
      <LicenseActions />
    </div>
  );
}