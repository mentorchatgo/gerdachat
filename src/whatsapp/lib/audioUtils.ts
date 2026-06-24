// Tools for converting audio formats for Gemini Live API

export function float32ToPCM16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Increase the gain dynamically to help the backend VAD
    const s = Math.max(-1, Math.min(1, float32Array[i] * 3.0));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

export function pcm16ToFloat32(int16Array: Int16Array): Float32Array {
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    const s = int16Array[i];
    float32Array[i] = s < 0 ? s / 0x8000 : s / 0x7fff;
  }
  return float32Array;
}

export function base64ToPcm16(base64: string): Int16Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export function pcm16ToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = '';
  // Chunking to avoid "Maximum call stack size exceeded" on large arrays
  const chunkSize = 0x8000; 
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

export function pcm16ToWavBlobUrl(pcmBase64: string, sampleRate: number = 24000): { url: string; duration: string } {
  const pcmBytes = base64ToPcm16(pcmBase64);
  const buffer = new ArrayBuffer(44 + pcmBytes.length * 2);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + pcmBytes.length * 2, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample

  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, pcmBytes.length * 2, true);

  // Copy PCM bytes
  const outputBytes = new Int16Array(buffer, 44, pcmBytes.length);
  outputBytes.set(pcmBytes);

  const blob = new Blob([buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);

  const durationSec = pcmBytes.length / sampleRate;
  const m = Math.floor(durationSec / 60);
  const s = Math.floor(durationSec % 60);
  const duration = `${m}:${s < 10 ? '0' : ''}${s}`;

  return { url, duration };
}

// Very basic resampler: drop or duplicate samples. Good enough for speech 48k -> 16k usually.
export class AudioResampler {
  static resample(input: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
    if (inputSampleRate === outputSampleRate) return input;
    const ratio = inputSampleRate / outputSampleRate;
    const size = Math.round(input.length / ratio);
    const output = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      output[i] = input[Math.floor(i * ratio)];
    }
    return output;
  }
}
