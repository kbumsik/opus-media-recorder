'use strict';

import {EventTarget, defineEventAttribute} from 'event-target-shim';

let AudioContext = global.AudioContext || global.webkitAudioContext;
let BUFFER_SIZE = 4096;
let BYTES_PER_SAMPLE = 2; // This means 16-bit wav file.

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
    this.processor = this.context.createScriptProcessor(BUFFER_SIZE, this.channelCount, 0);

    /** @type {TypedArray[]} */
    this.encodedBuffer = [];
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
    this.previousTime = 0;
    this.elapsedTime = 0;

    // WAV Encoding script
    this.processor.onaudioprocess = (e) => {
      let { inputBuffer, playbackTime } = e;
      let { length } = inputBuffer; // also sampleRate, duration

      /** @type {Float32Array} */
      let channelData = [];
      // Channel 0 is left and Channel 1 is
      for (let i = 0; i < this.channelCount; i++) {
        channelData[i] = inputBuffer.getChannelData(i);
      }

      // Convert Float32 to Int16
      let data = new Uint8Array(length * BYTES_PER_SAMPLE * this.channelCount);
      let view = new DataView(data.buffer);
      for (let ch = 0; ch < this.channelCount; ch++) {
        for (let i = 0; i < length; i++) {
          const offset = (i * this.channelCount + ch) * BYTES_PER_SAMPLE;
          // Clamp value
          let sample = (channelData[ch][i] * 0x7FFF) | 0;
          if (sample > 0x7FFF) {
            sample = 0x7FFF | 0;
          } else if (sample < -0x8000) {
            sample = -0x8000 | 0;
          }
          // Then store
          view.setInt16(offset, sample | 0, true);
        }
      }

      // Encoding completed
      this.encodedBuffer.push(data);

      // Calculate time
      let diffTime = playbackTime - this.previousTime;
      console.log(diffTime);
      this.elapsedTime += diffTime;
      if (this.elapsedTime >= timeslice) {
        this.requestData();
        this.elapsedTime = 0;
      }
      this.previousTime = playbackTime;
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
    let dataLength = this.encodedBuffer.reduce((acc, cur) => acc + cur.length, 0);
    let header = new Uint8Array(44);
    let view = new DataView(header.buffer);
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
    let data = [header, ...this.encodedBuffer];
    data = new Blob(data, {'type': this._mimeType});
    this.encodedBuffer = [];

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

// EventHandler attributes
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
