// js/services/colormap-exporter.js
// 色マップモデルをJSONファイルとしてエクスポートするサービス

/**
 * 色マップモデルをJSONファイルとしてエクスポート
 */
class ColormapExporter {
  /**
   * 色マップモデルをJSONファイルとしてダウンロード
   * @param {Array<{word: string, clsname: string}>} model - 色マップモデル
   * @param {string} filename - ファイル名（デフォルト: "colormap.json"）
   */
  static export(model, filename = 'colormap.json') {
    if (!Array.isArray(model)) {
      throw new Error('Model must be an array');
    }

    // JSON文字列に変換（インデント付き）
    const jsonString = JSON.stringify(model, null, 2);

    // Blobを作成
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });

    // ダウンロード用のURLを作成
    const url = URL.createObjectURL(blob);

    // ダウンロード用のa要素を作成
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';

    // DOMに追加してクリック
    document.body.appendChild(a);
    a.click();

    // クリーンアップ
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}

// グローバル公開
window.ColormapExporter = ColormapExporter;

