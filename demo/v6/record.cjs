const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1920, height: 1080, show: false, useContentSize: true,
    webPreferences: { contextIsolation: true, backgroundThrottling: false } });
  try {
    await win.loadFile(path.join(__dirname, 'film.html'));
    await win.webContents.executeJavaScript('window.ready');
    const result = await win.webContents.executeJavaScript(`(async () => {
      if (!window.selfTest()) throw new Error('Film self-test failed');
      const canvas = document.getElementById('out');
      const review = {};
      for (const t of [1.5, 5.0, 5.3, 7, 12, 15, 17.5]) {
        if (window.prepare) await window.prepare(t);
        window.renderAt(t);
        review[t] = canvas.toDataURL('image/png').split(',')[1];
      }
      const preferred = 'video/mp4;codecs=avc1.640028';
      const fallback = 'video/webm;codecs=vp9';
      const mime = MediaRecorder.isTypeSupported(preferred) ? preferred : fallback;
      if (!MediaRecorder.isTypeSupported(mime)) throw new Error('Neither requested recording format is supported');
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      if (!track || typeof track.requestFrame !== 'function') throw new Error('Manual frame capture is unavailable');
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16e6 });
      const stopped = new Promise((resolve, reject) => {
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onerror = e => reject(e.error || new Error('MediaRecorder failed'));
        recorder.onstop = resolve;
      });
      recorder.start();
      let previous = performance.now() - 1000 / 30;
      for (let f = 0; f <= window.DURATION * 30; f++) {
        const remaining = previous + 1000 / 30 - performance.now();
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
        if (window.prepare) await window.prepare(f / 30);
        window.renderAt(f / 30);
        track.requestFrame();
        previous = performance.now();
      }
      await new Promise(resolve => setTimeout(resolve, 1000 / 30));
      recorder.stop();
      await stopped;
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: mime });
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return { mime, base64, review };
    })()`, true);
    const ext = result.mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const output = path.join(__dirname, `labro-demo-v6.${ext}`);
    const data = Buffer.from(result.base64, 'base64');
    fs.writeFileSync(output, data);
    const reviewDir = path.join(__dirname, 'review');
    fs.mkdirSync(reviewDir, { recursive: true });
    for (const [time, png] of Object.entries(result.review)) {
      fs.writeFileSync(path.join(reviewDir, `frame-${time}s.png`), Buffer.from(png, 'base64'));
    }
    console.log(`FILM DONE ${output} ${data.length} ${result.mime}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    win.destroy();
    app.quit();
  }
}).catch(error => { console.error(error); app.exit(1); });
