# Click-through demo (deck slides 08a–08g)

Captures the real Parity screens for the pitch's click-through demo, on the crew's "pitch" scenario.

```sh
./node_modules/.bin/electron . --remote-debugging-port=9338 &
OUT=/tmp/parity-demo node demo/clickthrough/cdp.mjs 9338 "$PWD/demo/clickthrough/capture.mjs"
```

Writes d1–d7 PNGs (3840×2160) plus `rects.json`, the on-screen boxes for each step's highlight and cursor.
