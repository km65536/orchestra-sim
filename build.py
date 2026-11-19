"""src/ のファイルを結合して dist/index.html（1ファイルで動作）を生成する。
   three.js は別の <script> にして、万一読み込みに失敗してもゲーム本体は動くようにしている。"""
import pathlib
root = pathlib.Path(__file__).parent
src = root / 'src'
css = (src / 'styles.css').read_text()
vendor = (src / 'vendor' / 'three.min.js').read_text()
game = '\n'.join((src / f).read_text() for f in ['config.js', 'data.js', 'logic.js', 'music.js', 'stage3d.js', 'ui.js', 'ui3d.js', 'ui_tabs.js'])
html = f'''<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#12131a">
<title>楽団運営記 ― オーケストラ運営シミュレーション</title>
<style>{css}</style></head>
<body><div id="app"></div>
<script>
try {{
{vendor}
}} catch (e) {{ window.THREE = undefined; console.error('three.js load failed', e); }}
</script>
<script>
{game}
</script></body></html>'''
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'index.html').write_text(html)
print(len(html))
