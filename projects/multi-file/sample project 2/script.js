/* Audio Recorder + Visualizer + Editor
   - Records microphone via WebAudio (capture buffers)
   - Realtime visual via AnalyserNode
   - Store recorded PCM float buffers and build AudioBuffer
   - Trim selection via draggable handles on canvas
   - Play / Pause, Normalize, Export WAV (16-bit PCM)
   - All client-side, no upload
*/

(() => {
  // DOM refs
  const btnRecord = document.getElementById('btnRecord');
  const btnStop = document.getElementById('btnStop');
  const btnPlay = document.getElementById('btnPlay');
  const btnPause = document.getElementById('btnPause');
  const btnExport = document.getElementById('btnExport');
  const btnClear = document.getElementById('btnClear');
  const gainEl = document.getElementById('gain');
  const filterTypeEl = document.getElementById('filterType');
  const sampleRateEl = document.getElementById('sampleRate');
  const durationEl = document.getElementById('duration');
  const canvas = document.getElementById('waveCanvas');
  const ctx = canvas.getContext('2d');
  const selInfo = document.getElementById('selInfo');
  const btnSetStart = document.getElementById('btnSetStart');
  const btnSetEnd = document.getElementById('btnSetEnd');
  const btnTrim = document.getElementById('btnTrim');
  const btnNormalize = document.getElementById('btnNormalize');
  const clipsDiv = document.getElementById('clips');

  // audio context & nodes
  let audioContext = null;
  let micStream = null;
  let sourceNode = null;
  let analyser = null;
  let processor = null;
  let gainNode = null;
  let filterNode = null;

  // recording buffers
  let recBuffers = []; // array of Float32Array (mono)
  let recording = false;
  let startTime = 0;
  let sampleRate = 44100;

  // final audio buffer (Float32Array)
  let recordedBuffer = null; // Float32Array
  let audioBufferLength = 0;

  // playback
  let playbackSource = null;
  let isPlaying = false;
  let playStartAt = 0;
  let playOffset = 0;

  // selection (in seconds / sample index)
  let sel = { start: 0, end: 0 };
  let mouse = { isDown: false, mode: null };
  let canvasRect = null;

  // drawing settings
  function resizeCanvas(){
    canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
    canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
    canvas.style.width = canvas.clientWidth + 'px';
    canvas.style.height = canvas.clientHeight + 'px';
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    canvasRect = canvas.getBoundingClientRect();
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // utils
  function now(){ return performance.now(); }
  function formatSeconds(s){ return (s||0).toFixed(2) + 's'; }
  function floatTo16BitPCM(float32Array){
    const l = float32Array.length;
    const buffer = new ArrayBuffer(l * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < l; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Uint8Array(buffer);
  }
  function writeWAV(float32Array, sampleRate){
    const pcm = floatTo16BitPCM(float32Array);
    const wavBuffer = new ArrayBuffer(44 + pcm.length);
    const view = new DataView(wavBuffer);

    function writeString(offset, str){
      for (let i = 0; i < str.length; i++){
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcm.length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, 1, true);  // channels = 1 (mono)
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byteRate = SampleRate * NumChannels * BytesPerSample
    view.setUint16(32, 2, true); // blockAlign = NumChannels * BytesPerSample
    view.setUint16(34, 16, true); // bitsPerSample
    writeString(36, 'data');
    view.setUint32(40, pcm.length, true);

    // data
    const wavBytes = new Uint8Array(wavBuffer);
    wavBytes.set(pcm, 44);
    return new Blob([wavBytes], { type: 'audio/wav' });
  }

  // create audio context + capture nodes
  async function ensureAudio() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    sampleRate = audioContext.sampleRate || 44100;
    sampleRateEl.textContent = sampleRate + 'Hz';
    gainNode = audioContext.createGain();
    filterNode = audioContext.createBiquadFilter();
    filterNode.type = 'lowpass';
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
  }

  // start recording capturing raw PCM via ScriptProcessor (fallback) and also visual via AnalyserNode
  async function startRecording(){
    if (recording) return;
    await ensureAudio();
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      alert('Microphone access denied or unavailable: ' + err.message);
      return;
    }
    sourceNode = audioContext.createMediaStreamSource(micStream);
    // create ScriptProcessor for capture (buffer size 4096)
    const bufferSize = 4096;
    const channels = 1; // convert to mono
    processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    sourceNode.connect(gainNode);
    gainNode.connect(filterNode);
    filterNode.connect(analyser);
    analyser.connect(processor);
    processor.connect(audioContext.destination); // keep node alive

    // on audio process, copy channel data
    processor.onaudioprocess = (e) => {
      if (!recording) return;
      let input = e.inputBuffer.getChannelData(0);
      // copy to Float32Array
      recBuffers.push(new Float32Array(input));
      updateDuration();
    };

    // also connect source -> analyser for visualization (we already do through filter)
    recording = true;
    startTime = Date.now();
    btnRecord.disabled = true;
    btnStop.disabled = false;
    btnPlay.disabled = true;
    btnExport.disabled = true;
    drawLoop();
  }

  function stopRecording(){
    if (!recording) return;
    recording = false;
    // disconnect nodes
    try {
      processor.disconnect();
      analyser.disconnect();
      filterNode.disconnect();
      gainNode.disconnect();
      sourceNode.disconnect();
    } catch(e){}
    // stop mic tracks
    if (micStream){
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    // stitch buffers
    recordedBuffer = mergeBuffers(recBuffers);
    audioBufferLength = recordedBuffer.length;
    recBuffers = []; // clear temp
    updateDuration();
    btnRecord.disabled = false;
    btnStop.disabled = true;
    btnPlay.disabled = false;
    btnExport.disabled = false;
    renderClipsList();
    renderWaveform(); // draw final waveform
  }

  // helpers: merge buffers
  function mergeBuffers(buffers){
    if (!buffers || !buffers.length) return new Float32Array(0);
    let totalLen = 0;
    buffers.forEach(b => totalLen += b.length);
    const result = new Float32Array(totalLen);
    let offset = 0;
    buffers.forEach(b => { result.set(b, offset); offset += b.length; });
    return result;
  }

  // Playback
  function playBuffer(offsetSec = 0){
    if (!recordedBuffer || recordedBuffer.length === 0) return;
    if (isPlaying) stopPlayback();
    ensureAudio().then(()=>{
      const buffer = audioContext.createBuffer(1, recordedBuffer.length, sampleRate);
      buffer.getChannelData(0).set(recordedBuffer);
      playbackSource = audioContext.createBufferSource();
      playbackSource.buffer = buffer;

      // apply nodes: gain -> filter -> analyser -> destination
      const playGain = audioContext.createGain();
      playGain.gain.value = Number(gainEl.value) || 1;
      const playFilter = audioContext.createBiquadFilter();
      if (filterTypeEl.value === 'none') playFilter.type = 'allpass';
      else playFilter.type = filterTypeEl.value;
      playbackSource.connect(playGain);
      playGain.connect(playFilter);
      playFilter.connect(audioContext.destination);

      const startOffset = Math.max(0, offsetSec);
      playStartAt = audioContext.currentTime;
      playbackSource.start(0, startOffset);
      isPlaying = true;
      btnPlay.disabled = true;
      btnPause.disabled = false;

      playbackSource.onended = () => {
        isPlaying = false;
        btnPlay.disabled = false;
        btnPause.disabled = true;
      };
    });
  }

  function pausePlayback(){
    if (!isPlaying || !playbackSource) return;
    try {
      playbackSource.stop();
    } catch(e){}
    isPlaying = false;
    btnPlay.disabled = false;
    btnPause.disabled = true;
  }

  function stopPlayback(){
    if (playbackSource){
      try { playbackSource.stop(); } catch(e){}
      playbackSource.disconnect();
      playbackSource = null;
    }
    isPlaying = false;
    btnPlay.disabled = false;
    btnPause.disabled = true;
  }

  // waveform rendering and selection handles
  let animationId = null;
  function drawLoop(){
    // while recording, update visual from analyser
    renderWaveform(true);
    animationId = requestAnimationFrame(drawLoop);
  }

  function renderWaveform(live=false){
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // draw background grid
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(0, canvas.height / (window.devicePixelRatio||1) / 2);
    // data to draw: either analyser time domain (live) or recordedBuffer
    let data = null;
    if (live && analyser){
      const arr = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(arr);
      data = new Float32Array(arr.length);
      for (let i=0;i<arr.length;i++) data[i] = (arr[i] - 128) / 128;
    } else if (recordedBuffer && recordedBuffer.length){
      data = recordedBuffer;
    } else {
      // nothing: draw center line
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(0,0); ctx.lineTo(canvas.clientWidth, 0);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // draw waveform
    const step = Math.ceil(data.length / canvas.clientWidth);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(14,165,164,0.95)';
    ctx.beginPath();
    for (let x=0, i=0; x < canvas.clientWidth && i < data.length; x++, i += step){
      const v = data[i];
      const y = v * (canvas.clientHeight / (window.devicePixelRatio||1) / 2 - 8);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // draw selection overlay if recordedBuffer exists
    if (recordedBuffer && recordedBuffer.length){
      const total = recordedBuffer.length;
      const startX = Math.round((sel.start * sampleRate) / Math.max(1, total) * canvas.clientWidth);
      const endX = Math.round((sel.end * sampleRate) / Math.max(1, total) * canvas.clientWidth);
      ctx.fillStyle = 'rgba(37,99,235,0.12)';
      ctx.fillRect(startX, -canvas.clientHeight, Math.max(2, endX - startX), canvas.clientHeight * 2);
      // handles
      ctx.fillStyle = 'rgba(37,99,235,0.9)';
      ctx.fillRect(startX - 3, -18, 6, 36);
      ctx.fillRect(endX - 3, -18, 6, 36);
    }

    ctx.restore();
    // update selection info
    if (recordedBuffer && recordedBuffer.length){
      selInfo.textContent = `start: ${formatSeconds(sel.start)}  end: ${formatSeconds(sel.end)}  length: ${formatSeconds(sel.end - sel.start)}`;
    } else {
      selInfo.textContent = 'none';
    }
  }

  // canvas mouse interactions for direct selection dragging
  canvas.addEventListener('mousedown', (ev) => {
    if (!recordedBuffer || recordedBuffer.length === 0) return;
    mouse.isDown = true;
    const x = ev.offsetX;
    const total = recordedBuffer.length;
    const clickedSec = (x / canvas.clientWidth) * (total / sampleRate);
    // decide if near handles (within 12px)
    const startX = (sel.start * sampleRate) / Math.max(1, total) * canvas.clientWidth;
    const endX = (sel.end * sampleRate) / Math.max(1, total) * canvas.clientWidth;
    if (Math.abs(x - startX) < 12) mouse.mode = 'drag-start';
    else if (Math.abs(x - endX) < 12) mouse.mode = 'drag-end';
    else mouse.mode = 'set-range', sel._dragOrigin = clickedSec;
  });
  canvas.addEventListener('mousemove', (ev) => {
    if (!mouse.isDown || !recordedBuffer || recordedBuffer.length === 0) return;
    const x = ev.offsetX;
    const total = recordedBuffer.length;
    const sec = (x / canvas.clientWidth) * (total / sampleRate);
    if (mouse.mode === 'drag-start'){
      sel.start = Math.max(0, Math.min(sec, sel.end - 1/sampleRate));
    } else if (mouse.mode === 'drag-end'){
      sel.end = Math.min(total / sampleRate, Math.max(sec, sel.start + 1/sampleRate));
    } else if (mouse.mode === 'set-range'){
      const origin = sel._dragOrigin || 0;
      if (sec >= origin){
        sel.start = origin; sel.end = sec;
      } else {
        sel.start = sec; sel.end = origin;
      }
    }
    renderWaveform();
  });
  window.addEventListener('mouseup', ()=> { mouse.isDown = false; mouse.mode = null; });

  canvas.addEventListener('click', (ev) => {
    if (!recordedBuffer || recordedBuffer.length === 0) return;
    const x = ev.offsetX;
    const total = recordedBuffer.length;
    const sec = (x / canvas.clientWidth) * (total / sampleRate);
    // if no selection or click outside selection, set small selection around click
    if (sec < sel.start || sec > sel.end){
      sel.start = Math.max(0, sec - 0.5);
      sel.end = Math.min(total / sampleRate, sec + 0.5);
    } else {
      // click inside toggles play from here
      playBuffer(sec);
    }
    renderWaveform();
  });

  // buttons actions
  btnRecord.addEventListener('click', () => { recBuffers = []; sel = {start:0,end:0}; startRecording(); });
  btnStop.addEventListener('click', () => { stopRecording(); });
  btnPlay.addEventListener('click', () => { playBuffer(sel.start || 0); });
  btnPause.addEventListener('click', () => { pausePlayback(); });
  btnClear.addEventListener('click', () => {
    if (confirm('Clear recorded data?')) {
      recBuffers = []; recordedBuffer = null; audioBufferLength = 0; sel = {start:0,end:0}; renderWaveform();
      btnPlay.disabled = true; btnExport.disabled = true; clipsDiv.textContent = 'No clips yet';
    }
  });

  btnExport.addEventListener('click', () => {
    if (!recordedBuffer || recordedBuffer.length === 0) return alert('No audio to export');
    // export selection or whole buffer
    const startSample = Math.floor(sel.start * sampleRate);
    const endSample = Math.floor(sel.end * sampleRate);
    const slice = recordedBuffer.subarray(startSample, endSample);
    const wavBlob = writeWAV(slice, sampleRate);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording_${Date.now()}.wav`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  });

  btnSetStart.addEventListener('click', () => {
    // set to center play time if playing, else 0
    let sec = 0;
    if (isPlaying && audioContext) sec = audioContext.currentTime - playStartAt;
    sel.start = Math.max(0, Math.min(sec, (recordedBuffer?recordedBuffer.length/sampleRate:0)));
    if (sel.end <= sel.start) sel.end = Math.min((recordedBuffer?recordedBuffer.length/sampleRate:0), sel.start + 1);
    renderWaveform();
  });
  btnSetEnd.addEventListener('click', () => {
    let sec = 0;
    if (isPlaying && audioContext) sec = audioContext.currentTime - playStartAt;
    sel.end = Math.max(sel.start + 1/sampleRate, Math.min(sec, (recordedBuffer?recordedBuffer.length/sampleRate:0)));
    renderWaveform();
  });
  btnTrim.addEventListener('click', () => {
    if (!recordedBuffer || recordedBuffer.length === 0) return;
    const startSample = Math.floor(sel.start * sampleRate);
    const endSample = Math.floor(sel.end * sampleRate);
    if (endSample <= startSample) return alert('Invalid selection');
    recordedBuffer = recordedBuffer.subarray(startSample, endSample);
    audioBufferLength = recordedBuffer.length;
    // reset selection to full
    sel.start = 0; sel.end = recordedBuffer.length / sampleRate;
    renderWaveform();
    renderClipsList();
  });

  btnNormalize.addEventListener('click', () => {
    if (!recordedBuffer || recordedBuffer.length === 0) return;
    // find max absolute
    let max = 0;
    for (let i=0;i<recordedBuffer.length;i++) max = Math.max(max, Math.abs(recordedBuffer[i]));
    if (max === 0) return;
    const gain = 1 / max;
    for (let i=0;i<recordedBuffer.length;i++) recordedBuffer[i] *= gain;
    renderWaveform();
    alert('Normalized (gain ' + gain.toFixed(2) + ')');
  });

  // update duration display based on recordedBuffer or recBuffers
  function updateDuration(){
    let d = 0;
    if (recording){
      let len = 0;
      recBuffers.forEach(b=> len += b.length);
      d = len / sampleRate;
    } else if (recordedBuffer){
      d = recordedBuffer.length / sampleRate;
    }
    durationEl.textContent = d.toFixed(2) + 's';
    // if no selection set, default selection = full length
    if (recordedBuffer && (!sel || sel.end === 0)){
      sel.start = 0; sel.end = recordedBuffer.length / sampleRate;
    }
  }

  // list recorded clips UI (simple)
  function renderClipsList(){
    if (!recordedBuffer || recordedBuffer.length === 0){
      clipsDiv.textContent = 'No clips yet';
      return;
    }
    const len = (recordedBuffer.length / sampleRate).toFixed(2) + 's';
    clipsDiv.innerHTML = `<div>Clip: ${len} — samples: ${recordedBuffer.length}</div>`;
  }

  // when gain/filter controls change
  gainEl.addEventListener('input', () => {
    if (gainNode) gainNode.gain.value = Number(gainEl.value);
  });
  filterTypeEl.addEventListener('change', () => {
    if (filterNode) {
      if (filterTypeEl.value === 'none') filterNode.type = 'allpass';
      else filterNode.type = filterTypeEl.value;
    }
  });

  // initialize selection defaults
  sel = { start: 0, end: 0 };

  // visual update loop for final waveform (not recording)
  setInterval(() => {
    if (!recording) renderWaveform(false);
    updateDuration();
  }, 300);

  // clean up on page unload
  window.addEventListener('beforeunload', () => {
    try { if (micStream) micStream.getTracks().forEach(t => t.stop()); } catch(e){}
    try { if (audioContext) audioContext.close(); } catch(e){}
  });

})();
