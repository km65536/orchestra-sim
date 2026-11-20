// テスト用：ビルドと同じ順で src/ のゲームロジックと data/ のJSON（GAME_DATA）を結合したソースを返す
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function gameData() {
  const out = {};
  (function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.json')) out[path.relative(path.join(root, 'data'), p).replace(/\\/g, '/').replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  })(path.join(root, 'data'));
  return out;
}
function logicSource() {
  const files = JSON.parse(fs.readFileSync(path.join(root, 'src/files.json'), 'utf8'));
  return `const GAME_DATA = ${JSON.stringify(gameData())};\n` + files.logic.map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
}
module.exports = { gameData, logicSource, root };
