export const PACKAGE_ID =
  '0x831ad44544bc9c5c75d785404d66e607db59105a9f74059a540d526d9a2c0eff';

export const REGISTRY_ID =
  '0x14eac2476ead3a690204a1d343731cb8f52684e63f3bf8a431cab2977b737058';

export const CLOCK_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000006';

// Usa variabile d'ambiente Vite, con fallback a localhost per sviluppo
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8000';
