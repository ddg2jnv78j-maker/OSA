export type SynthPresetId =
  | 'crystal-corporate'
  | 'lofi-chill'
  | 'deshi-acoustic'
  | 'radio-electro'
  | 'islamic-noor'
  | 'night-synthwave';

export interface SynthPreset {
  id: SynthPresetId;
  nameBn: string;
  subtitleBn: string;
  musicalKey: string;
  defaultBpm: number;
  waveform: OscillatorType;
  padWaveform: OscillatorType;
  bassFreqs: number[];
  chordProgression: number[][];
  arpPattern: number[];
  accentColor: string;
  filterCutoff: number;
}

export interface ScriptTemplate {
  id: string;
  categoryBn: string;
  nameBn: string;
  lang: 'bn-BD' | 'en-US';
  recommendedPreset: SynthPresetId;
  template: string;
}

export interface StudioMixSettings {
  bgmVolume: number; // 0 to 100
  voiceVolume: number; // 0 to 100
  echoMix: number; // 0 to 100
  bpm: number; // 75 to 145
  voiceRate: number; // 0.75 to 1.35
  voicePitch: number; // 0.7 to 1.4
  voiceURI: string;
  loopPlayback: boolean;
}

export interface SavedCallerTune {
  id: string;
  title: string;
  userName: string;
  honorific: string;
  script: string;
  presetId: SynthPresetId;
  templateId: string;
  settings: StudioMixSettings;
  useAsIncomingRingtone: boolean;
  createdAt: string;
}

