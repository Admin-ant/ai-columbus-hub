/**
 * Browser-side audio chunking for speech-to-text.
 *
 * Decodes a MediaRecorder Blob via the Web Audio API and re-encodes it as
 * 16-bit mono WAV at 16 kHz, split into chunks of a maximum duration.
 *
 * Note: decoding depends on the browser's media decoder. Chromium handles
 * webm/opus well; other browsers may need a different recorder MIME type.
 */

export type AudioSplitResult = {
  chunks: Blob[];
  duration: number;
  sampleRate: number;
  error?: string;
};

export async function splitAudioIntoChunks(
  blob: Blob,
  maxChunkSeconds = 300,
): Promise<AudioSplitResult> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();

    const duration = decoded.duration;
    const chunkCount = Math.max(1, Math.ceil(duration / maxChunkSeconds));
    const chunks: Blob[] = [];

    for (let i = 0; i < chunkCount; i++) {
      const start = i * maxChunkSeconds;
      const end = Math.min((i + 1) * maxChunkSeconds, duration);
      const wav = await encodeWavChunk(decoded, start, end);
      chunks.push(wav);
    }

    return { chunks, duration, sampleRate: decoded.sampleRate };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { chunks: [], duration: 0, sampleRate: 0, error: msg };
  }
}

export async function encodeWavChunk(
  sourceBuffer: AudioBuffer,
  startSeconds: number,
  endSeconds: number,
  targetSampleRate = 16000,
): Promise<Blob> {
  const duration = Math.max(0.001, endSeconds - startSeconds);
  const frameCount = Math.max(1, Math.ceil(targetSampleRate * duration));
  const offline = new OfflineAudioContext(1, frameCount, targetSampleRate);

  const source = offline.createBufferSource();
  const startSample = Math.floor(startSeconds * sourceBuffer.sampleRate);
  const endSample = Math.floor(endSeconds * sourceBuffer.sampleRate);
  const length = Math.max(1, endSample - startSample);

  const subBuffer = offline.createBuffer(
    sourceBuffer.numberOfChannels,
    length,
    sourceBuffer.sampleRate,
  );
  for (let c = 0; c < sourceBuffer.numberOfChannels; c++) {
    const data = sourceBuffer.getChannelData(c);
    subBuffer.copyToChannel(data.slice(startSample, endSample), c);
  }

  source.buffer = subBuffer;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  const wav = writeWav(samples, targetSampleRate);
  return new Blob([wav], { type: "audio/wav" });
}

function writeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const int = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, Math.floor(int), true);
    offset += 2;
  }

  return buffer;
}
