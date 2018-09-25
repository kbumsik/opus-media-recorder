'use strict';
import {EventTarget, defineEventAttribute} from 'event-target-shim';
import WaveEncoder from './WaveEncoder.js';

let AudioContext = global.AudioContext || global.webkitAudioContext;
let BUFFER_SIZE = 4096;

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
    this._audioBitsPerSecond = undefined;
    if (!MediaRecorder.isTypeSupported(this._mimeType)) {
      // TODO: Throw what?
      return;
    }

    this.context = new AudioContext();

    // Get channel count and sampling rate
    // channelCount: https://www.w3.org/TR/mediacapture-streams/#media-track-settings
    // sampleRate: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/sampleRate
    let tracks = this.stream.getAudioTracks();
    this.channelCount = tracks[0].getSettings().channelCount;
    this.sampleRate = this.context.sampleRate;

    /** @type {MediaStreamAudioSourceNode} */
    this.source = this.context.createMediaStreamSource(this.stream);
    /** @type {ScriptProcessorNode} */
    this.processor = this.context.createScriptProcessor(BUFFER_SIZE, this.channelCount, this.channelCount);

    switch (this._mimeType.replace(/\s/g, '')) {
      case 'audio/wave':
        this.encoder = new WaveEncoder(this, this.processor, this.sampleRate, this.channelCount);
        break;
      default:
        // Should be considered error
        break;
    }
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
    // Video encoding is not supported
    return undefined;
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
      // Throw DOM_INVALID_STATE_ERR
      return;
    }
    if (timeslice < 0) {
      // Throw ERR_INVALID_ARG
      return;
    }
    timeslice /= 1000; // Convert milliseconds to seconds

    // Start streaming data
    this.encoder.start(timeslice);
    this._state = 'recording';
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  /**
   * Stops recording, at which point a dataavailable event containing
   * the final Blob of saved data is fired. No more recording occurs.
   */
  stop () {
    if (this.state === 'inactive') {
      // Throw DOM_INVALID_STATE_ERR
      return;
    }

    // Stop stream first
    this.source.disconnect();
    this.processor.disconnect();

    this.requestData();
    this.encoder.stop();

    let event = new global.Event('stop');
    this.dispatchEvent(event);

    this._state = 'inactive';
  }

  /**
   * Pauses the recording of media.
   */
  pause () {
    if (this.state !== 'recording') {
      // Throw DOM_INVALID_STATE_ERR
      return;
    }

    // Stop stream first
    this.source.disconnect();
    this.processor.disconnect();

    let event = new global.Event('pause');
    this.dispatchEvent(event);
    this._state = 'paused';
  }

  /**
   * Resumes recording of media after having been paused.
   */
  resume () {
    if (this.state !== 'paused') {
      // Throw DOM_INVALID_STATE_ERR
      return;
    }

    // Start streaming data
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);

    let event = new global.Event('resume');
    this.dispatchEvent(event);
    this._state = 'recording';
  }

  /**
   * Requests a Blob containing the saved data received thus far (or since
   * the last time requestData() was called. After calling this method,
   * recording continues, but in a new Blob.
   */
  requestData () {
    if (this.state === 'inactive') {
      // Throw DOM_INVALID_STATE_ERR
      return;
    }

    let buffers = this.encoder.getEncodedBuffers();
    let data = new Blob(buffers, {'type': this._mimeType});
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
