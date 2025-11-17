// js/main.js
// アプリ起動エントリーポイント

import { AppController } from './ui/app-controller.js';

document.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  app.init();
});
