'use strict';

import {EventTarget, defineEventAttribute} from 'event-target-shim';

// var AudioContext = global.AudioContext || global.webkitAudioContext;

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
    this._stream = stream;
    this._mimeType = 'audio/wav';
    this._state = 'inactive';
    this._videoBitsPerSecond = undefined;
    this._audioBitsPerSecond = undefined;
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
    return undefined;
  }

  /**
   * Stops recording, at which point a dataavailable event containing
   * the final Blob of saved data is fired. No more recording occurs.
   */
  stop () {
    return undefined;
  }

  /**
   * Pauses the recording of media.
   */
  pause () {
    return undefined;
  }

  /**
   * Resumes recording of media after having been paused.
   */
  resume () {
    return undefined;
  }

  /**
   * Requests a Blob containing the saved data received thus far (or since
   * the last time requestData() was called. After calling this method,
   * recording continues, but in a new Blob.
   */
  requestData () {
    return undefined;
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
  'onstart', // Called to handle the {@link MediaRecorder#start} event.
  'onstop', // Called to handle the stop event.
  'ondataavailable', /* Called to handle the dataavailable event. The Blob of
                        recorded data is contained in this event and can be
                        accessed via its data attribute. */
  'onpause', // Called to handle the pause event.
  'onresume', // Called to handle the resume event.
  'onerror' // Called to handle a MediaRecorderErrorEvent.
].forEach(name => defineEventAttribute(MediaRecorder.prototype, name));

export default MediaRecorder;
