import type { CairnAPI } from './index.js';

declare global {
  interface Window {
    cairn: CairnAPI;
  }
}

export {};
