const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1920, height: 1080, show: false, useContentSize: true,
    webPreferences: { contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  win.webContents.on('console-message', (e, level, msg) => { if (/AUDIO|REC/.test(msg)) console.log(msg); });
  try {
    await win.loadFile(path.join(__dirname, 'film.html'));
    await win.webContents.executeJavaScript('window.ready');
    const result = await win.webContents.executeJavaScript(`(async () => {
      if (!window.selfTest()) throw new Error('Film self-test failed');
      const canvas = document.getElementById('out');
      const review = {};
      for (const t of [3.5, 4.0, 4.35, 4.7, 5.0, 5.34, 5.5, 5.85, 6.3, 6.75, 8.6, 10.5, 17.9]) {
        if (window.prepare) await window.prepare(t);
        window.renderAt(t);
        review[t] = canvas.toDataURL('image/png').split(',')[1];
      }
      const withAudio = 'video/mp4;codecs=avc1.640028,mp4a.40.2';
      const preferred = MediaRecorder.isTypeSupported(withAudio) ? withAudio : 'video/mp4;codecs=avc1.640028';
      const fallback = 'video/webm;codecs=vp9';
      const mime = MediaRecorder.isTypeSupported(preferred) ? preferred : fallback;
      if (!MediaRecorder.isTypeSupported(mime)) throw new Error('Neither requested recording format is supported');
      const videoStream = canvas.captureStream(0);
      const track = videoStream.getVideoTracks()[0];
      // ElevenLabs voiceover, played into the recording at fixed times (pitch kept when sped up).
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const lines = (window.VOICEOVER || []).map(v => { const el = new Audio(v.src); el.preservesPitch = true; el.playbackRate = v.rate || 1; el.preload = 'auto'; audioCtx.createMediaElementSource(el).connect(dest); return { ...v, el, started: false }; });
      await Promise.all(lines.map(l => new Promise(r => { if (l.el.readyState >= 3) return r(); l.el.oncanplaythrough = r; l.el.onerror = r; setTimeout(r, 4000); })));
      await audioCtx.resume();
      console.log('AUDIO', audioCtx.state, JSON.stringify(lines.map(l => [l.src, l.el.readyState, l.el.error && l.el.error.code])));
      const stream = new MediaStream([track, ...(lines.length ? dest.stream.getAudioTracks() : [])]);
      if (!track || typeof track.requestFrame !== 'function') throw new Error('Manual frame capture is unavailable');
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: ${Number(process.env.VBR || 16e6)} });
      const stopped = new Promise((resolve, reject) => {
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onerror = e => { console.log('REC error ' + (e.error && e.error.message)); reject(e.error || new Error('MediaRecorder failed')); };
        recorder.onstop = resolve;
      });
      recorder.start(1000);
      const recordingStart = performance.now();
      for (let f = 0; f <= window.DURATION * 30; f++) {
        const remaining = recordingStart + f * 1000 / 30 - performance.now();
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
        for (const l of lines) if (!l.started && f / 30 >= l.at) { l.started = true; l.el.play(); }
        if (window.prepare) await window.prepare(f / 30);
        window.renderAt(f / 30);
        track.requestFrame();
      }
      await new Promise(resolve => setTimeout(resolve, 1000 / 30));
      recorder.stop();
      await stopped;
      stream.getTracks().forEach(t => t.stop());
      audioCtx.close();
      console.log('REC', mime, chunks.length, chunks.map(c => c.size).join(','));
      const blob = new Blob(chunks, { type: mime });
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(';base64,') + 8));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return { mime, base64, review };
    })()`, true);
    const ext = result.mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const output = path.join(__dirname, `labro-demo-v7.${ext}`);
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
