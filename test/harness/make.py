import pathlib
src=pathlib.Path(__file__).resolve().parents[2]/'src'
import json, subprocess
_files=json.loads((src/'files.json').read_text())
_data=subprocess.run(['node','-e',"process.stdout.write(JSON.stringify(require('./test/game_source.js').gameData()))"],cwd=src.parent,capture_output=True,text=True).stdout
js=(src/'3d/vendor/three.min.js').read_text()+'\nconst GAME_DATA='+_data+';\n'+'\n'.join((src/f).read_text() for f in _files['logic']+['3d/music.js','3d/stage3d.js'])
html=f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:#000}}#h{{position:fixed;inset:0}}</style></head><body><div id="h"></div><script>{js}
localStorage.clear(); newGame();
const c=activeConcert(); c.hallId='HALL'; c.songId='SONG';
Stage3D.init(document.getElementById('h'));
Stage3D.sync({{hallId:c.hallId, song:findSong(c.songId), conductor:activeConductor()}});
Stage3D.setCamera('CAM', true); Stage3D.setVisible(true);
window.__ok=Stage3D.ok; window.__reason=Stage3D.reason;
</script></body></html>'''
import sys
hall,song,cam=sys.argv[1:4]
out=html.replace("'HALL'",repr(hall)).replace("'SONG'",repr(song)).replace("'CAM'",repr(cam))
pathlib.Path(__file__).with_name('h.html').write_text(out)
