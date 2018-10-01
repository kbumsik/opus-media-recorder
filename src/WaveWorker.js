'use strict';

import { writeString } from './commonFunctions.js';

const BYTES_PER_SAMPLE = Int16Array.BYTES_PER_ELEMENT; // This means 16-bit wav file.

class _WaveEncoder {
  /**
   * Contructor
   */
  constructor (sampleRate, channelCount) {
    this.sampleRate = sampleRate;
    this.channelCount = channelCount;
    this.encodedBuffers = [];
  }

  /**
   * Encode buffers and then store.
   * @param {Float32Array[]} channelBuffers - original array of Float32Array.buffer
   *                                         from inputBuffer.getChannelData().
   * @param {number} length - Number of frames, in other words, the length of each channelBuffers.
   * @param {number} duration - Length of the buffer, in seconds
   */
  pushDataToEncode (channelBuffers, length, duration) {
    const encodedBuffer = new ArrayBuffer(length * BYTES_PER_SAMPLE * this.channelCount);
    const encodedView = new DataView(encodedBuffer);

    // Convert Float32 to Int16
    for (let ch = 0; ch < this.channelCount; ch++) {
      let channelSamples = channelBuffers[ch];

      for (let i = 0; i < length; i++) {
        // Clamp value
        let sample = (channelSamples[i] * 0x7FFF) | 0;
        if (sample > 0x7FFF) {
          sample = 0x7FFF | 0;
        } else if (sample < -0x8000) {
          sample = -0x8000 | 0;
        }
        // Then store
        const offset = (i * this.channelCount + ch) * BYTES_PER_SAMPLE;
        encodedView.setInt16(offset, sample | 0, true);
      }
    }
    this.encodedBuffers.push(encodedBuffer);
  }

  /**
   * Get stored encoding result with Wave file format header
   * @return {ArrayBuffer[]} - Array of generated ArrayBuffer that contains encoded result.
   */
  getResult () {
    /**
     * Reference: http://www-mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html
     */
    // Create header data
    let dataLength = this.encodedBuffers.reduce((acc, cur) => acc + cur.byteLength, 0);
    let header = new ArrayBuffer(44);
    let view = new DataView(header);
    // RIFF identifier 'RIFF'
    writeString(view, 0, 'RIFF');
    // file length minus RIFF identifier length and file description length
    view.setUint32(4, 36 + dataLength, true);
    // RIFF type 'WAVE'
    writeString(view, 8, 'WAVE');
    // format chunk identifier 'fmt '
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, this.channelCount, true);
    // sample rate
    view.setUint32(24, this.sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, this.sampleRate * BYTES_PER_SAMPLE * this.channelCount, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, BYTES_PER_SAMPLE * this.channelCount, true);
    // bits per sample
    view.setUint16(34, 8 * BYTES_PER_SAMPLE, true);
    // data chunk identifier 'data'
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, dataLength, true);

    // Concat two data: [...header, ...encoded]
    let buffers = [header, ...this.encodedBuffers];
    this.encodedBuffers = [];
    return buffers;
  }
}

// Notify the host ready to accept 'init' message.
self.postMessage({ command: 'readyToInit' });
/**
 * Web Worker interface for encoder.
 */
let encoder;
self.onmessage = (e) => {
  const { command } = e.data;
  switch (command) {
    case 'init':
      const { sampleRate, channelCount } = e.data;
      encoder = new _WaveEncoder(sampleRate, channelCount);
      break;
    case 'pushInputData':
      const { channelBuffers, length, duration } = e.data;
      encoder.pushDataToEncode(channelBuffers, length, duration);
      break;
    case 'getEncodedData':
    case 'done':
      const buffers = encoder.getResult();
      self.postMessage({
        command: command === 'done' ? 'lastEncodedData' : 'encodedData',
        buffers
      }, buffers);

      if (command === 'done') {
        self.close();
      }
      break;
    default:
      // Ignore
      break;
  }
};
