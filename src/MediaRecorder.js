'use strict';

import {EventTarget, defineEventAttribute} from 'event-target-shim';

let AudioContext = global.AudioContext || global.webkitAudioContext;
let BUFFER_SIZE = 4096;
let BYTES_PER_SAMPLE = Int16Array.BYTES_PER_ELEMENT; // This means 16-bit wav file.

/**
 * Reference: https://w3c.github.io/mediacapture-record/#mediarecorder-api
 * @extends EventTarget
 */
class MediaRecorder extends EventTarget {
  /**
   *
   * @param {MediaStream} steam - The MediaStream to be recorded. This will
   *          be the value of the stream attribute.
   * @param {MediaRecorderOptions} [options] - A dictionary of options to for
   *          the UA instructing how the recording will take part.
   *          options.mimeType, if present, will become the value of mimeType
   *          attribute.
   */
  constructor (stream, options = {}) {
    super();
    // Attributes for the specification conformance. These have their own getters.
    this._stream = stream;
    this._mimeType = 'audio/wave';
    this._state = 'inactive';
    this._videoBitsPerSecond = undefined;
    this._audioBitsPerSecond = undefined;

    this.context = new AudioContext();

    // Get channel count and sampling rate
    // channelCount: https://www.w3.org/TR/mediacapture-streams/#media-track-settings
    // sampleRate: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/sampleRate
    let tracks = this.stream.getAudioTracks();
    this.channelCount = tracks[0].getSettings().channelCount;
    this.sampleRate = this.context.sampleRate;

    // Create source and processor
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(BUFFER_SIZE, this.channelCount, this.channelCount);

    this.encodedBuffers = []; /** @type {ArrayBuffer[]} */
    this.encoderWorker = undefined; /** @type {Worker} */
  }

  /**
   * The MediaStream [GETUSERMEDIA] to be recorded.
   * @return {MediaStream}
   */
  get stream () {
    return this._stream;
  }

  /**
   * The MIME type [RFC2046] that has been selected as the container for
   * recording. This entry includes all the parameters to the base
   * mimeType. The UA should be able to play back any of the MIME types
   * it supports for recording. For example, it should be able to display
   * a video recording in the HTML <video> tag. The default value for
   * this property is platform-specific.
   * @return {string}
   */
  get mimeType () {
    return this._mimeType;
  }

  /**
   * The current state of the MediaRecorder object. When the MediaRecorder
   * is created, the UA MUST set this attribute to inactive.
   * @return {"inactive"|"recording"|"paused"}
   */
  get state () {
    return this._state;
  }

  /**
   * The value of the Video encoding target bit rate that was passed to
   * the Platform (potentially truncated, rounded, etc), or the calculated one
   * if the user has specified bitsPerSecond.
   * @return {number|undefined}
   */
  get videoBitsPerSecond () {
    return this._videoBitsPerSecond;
  }

  /**
   * The value of the Audio encoding target bit rate that was passed to
   * the Platform (potentially truncated, rounded, etc), or the calculated one
   * if the user has specified bitsPerSecond.
   * @return {number|undefined}
   */
  get audioBitsPerSecond () {
    return this._audioBitsPerSecond;
  }

