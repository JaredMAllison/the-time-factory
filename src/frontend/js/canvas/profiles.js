// ─── Visual Profile ───────────────────────────────────────────────────────────
const visualProfile = {
  background: '#0d0d0f',

  preview: {
    overlayColor: 'rgba(0,0,0,0.55)',
    meshColor:    'rgba(255,255,255,0.03)',
    meshSpacing:  20,
  },

  station: {
    floorColor:     '#141418',
    frameColor:     '#4a5060',
    frameWidth:     6,
    rivetColor:     '#5a6070',
    rivetRadius:    5,
    rivetSpacing:   40,
    warningStripe1: '#f0b429',
    warningStripe2: '#1a1a1f',
    warningStripeH: 14,
    lampColor:      'rgba(255, 240, 180, 0.07)',
    lampRadius:     0.45,
    labelColor:     '#5a6070',
    labelFont:      '11px monospace',
  },

  belt: {
    color:         '#1e1e28',
    edgeColor:     '#3a3a50',
    stripeColor:   '#2a2a38',
    height:        60,
    stripeSpacing: 40,
    stripeLength:  20,
    boltColor:     '#2e2e40',
    boltRadius:    5,
    boltSpacing:   80,
  },

  balloon: {
    radius:                36,
    floatHeight:           180,
    bobAmplitude:          8,
    bobSpeed:              1200,
    shineColor:            'rgba(255,255,255,0.25)',
    stringColor:           '#aaaaaa',
    stringWidth:           1.5,
    previewScale:          0.72,
    urgencyPulseSpeeds:    [0, 1, 2, 4],  // multipliers of bobTime frequency per urgency level
    urgencyPulseAmplitude: 0.10,          // ±10% radius oscillation
  },

  tag: {
    height:    24,
    radius:    4,
    textColor: '#ffffff',
  },
};

// ─── Sound Profile ────────────────────────────────────────────────────────────
const soundProfile = {
  rumble: {
    noiseAmplitude:  0.15,
    filterFrequency: 180,
    gain:            0.6,
    fadeIn:          0.1,
    fadeOut:         0.2,
  },
  click: {
    waveType:       'square',
    freqStart:      120,
    freqEnd:        40,
    freqDecayTime:  0.04,
    gainDecayTime:  0.06,
    duration:       0.07,
    countPerIntro:  10,
    volumeStart:    0.5,
    volumeEnd:      0.9,
  },
  clank: {
    impact:  { waveType: 'sawtooth', freqStart: 280, freqEnd: 60,  freqDecayTime: 0.3,  gain: 0.9, duration: 0.4  },
    shimmer: { waveType: 'sine',     freqStart: 1800, freqEnd: 400, freqDecayTime: 0.2, gain: 0.3, duration: 0.25 },
    offsetBeforeEnd: 100,
  },
};
