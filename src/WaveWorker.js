'use strict';

const BYTES_PER_SAMPLE = Int16Array.BYTES_PER_ELEMENT; // This means 16-bit wav file.

class WaveEncoder {
  /**
   * Encode buffers to the target format.
   * @param {Float32Array[]} channelBuffers - original array of Float32Array.buffer
   *                                         from inputBuffer.getChannelData().
   * @param {AudioBuffer} audioBufferProperty - object copied from an audioBuffer
   *                                         except methods
   * @return {ArrayBuffer} - Generated ArrayBuffer that contains encoded result.
   */
  encode (channelBuffers, audioBufferProperty) {
    const { sampleRate, length, duration, numberOfChannels } = audioBufferProperty; // eslint-disable-line

    const encodedBuffer = new ArrayBuffer(length * BYTES_PER_SAMPLE * numberOfChannels);
    const encodedView = new DataView(encodedBuffer);

    // Convert Float32 to Int16
    for (let ch = 0; ch < numberOfChannels; ch++) {
      for (let i = 0; i < length; i++) {
        const offset = (i * numberOfChannels + ch) * BYTES_PER_SAMPLE;
        // Clamp value
        let sample = (channelBuffers[ch][i] * 0x7FFF) | 0;
        if (sample > 0x7FFF) {
          sample = 0x7FFF | 0;
        } else if (sample < -0x8000) {
          sample = -0x8000 | 0;
        }
        // Then store
        encodedView.setInt16(offset, sample | 0, true);
      }
    }
    return encodedBuffer;
  }
}

const encoder = new WaveEncoder();

self.onmessage = (e) => {
  const { command, channelBuffers, audioBufferProperty } = e.data;
  switch (command) {
    case 'encode':
      const encoded = encoder.encode(channelBuffers, audioBufferProperty);
      self.postMessage(
        {
          command: 'encoded',
          buffer: encoded,
          duration: audioBufferProperty.duration
        },
        [encoded]
      );
      break;
    default:
      break; // Ignore
  }
};
