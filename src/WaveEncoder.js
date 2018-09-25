'use strict';

let BYTES_PER_SAMPLE = Int16Array.BYTES_PER_ELEMENT; // This means 16-bit wav file.

class WaveEncoder {
  constructor (recorder, scriptProcessorNode, sampleRate, channelCount) {
    this.recorder = recorder; /** @type {MediaRecorder} */
    this.processor = scriptProcessorNode; /** @type {ScriptProcessorNode} */
    this.worker = undefined; /** @type {Worker} */
    this.encodedBuffers = []; /** @type {ArrayBuffer[]} */
    this.sampleRate = sampleRate;
    this.channelCount = channelCount;
  }

  start (timeslice) {
    this.encodedBuffers = [];

    // WAV Encoding script
    this.processor.onaudioprocess = (e) => {
      const { inputBuffer, playbackTime } = e; // eslint-disable-line
      const { sampleRate, length, duration, numberOfChannels } = inputBuffer; // eslint-disable-line

      // Create channel buffers to pass to the worker
      const channelBuffers = new Array(numberOfChannels);
      for (let i = 0; i < numberOfChannels; i++) {
        channelBuffers[i] = inputBuffer.getChannelData(i);
      }

      // Pass data to the worker
      const audioBufferProperty = { sampleRate, length, duration, numberOfChannels };
      const dataToPost = { command: 'encode', channelBuffers, audioBufferProperty };
      this.worker.postMessage(dataToPost, channelBuffers.map(a => a.buffer));
    };

    // Callback when encoding completed
    let elapsedTime = 0;
    this.worker = new Worker('WaveWorker.js');
    this.worker.onmessage = (e) => {
      const { command, buffer, duration } = e.data;
      switch (command) {
        case 'encoded':
          this.encodedBuffers.push(buffer);
          // Calculate time
          elapsedTime += duration;
          if (elapsedTime >= timeslice) {
            this.recorder.requestData();
            elapsedTime = 0;
          }
          break;
        default:
          break; // Ignore
      }
    };
  }

  stop () {
    this.worker.terminate();
  }

  getEncodedBuffers () {
    // Create header data
    let dataLength = this.encodedBuffers.reduce((acc, cur) => acc + cur.byteLength, 0);
    let header = new ArrayBuffer(44);
    let view = new DataView(header);
    // RIFF identifier 'RIFF'
    view.setUint32(0, 0x52494646, false);
    // file length minus RIFF identifier length and file description length
    view.setUint32(4, 36 + dataLength, true);
    // RIFF type 'WAVE'
    view.setUint32(8, 0x57415645, false);
    // format chunk identifier 'fmt '
    view.setUint32(12, 0x666d7420, false);
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
    view.setUint32(36, 0x64617461, false);
    // data chunk length
    view.setUint32(40, dataLength, true);

    // Concat two data: [...header, ...encoded]
    let buffers = [header, ...this.encodedBuffers];
    this.encodedBuffers = [];
    return buffers;
  }
}

export default WaveEncoder;