  /**
   * Begins recording media; this method can optionally be passed a timeslice
   * argument with a value in milliseconds. If this is specified, the media
   * will be captured in separate chunks of that duration, rather than the
   * default behavior of recording the media in a single large chunk.
   * @param {number} timeslice - If timeslice is not undefined, then once a
   *          minimum of timeslice milliseconds of data have been collected,
   *          or some minimum time slice imposed by the UA, whichever is
   *          greater, start gathering data into a new Blob blob, and queue
   *          a task, using the DOM manipulation task source, that fires
   *          a blob event named dataavailable at target with blob.
   *
   *          Note that an undefined value of timeslice will be understood as
   *          the largest long value.
   */
  start (timeslice = Number.MAX_SAFE_INTEGER) {
    if (this.state !== 'inactive') {
      return;
    }
    this._state = 'recording';
    timeslice /= 1000; // Convert milliseconds to seconds
    this.elapsedTime = 0;

    // Create worker
    this.encoderWorker = new Worker('WaveWorker.js');

    // WAV Encoding script
    this.processor.onaudioprocess = (e) => {
      const { inputBuffer, playbackTime } = e; // eslint-disable-line
      const { sampleRate, length, duration, numberOfChannels } = inputBuffer; // eslint-disable-line

      // Create channel buffers to pass to the worker
      const channelArrays = new Array(numberOfChannels);
      for (let i = 0; i < numberOfChannels; i++) {
        channelArrays[i] = inputBuffer.getChannelData(i);
      }

      // Pass data to the worker
      const audioBufferProperty = { sampleRate, length, duration, numberOfChannels };
      const dataToPost = { command: 'encode', channelArrays, audioBufferProperty };
      this.encoderWorker.postMessage(dataToPost, channelArrays.map(a => a.buffer));
    };

    // Callback when encoding completed
    this.encoderWorker.onmessage = (e) => {
      const { command, buffer, duration } = e.data;
      switch (command) {
        case 'encoded':
          this.encodedBuffers.push(buffer);
          // Calculate time
          this.elapsedTime += duration;
          if (this.elapsedTime >= timeslice) {
            this.requestData();
            this.elapsedTime = 0;
          }
          break;
        default:
          break; // Ignore
      }
    };

    // Start streaming data
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  /**
   * Stops recording, at which point a dataavailable event containing
   * the final Blob of saved data is fired. No more recording occurs.
   */
  stop () {
    if (this.state !== 'recording') {
      return;
    }
    this._state = 'inactive';

    // Stop stream first
    this.source.disconnect();
    this.processor.disconnect();

    this.requestData();
    this.encoderWorker.terminate();

    let event = new global.Event('stop');
    this.dispatchEvent(event);
  }

  /**
   * Pauses the recording of media.
   */
  pause () {
    if (this.state !== 'recording') {
      return;
    }
    this._state = 'paused';

    // Stop stream first
    this.source.disconnect();
    this.processor.disconnect();

    let event = new global.Event('pause');
    this.dispatchEvent(event);
  }

  /**
   * Resumes recording of media after having been paused.
   */
  resume () {
    if (this.state !== 'paused') {
      return;
    }
    this._state = 'recording';

    // Start streaming data
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);

    let event = new global.Event('resume');
    this.dispatchEvent(event);
  }

  /**
   * Requests a Blob containing the saved data received thus far (or since
   * the last time requestData() was called. After calling this method,
   * recording continues, but in a new Blob.
   */
  requestData () {
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
    let data = [header, ...this.encodedBuffers];
    data = new Blob(data, {'type': this._mimeType});
    this.encodedBuffers = [];

    // Invoke the callback
    let event = new global.Event('dataavailable');
    event.data = data;
    this.dispatchEvent(event);
  }

  /**
   * Returns a Boolean value indicating if the given MIME type is supported
   * by the current user agent .
   * @param {string} type - A MIME Type, including parameters when needed,
   *          specifying a container and/or codec formats for recording.
   * @return {boolean}
   */
  static isTypeSupported (type) {
    if (type === '') {
      return true;
    }
    return true;
  }
}

// EventHandler attributes.
// This code is a non-standard EventTarget but required by event-target-shim.
[
  'start', // Called to handle the {@link MediaRecorder#start} event.
  'stop', // Called to handle the stop event.
  'dataavailable', /* Called to handle the dataavailable event. The Blob of
                        recorded data is contained in this event and can be
                        accessed via its data attribute. */
  'pause', // Called to handle the pause event.
  'resume', // Called to handle the resume event.
  'error' // Called to handle a MediaRecorderErrorEvent.
].forEach(name => defineEventAttribute(MediaRecorder.prototype, name));

export default MediaRecorder;
