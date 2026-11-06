#!/bin/sh
# Usage: (cd labmeter-demo && python3 -m http.server 8765 &) ; sh tests/smoke.sh
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; OUT=$(mktemp)
( "$CH" --headless=new --disable-gpu --window-size=1300,900 --virtual-time-budget=30000 --dump-dom "http://localhost:8765/tests/smoke.html" 2>/dev/null > "$OUT" & p=$!; sleep 28; kill $p 2>/dev/null )
python3 -c "import re,html,sys;s=open('$OUT').read();m=re.search(r'<pre id=\"o\">(.*?)</pre>',s,re.S);print(html.unescape(m.group(1)) if m else 'no output')"