export const SYNTH_PRESETS: SynthPreset[] = [
  {
    id: 'crystal-corporate',
    nameBn: 'ক্রিস্টাল কর্পোরেট সিন্থ',
    subtitleBn: 'পরিচ্ছন্ন ডিজিটাল কর্ড ও মৃদু বেল অর্পেজিও',
    musicalKey: 'A Major',
    defaultBpm: 106,
    waveform: 'triangle',
    padWaveform: 'sine',
    bassFreqs: [110.0, 146.83, 164.81, 138.59],
    chordProgression: [
      [220.0, 277.18, 329.63, 440.0],
      [293.66, 369.99, 440.0, 587.33],
      [329.63, 415.3, 493.88, 659.25],
      [277.18, 329.63, 415.3, 554.37],
    ],
    arpPattern: [440, 554.37, 659.25, 880, 659.25, 554.37, 440, 659.25],
    accentColor: '#f59e0b',
    filterCutoff: 2400,
  },
  {
    id: 'lofi-chill',
    nameBn: 'ডিজিটাল লো-ফাই চিল',
    subtitleBn: 'নরম ইলেকট্রিক পিয়ানো প্যাড ও রিলাক্সড রিদম',
    musicalKey: 'F Maj7',
    defaultBpm: 86,
    waveform: 'sine',
    padWaveform: 'triangle',
    bassFreqs: [87.31, 82.41, 73.42, 65.41],
    chordProgression: [
      [174.61, 220.0, 261.63, 329.63],
      [164.81, 196.0, 246.94, 293.66],
      [146.83, 174.61, 220.0, 261.63],
      [130.81, 164.81, 196.0, 246.94],
    ],
    arpPattern: [349.23, 440.0, 523.25, 659.25, 523.25, 440.0, 392.0, 329.63],
    accentColor: '#10b981',
    filterCutoff: 1450,
  },
  {
    id: 'deshi-acoustic',
    nameBn: 'বাংলা ফিউশন হারমোনি',
    subtitleBn: 'দেশি পেন্টাটনিক মেলোডি ও মৃদু রিদমিক পালস',
    musicalKey: 'G Pentatonic',
    defaultBpm: 98,
    waveform: 'triangle',
    padWaveform: 'sine',
    bassFreqs: [98.0, 110.0, 130.81, 98.0],
    chordProgression: [
      [196.0, 246.94, 293.66, 392.0],
      [220.0, 261.63, 329.63, 440.0],
      [261.63, 329.63, 392.0, 523.25],
      [196.0, 246.94, 293.66, 392.0],
    ],
    arpPattern: [392.0, 440.0, 493.88, 587.33, 659.25, 587.33, 493.88, 440.0],
    accentColor: '#0ea5e9',
    filterCutoff: 2100,
  },
  {
    id: 'radio-electro',
    nameBn: 'এফএম রেডিও ইলেকট্রো বিট',
    subtitleBn: 'ডিজিটাল বেসলাইন ও এনার্জেটিক ব্রডকাস্ট সিন্থ',
    musicalKey: 'C Minor',
    defaultBpm: 122,
    waveform: 'sawtooth',
    padWaveform: 'triangle',
    bassFreqs: [65.41, 77.78, 87.31, 98.0],
    chordProgression: [
      [261.63, 311.13, 392.0, 523.25],
      [233.08, 293.66, 349.23, 466.16],
      [207.65, 261.63, 311.13, 415.3],
      [196.0, 246.94, 293.66, 392.0],
    ],
    arpPattern: [523.25, 622.25, 783.99, 1046.5, 783.99, 622.25, 587.33, 493.88],
    accentColor: '#f97316',
    filterCutoff: 2900,
  },
  {
    id: 'islamic-noor',
    nameBn: 'সৌম্য নূর-সালাম টিউন',
    subtitleBn: 'শান্ত আধ্যাত্মিক চাইম ও গভীর অ্যাম্বিয়েন্ট প্যাড',
    musicalKey: 'D Dorian',
    defaultBpm: 88,
    waveform: 'sine',
    padWaveform: 'sine',
    bassFreqs: [73.42, 87.31, 98.0, 73.42],
    chordProgression: [
      [146.83, 220.0, 293.66, 349.23],
      [174.61, 261.63, 349.23, 440.0],
      [164.81, 246.94, 329.63, 392.0],
      [146.83, 220.0, 293.66, 329.63],
    ],
    arpPattern: [587.33, 659.25, 698.46, 880.0, 783.99, 698.46, 659.25, 587.33],
    accentColor: '#14b8a6',
    filterCutoff: 1700,
  },
  {
    id: 'night-synthwave',
    nameBn: 'ডিজিটাল সিন্থওয়েভ স্টুডিও',
    subtitleBn: 'ডিপ স্টুডিও অর্পেজিও ও আধুনিক নাইট পালস',
    musicalKey: 'A Minor',
    defaultBpm: 114,
    waveform: 'sawtooth',
    padWaveform: 'sawtooth',
    bassFreqs: [55.0, 65.41, 73.42, 82.41],
    chordProgression: [
      [220.0, 261.63, 329.63, 440.0],
      [174.61, 220.0, 261.63, 349.23],
      [196.0, 246.94, 293.66, 392.0],
      [164.81, 196.0, 246.94, 329.63],
    ],
    arpPattern: [440, 523.25, 659.25, 880, 987.77, 880, 659.25, 523.25],
    accentColor: '#6366f1',
    filterCutoff: 2500,
  },
];

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'islamic-formal',
    categoryBn: 'সালাম ও মার্জিত',
    nameBn: 'মার্জিত বাংলা ও সালাম',
    lang: 'bn-BD',
    recommendedPreset: 'islamic-noor',
    template:
      'আসসালামু আলাইকুম। {name} কে কল করার জন্য আন্তরিক ধন্যবাদ। আপনার কলটি কানেক্ট করা হচ্ছে, অনুগ্রহ করে একটু অপেক্ষা করুন।',
  },
  {
    id: 'pro-office',
    categoryBn: 'প্রফেশনাল',
    nameBn: 'কর্পোরেট ও অফিসিয়াল',
    lang: 'bn-BD',
    recommendedPreset: 'crystal-corporate',
    template:
      'নমস্কার ও শুভেচ্ছা। আপনি {name} এর ডিজিটাল নাম্বারে কল করেছেন। সংযোগ স্থাপন করা হচ্ছে, অনুগ্রহ করে লাইনে থাকুন।',
  },
  {
    id: 'friendly-adda',
    categoryBn: 'বন্ধুত্বপূর্ণ',
    nameBn: 'দেশি বন্ধুত্বপূর্ণ স্টাইল',
    lang: 'bn-BD',
    recommendedPreset: 'deshi-acoustic',
    template:
      'হ্যালো বন্ধু! {name} হয়তো খুব কাছেই আছে। লাইন কাটবেন না, কয়েক সেকেন্ডের মধ্যেই আপনার কলটি রিসিভ করা হবে!',
  },
  {
    id: 'radio-dj',
    categoryBn: 'স্টাইলিশ',
    nameBn: 'ডিজিটাল রেডিও ও আরজে',
    lang: 'bn-BD',
    recommendedPreset: 'radio-electro',
    template:
      'ওয়েলকাম টু OSA ডিজিটাল স্টুডিও! {name} কে কল করার জন্য স্পেশাল ধন্যবাদ। মিউজিক উপভোগ করুন, কথা শুরু হচ্ছে এখনই!',
  },
  {
    id: 'chill-night',
    categoryBn: 'রিল্যাক্স',
    nameBn: 'নাইট চিল ও সংক্ষিপ্ত',
    lang: 'bn-BD',
    recommendedPreset: 'lofi-chill',
    template:
      'একটু ধৈর্য ধরুন, {name} এর সাথে আপনার কথোপকথন শুরু হচ্ছে। ভালো থাকুন, সাথে থাকুন।',
  },
  {
    id: 'english-studio',
    categoryBn: 'English',
    nameBn: 'মডার্ন ইংলিশ ডিজিটাল',
    lang: 'en-US',
    recommendedPreset: 'night-synthwave',
    template:
      'Hello! Thank you for calling {name}. Connecting you now via OSA Digital Audio Studio. Please hold on.',
  },
];

