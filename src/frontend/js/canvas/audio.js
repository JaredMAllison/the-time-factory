// ─── Audio ────────────────────────────────────────────────────────────────────
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playRumble(duration) {
  const ac = getAudio(), s = soundProfile.rumble;
  const buf = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * s.noiseAmplitude;
  const src = ac.createBufferSource(); src.buffer = buf;
  const flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = s.filterFrequency;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, ac.currentTime);
  gain.gain.linearRampToValueAtTime(s.gain, ac.currentTime + s.fadeIn);
  gain.gain.linearRampToValueAtTime(s.gain, ac.currentTime + duration - s.fadeOut);
  gain.gain.linearRampToValueAtTime(0, ac.currentTime + duration);
  src.connect(flt); flt.connect(gain); gain.connect(ac.destination);
  src.start(); src.stop(ac.currentTime + duration);
}

function playClick(time, volume) {
  const ac = getAudio(), s = soundProfile.click;
  const osc = ac.createOscillator(), gain = ac.createGain();
  osc.type = s.waveType;
  osc.frequency.setValueAtTime(s.freqStart, time);
  osc.frequency.exponentialRampToValueAtTime(s.freqEnd, time + s.freqDecayTime);
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + s.gainDecayTime);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(time); osc.stop(time + s.duration);
}

function playArrivalClank() {
  const ac = getAudio(), now = ac.currentTime;
  const { impact, shimmer } = soundProfile.clank;
  [[impact, ac.createOscillator()], [shimmer, ac.createOscillator()]].forEach(([s, osc], i) => {
    const gain = ac.createGain();
    osc.type = s.waveType;
    osc.frequency.setValueAtTime(s.freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(s.freqEnd, now + s.freqDecayTime);
    gain.gain.setValueAtTime(s.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + s.duration);
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(now); osc.stop(now + s.duration);
  });
}

function playIntroSounds(duration) {
  const ac = getAudio(), now = ac.currentTime, s = soundProfile.click;
  const dSec = duration / 1000;
  playRumble(dSec);
  for (let i = 0; i < s.countPerIntro; i++) {
    const t = now + (i / s.countPerIntro) * dSec;
    playClick(t, s.volumeStart + (i / s.countPerIntro) * (s.volumeEnd - s.volumeStart));
  }
  setTimeout(playArrivalClank, duration - soundProfile.clank.offsetBeforeEnd);
}
