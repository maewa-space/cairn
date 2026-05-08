import type { QuillAPI } from './index.js';

declare global {
  interface Window {
    quill: QuillAPI;
  }
}

export {};