export const DEFAULT_MIX_SETTINGS: StudioMixSettings = {
  bgmVolume: 72,
  voiceVolume: 92,
  echoMix: 34,
  bpm: 106,
  voiceRate: 0.96,
  voicePitch: 1.04,
  voiceURI: '',
  loopPlayback: true,
};

const SAVED_TUNES_KEY = 'osa_saved_caller_tunes_v2';
const ACTIVE_TUNE_KEY = 'osa_custom_caller_tune';
export const CALLER_TUNE_CHANGED_EVENT = 'osa-caller-tune-changed';

export function getPresetById(id: SynthPresetId): SynthPreset {
  return SYNTH_PRESETS.find((p) => p.id === id) || SYNTH_PRESETS[0];
}

export function formatCallerDisplayName(rawName: string, honorific: string): string {
  const cleanName = rawName.trim() || 'ইউজার';
  const cleanHon = honorific.trim();
  return cleanHon ? `${cleanName} ${cleanHon}` : cleanName;
}

export function buildCallerScript(
  templateText: string,
  userName: string,
  honorific: string
): string {
  const display = formatCallerDisplayName(userName, honorific);
  return templateText.replace(/\{name\}/g, display);
}

export function loadSavedCallerTunes(): SavedCallerTune[] {
  try {
    const raw = localStorage.getItem(SAVED_TUNES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

export function saveCallerTunesList(list: SavedCallerTune[]): void {
  try {
    localStorage.setItem(SAVED_TUNES_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
}

export function getActiveCallerTune(): SavedCallerTune | null {
  try {
    const raw = localStorage.getItem(ACTIVE_TUNE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.presetId) {
      return parsed as SavedCallerTune;
    }
    // Migrate legacy v1 entry gracefully
    if (parsed && typeof parsed === 'object' && parsed.phrase) {
      return {
        id: 'legacy-active',
        title: `${parsed.name || 'আমার'} কলার টিউন`,
        userName: parsed.name || 'ইউজার',
        honorific: '',
        script: parsed.phrase,
        presetId: 'crystal-corporate',
        templateId: 'islamic-formal',
        settings: DEFAULT_MIX_SETTINGS,
        useAsIncomingRingtone: false,
        createdAt: new Date().toISOString(),
      };
    }
  } catch {
    // Ignore
  }
  return null;
}

export function setActiveCallerTune(tune: SavedCallerTune | null): void {
  try {
    if (!tune) {
      localStorage.removeItem(ACTIVE_TUNE_KEY);
    } else {
      localStorage.setItem(ACTIVE_TUNE_KEY, JSON.stringify(tune));
    }
    window.dispatchEvent(
      new CustomEvent(CALLER_TUNE_CHANGED_EVENT, { detail: tune })
    );
  } catch {
    // Ignore
  }
}

/**
 * Generates an audio bus node graph for echo + master output.
 */
function createStudioAudioBus(
  ctx: BaseAudioContext,
  bgmGainValue: number,
  echoAmount: number,
  filterCutoff: number
) {
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.9;

  const bgmBus = ctx.createGain();
  bgmBus.gain.value = Math.max(0, Math.min(1, bgmGainValue));

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterCutoff;
  filter.Q.value = 1.1;

  // Studio Stereo/Feedback Delay Echo
  const delayNode = ctx.createDelay(1.0);
  delayNode.delayTime.value = 0.28;
  const feedbackGain = ctx.createGain();
  feedbackGain.gain.value = 0.28 * echoAmount;
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.35 * echoAmount;

  bgmBus.connect(filter);
  filter.connect(masterGain);

  if (echoAmount > 0.02) {
    filter.connect(delayNode);
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);
    delayNode.connect(wetGain);
    wetGain.connect(masterGain);
  }

  return { masterGain, bgmBus, delayNode, wetGain };
}

/**
 * Schedules one 4-bar musical phrase (16 eighth-note steps) on any AudioContext or OfflineAudioContext.
 * Returns total phrase duration in seconds.
 */
export function scheduleSynthPhrase(
  ctx: BaseAudioContext,
  bgmBus: AudioNode,
  preset: SynthPreset,
  bpm: number,
  startTime: number
): number {
  const stepSec = 60 / Math.max(70, Math.min(160, bpm)) / 2; // eighth note duration
  const totalSteps = 16;
  const totalDuration = totalSteps * stepSec;

  for (let step = 0; step < totalSteps; step++) {
    const t = startTime + step * stepSec;
    const barIdx = Math.floor(step / 4) % preset.chordProgression.length;
    const chord = preset.chordProgression[barIdx];

    // 1. Chord pad on start of every bar (steps 0, 4, 8, 12)
    if (step % 4 === 0) {
      const chordDur = stepSec * 3.85;
      chord.forEach((freq, noteIdx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = preset.padWaveform;
        osc.frequency.setValueAtTime(freq, t);
        // Gentle detune shimmer
        osc.detune.setValueAtTime((noteIdx % 2 === 0 ? 1 : -1) * 4, t);

        const peak = 0.055 / Math.sqrt(chord.length);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(peak, t + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + chordDur);

        osc.connect(gain);
        gain.connect(bgmBus);
        osc.start(t);
        osc.stop(t + chordDur + 0.03);
      });

      // Warm Bass hit
      const bassFreq = preset.bassFreqs[barIdx % preset.bassFreqs.length];
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'sine';
      bassOsc.frequency.setValueAtTime(bassFreq, t);
      bassGain.gain.setValueAtTime(0.0001, t);
      bassGain.gain.linearRampToValueAtTime(0.16, t + 0.02);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, t + stepSec * 3.2);
      bassOsc.connect(bassGain);
      bassGain.connect(bgmBus);
      bassOsc.start(t);
      bassOsc.stop(t + stepSec * 3.3);
    }

    // 2. Melodic Digital Arpeggio pluck
    const arpFreq = preset.arpPattern[step % preset.arpPattern.length];
    const arpOsc = ctx.createOscillator();
    const arpGain = ctx.createGain();
    arpOsc.type = preset.waveform;
    arpOsc.frequency.setValueAtTime(arpFreq, t);

    const arpPeak = step % 2 === 0 ? 0.08 : 0.048;
    arpGain.gain.setValueAtTime(0.0001, t);
    arpGain.gain.linearRampToValueAtTime(arpPeak, t + 0.014);
    arpGain.gain.exponentialRampToValueAtTime(0.0001, t + stepSec * 0.92);

    arpOsc.connect(arpGain);
    arpGain.connect(bgmBus);
    arpOsc.start(t);
    arpOsc.stop(t + stepSec * 0.95);

    // 3. Soft digital percussive pulse (kick on 0, 8; hi-hat tick on offbeats)
    if (step % 4 === 0) {
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(115, t);
      kickOsc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
      kickGain.gain.setValueAtTime(0.15, t);
      kickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      kickOsc.connect(kickGain);
      kickGain.connect(bgmBus);
      kickOsc.start(t);
      kickOsc.stop(t + 0.13);
    } else if (step % 2 === 1) {
      // Crisp micro digital tick
      const tickOsc = ctx.createOscillator();
      const tickGain = ctx.createGain();
      tickOsc.type = 'triangle';
      tickOsc.frequency.setValueAtTime(3400, t);
      tickGain.gain.setValueAtTime(0.018, t);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
      tickOsc.connect(tickGain);
      tickGain.connect(bgmBus);
      tickOsc.start(t);
      tickOsc.stop(t + 0.032);
    }
  }

  return totalDuration;
}

/**
 * Live Interactive Studio Playback Engine with AnalyserNode + Recorded Mic Buffer support.
 */
export class LiveCallerTuneEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private bgmBus: AudioNode | null = null;
  private timerId: number | null = null;
  private recordedSource: AudioBufferSourceNode | null = null;
  private isRunning = false;
  private currentPreset: SynthPreset = SYNTH_PRESETS[0];
  private currentSettings: StudioMixSettings = { ...DEFAULT_MIX_SETTINGS };

  public start(
    preset: SynthPreset,
    settings: StudioMixSettings,
    recordedAudioBuffer?: AudioBuffer | null
  ): AnalyserNode | null {
    this.stop();
    this.currentPreset = preset;
    this.currentSettings = { ...settings };

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;

    const bus = createStudioAudioBus(
      ctx,
      settings.bgmVolume / 100,
      settings.echoMix / 100,
      preset.filterCutoff
    );
    bus.masterGain.connect(analyser);
    analyser.connect(ctx.destination);

    this.ctx = ctx;
    this.analyser = analyser;
    this.masterGain = bus.masterGain;
    this.bgmBus = bus.bgmBus;
    this.isRunning = true;

    const scheduleLoop = () => {
      if (!this.isRunning || !this.ctx || !this.bgmBus) return;
      const phraseSec = scheduleSynthPhrase(
        this.ctx,
        this.bgmBus,
        this.currentPreset,
        this.currentSettings.bpm,
        this.ctx.currentTime + 0.04
      );
      if (this.currentSettings.loopPlayback) {
        this.timerId = window.setTimeout(scheduleLoop, phraseSec * 1000 - 80);
      }
    };

    scheduleLoop();

    // If user recorded custom studio voice, play it mixed with echo!
    if (recordedAudioBuffer && ctx) {
      try {
        const voiceSrc = ctx.createBufferSource();
        voiceSrc.buffer = recordedAudioBuffer;
        voiceSrc.loop = settings.loopPlayback;

        const voiceGain = ctx.createGain();
        voiceGain.gain.value = (settings.voiceVolume / 100) * 1.15;

        voiceSrc.connect(voiceGain);
        voiceGain.connect(bus.masterGain);
        if (settings.echoMix > 4) {
          voiceGain.connect(bus.delayNode);
        }
        voiceSrc.start(ctx.currentTime + 0.35);
        this.recordedSource = voiceSrc;
      } catch {
        // Ignore voice playback issue
      }
    }

    return analyser;
  }

  public updateMix(preset: SynthPreset, settings: StudioMixSettings): void {
    this.currentPreset = preset;
    this.currentSettings = { ...settings };
    if (this.bgmBus && this.ctx && this.bgmBus instanceof GainNode) {
      this.bgmBus.gain.setTargetAtTime(
        Math.max(0, Math.min(1, settings.bgmVolume / 100)),
        this.ctx.currentTime,
        0.04
      );
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.recordedSource) {
      try {
        this.recordedSource.stop();
        this.recordedSource.disconnect();
      } catch {}
      this.recordedSource = null;
    }
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {}
      this.masterGain = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
    this.analyser = null;
    this.bgmBus = null;
  }
}

/**
 * Encodes an AudioBuffer into a standard 16-bit PCM RIFF WAV Blob.
 */
function encodeAudioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Renders the studio caller tune (2 musical phrases + optional user recorded mic buffer + echo DSP)
 * into a crisp downloadable 44.1kHz WAV Blob using OfflineAudioContext.
 */
export async function renderCallerTuneToWavBlob(
  preset: SynthPreset,
  settings: StudioMixSettings,
  recordedBuffer?: AudioBuffer | null,
  phraseLoops = 2
): Promise<Blob> {
  const sampleRate = 44100;
  const stepSec = 60 / Math.max(70, Math.min(160, settings.bpm)) / 2;
  const singlePhraseSec = 16 * stepSec;
  const musicDuration = singlePhraseSec * phraseLoops;
  const voiceDuration = recordedBuffer ? recordedBuffer.duration + 0.6 : 0;
  const totalSec = Math.max(musicDuration, voiceDuration) + 0.6;
  const totalSamples = Math.ceil(sampleRate * totalSec);

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  const offline = new OfflineCtx(2, totalSamples, sampleRate);
  const bus = createStudioAudioBus(
    offline,
    settings.bgmVolume / 100,
    settings.echoMix / 100,
    preset.filterCutoff
  );
  bus.masterGain.connect(offline.destination);

  for (let loop = 0; loop < phraseLoops; loop++) {
    scheduleSynthPhrase(
      offline,
      bus.bgmBus,
      preset,
      settings.bpm,
      0.05 + loop * singlePhraseSec
    );
  }

  if (recordedBuffer) {
    const src = offline.createBufferSource();
    src.buffer = recordedBuffer;
    const voiceGain = offline.createGain();
    voiceGain.gain.value = (settings.voiceVolume / 100) * 1.15;
    src.connect(voiceGain);
    voiceGain.connect(bus.masterGain);
    if (settings.echoMix > 4) {
      voiceGain.connect(bus.delayNode);
    }
    src.start(0.35);
  }

  const rendered = await offline.startRendering();
  return encodeAudioBufferToWavBlob(rendered);
}

/**
 * Generates a compact WAV Data URL for incoming call ringtones when custom digital tune is active.
 */
let cachedCustomRingtoneKey = '';
let cachedCustomRingtoneDataUrl: string | null = null;

export function getCachedCustomRingtoneDataUrlSync(): string | null {
  const active = getActiveCallerTune();
  if (!active || !active.useAsIncomingRingtone) {
    return null;
  }
  const cacheKey = `${active.presetId}_${active.settings.bpm}_${active.settings.bgmVolume}_${active.settings.echoMix}`;
  if (cachedCustomRingtoneKey === cacheKey && cachedCustomRingtoneDataUrl) {
    return cachedCustomRingtoneDataUrl;
  }
  return null;
}

export async function getActiveCustomRingtoneDataUrl(): Promise<string | null> {
  const active = getActiveCallerTune();
  if (!active || !active.useAsIncomingRingtone) {
    return null;
  }

  const cacheKey = `${active.presetId}_${active.settings.bpm}_${active.settings.bgmVolume}_${active.settings.echoMix}`;
  if (cachedCustomRingtoneKey === cacheKey && cachedCustomRingtoneDataUrl) {
    return cachedCustomRingtoneDataUrl;
  }

  try {
    const preset = getPresetById(active.presetId);
    const blob = await renderCallerTuneToWavBlob(preset, active.settings, null, 1);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    cachedCustomRingtoneKey = cacheKey;
    cachedCustomRingtoneDataUrl = dataUrl;
    return dataUrl;
  } catch {
    return null;
  }
}

export function warmUpCustomRingtoneCache(): void {
  getActiveCustomRingtoneDataUrl().catch(() => {});
}

if (typeof window !== 'undefined') {
  warmUpCustomRingtoneCache();
  window.addEventListener(CALLER_TUNE_CHANGED_EVENT, () => {
    cachedCustomRingtoneKey = '';
    cachedCustomRingtoneDataUrl = null;
    warmUpCustomRingtoneCache();
  });
}
