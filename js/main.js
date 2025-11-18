// js/main.js
// 入口。すべてのクラスは window にぶら下がっている前提（非モジュール構成）

document.addEventListener('DOMContentLoaded', () => {
  if (!window.AppController) {
    console.error('AppController が見つかりません。app-controller.js が正しく読み込まれているか確認してください。');
    return;
  }

  const app = new window.AppController();
  app.init();
});
