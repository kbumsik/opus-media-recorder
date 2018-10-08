/**
 * Reference:
 *    Ogg: https://en.wikipedia.org/wiki/Ogg_page
 *    OggOpus: https://tools.ietf.org/html/rfc3533
 *             https://tools.ietf.org/html/rfc7845
 *
 * OggOpus Packet organization:
 *      Page 0         Pages 1 ... n        Pages (n+1) ...
 *   +------------+ +---+ +---+ ... +---+ +-----------+ +---------+ +--
 *   |            | |   | |   |     |   | |           | |         | |
 *   |+----------+| |+-----------------+| |+-------------------+ +-----
 *   |||ID Header|| ||  Comment Header || ||Audio Data Packet 1| | ...
 *   |+----------+| |+-----------------+| |+-------------------+ +-----
 *   |            | |   | |   |     |   | |           | |         | |
 *   +------------+ +---+ +---+ ... +---+ +-----------+ +---------+ +--
 *   ^      ^                           ^
 *   |      |                           |
 *   |      |                           Mandatory Page Break
 *   |      |
 *   |      ID header is contained on a single page
 *   |
 *   'Beginning Of Stream'
 */

'use strict';

import { writeString } from './commonFunctions.js';

/**
 * Configuration
 */
const OPUS_APPLICATION = 2049; /** Defined in opus_defines.h
                                *  2048: OPUS_APPLICATION_VOIP = Voice (Lower fidelity)
                                *  2049: OPUS_APPLICATION_AUDIO = Full Band Audio (Highest fidelity)
                                *  2051: OPUS_APPLICATION_RESTRICTED_LOWDELAY = Restricted Low Delay (Lowest latency) */
const OPUS_OUTPUT_SAMPLE_RATE = 48000; // Desired encoding sample rate. Audio will be resampled
const OPUS_OUTPUT_MAX_LENGTH = 4000;
const OPUS_FRAME_SIZE = 20; // Specified in ms.

const SPEEX_RESAMPLE_QUALITY = 6; // Value between 0 and 10 inclusive. 10 being highest quality.

const OGG_MAX_BUFFERS_PER_PAGE = 10; // Tradeoff latency with overhead
const OGG_SERIAL = Math.floor(Math.random() * 0xFFFFFFFF); // Bitstream serial number, any random 32-bit number

const BUFFER_LENGTH = 4096;

/**
 * Constants used for libraries
 */;
// in opus_defines.h
const OPUS_OK = 0;
const OPUS_SET_BITRATE_REQUEST = 4002;
// in speex_resampler.h
const RESAMPLER_ERR_SUCCESS = 0;

/**
 * Emscripten (wasm) Module. Module is globally defined after compiling with emcc.
 * String indexing is used to prevent transpilers (e.g. babel) from changing name.
 */
self['Module'] = {};
const WASM = self['Module'];

/**
 * C malloc allocated signed int32 object
 */
class WasmInt32 {
  /**
   * Allocate and assign number
   * @param {number|undefined} value - If undefined the value is not assigned to the memory.
   */
  constructor (value) {
    this._pointer = WASM._malloc(4);
    if (typeof value !== 'undefined') {
      WASM.HEAP32[this._pointer >> 2] = value;
    }
  }
  /**
   * Free memory
   */
  free () {
    WASM._free(this.pointer);
  }

  get pointer () {
    return this._pointer;
  }

  get value () {
    return WASM.HEAP32[this.pointer >> 2];
  }
}

/**
 * C malloc allocated unsigned int32 object
 */
class WasmUint32 {
  /**
   * Allocate and assign number
   * @param {number|undefined} value - If undefined the value is not assigned to the memory.
   */
  constructor (value) {
    this._pointer = WASM._malloc(4);
    if (typeof value !== 'undefined') {
      WASM.HEAPU32[this._pointer >> 2] = value;
    }
  }

  free () {
    WASM._free(this.pointer);
  }

  get pointer () {
    return this._pointer;
  }

  get value () {
    return WASM.HEAPU32[this.pointer >> 2];
  }
}

/**
 * C malloc allocated float buffer object
 */
class WasmFloat32Buffer {
  /**
   * Allocate and assign number
   * @param {number|undefined} value - If undefined the value is not assigned to the memory.
   */
  constructor (length) {
    this._pointer = WASM._malloc(length * 4);
    let offset = this._pointer >> 2;
    this._buffer = WASM.HEAPF32.subarray(offset, offset + length);
    this._length = length;
  }

  free () {
    WASM._free(this.pointer);
  }

  set (array, offset) {
    this._buffer.set(array, offset);
  }

  subarray (begin, end) {
    return this._buffer.subarray(begin, end);
  }

  get pointer () {
    return this._pointer;
  }

  get length () {
    return this._length;
  }
}

/**
 * C malloc allocated unsigned uint8 buffer object
 */
class WasmUint8Buffer {
  /**
   * Allocate and assign number
   * @param {number|undefined} value - If undefined the value is not assigned to the memory.
   */
  constructor (length) {
    this._pointer = WASM._malloc(length);
    this._buffer = WASM.HEAPU8.subarray(this._pointer, this._pointer + length);
    this._length = length;
  }

  free () {
    WASM._free(this.pointer);
  }

  set (array, offset) {
    this._buffer.set(array, offset);
  }

  subarray (begin, end) {
    return this._buffer.subarray(begin, end);
  }

  get pointer () {
    return this._pointer;
  }

  get length () {
    return this._length;
  }
}

class _OggOpusEncoder {
  constructor (inputSampleRate, channelCount, bitsPerSecond = undefined) {
    this.config = {
      inputSampleRate, // Usually 44100Hz or 48000Hz
      channelCount
    };
    this.encodedBuffers = [];

    // libopus functions imported from WASM
    this._opus_encoder_create = WASM._opus_encoder_create;
    this._opus_encoder_ctl = WASM._opus_encoder_ctl;
    this._opus_encode_float = WASM._opus_encode_float;
    this._opus_encoder_destroy = WASM._opus_encoder_destroy;
    // SpeexDSP functions
    this._speex_resampler_init = WASM._speex_resampler_init;
    this._speex_resampler_process_interleaved_float = WASM._speex_resampler_process_interleaved_float;
    this._speex_resampler_destroy = WASM._speex_resampler_destroy;

    // Attributes for OGG packing
    this.pageIndex = 0;
    this.granulePosition = 0;
    this.segmentData = new Uint8Array(255 * 255); // Maximum length of Opus data in a page
    this.segmentDataIndex = 0;
    this.segmentTable = new Uint8Array(255); // Maximum data segments
    this.segmentTableIndex = 0;
    this.buffersInPage = 0;

    this.OggInitChecksumTable();
    this.OpusInitCodec(OPUS_OUTPUT_SAMPLE_RATE, channelCount, bitsPerSecond);
    this.SpeexInitResampler(inputSampleRate, OPUS_OUTPUT_SAMPLE_RATE, channelCount);
    this.OggGenerateIdPage(inputSampleRate, channelCount);
    this.OggGenerateCommentPage();

    this.inputSamplesPerChannel = inputSampleRate * OPUS_FRAME_SIZE / 1000;
    this.outputSamplePerChannel = OPUS_OUTPUT_SAMPLE_RATE * OPUS_FRAME_SIZE / 1000;

    // Initialize all buffers
    //  |input buffer| =={reampler}=> |resampled buffer| =={encoder}=> |output buffer|
    this.inputBufferIndex = 0;
    this.mInputBuffer = new WasmFloat32Buffer(this.inputSamplesPerChannel * channelCount);
    this.mResampledBuffer = new WasmFloat32Buffer(this.outputSamplePerChannel * channelCount);
    this.mOutputBuffer = new WasmUint8Buffer(OPUS_OUTPUT_MAX_LENGTH);

    // TODO: Figure out how to delete this thing.
    this.interleavedBuffers = (channelCount !== 1) ? new Float32Array(BUFFER_LENGTH * channelCount) : undefined;
  }

  encode (buffers, length, duration) {
    let samples = this.interleave(buffers);
    let sampleIndex = 0;

    while (sampleIndex < samples.length) {
      // Copy samples to input buffer
      let lengthToCopy = Math.min(this.mInputBuffer.length - this.inputBufferIndex, samples.length - sampleIndex);
      this.mInputBuffer.set(samples.subarray(sampleIndex, sampleIndex + lengthToCopy), this.inputBufferIndex);
      this.inputBufferIndex += lengthToCopy;

      // When mInputBuffer is fill, then encode.
      if (this.inputBufferIndex >= this.mInputBuffer.length) {
        // Resampling
        let mInputLength = new WasmUint32(this.inputSamplesPerChannel);
        let mOutputLength = new WasmUint32(this.outputSamplePerChannel);
        let err = this._speex_resampler_process_interleaved_float(this.resampler, this.mInputBuffer.pointer, mInputLength.pointer, this.mResampledBuffer.pointer, mOutputLength.pointer);
        mInputLength.free();
        mOutputLength.free();
        if (err !== RESAMPLER_ERR_SUCCESS) {
          throw new Error('Resampling error.');
        }
        // Encoding
        let packetLength = this._opus_encode_float(this.encoder, this.mResampledBuffer.pointer, this.outputSamplePerChannel, this.mOutputBuffer.pointer, this.mOutputBuffer.length);
        if (packetLength < 0) {
          throw new Error('Opus encoding error.');
        }
        this.OggSegmentPacket(packetLength);
        this.inputBufferIndex = 0;
      }
      sampleIndex += lengthToCopy;
    }

    this.buffersInPage++;
    if (this.buffersInPage >= OGG_MAX_BUFFERS_PER_PAGE) {
      this.OggGeneratePage();
    }
  }

  encodeFinalFrame () {
    const {channelCount} = this.config;

    // Fill zero to buffers, size is the same as re rest of inputBuffer.
    let finalFrameBuffers = [];
    for (let i = 0; i < channelCount; ++i) {
      finalFrameBuffers.push(new Float32Array(BUFFER_LENGTH - (this.inputBufferIndex / channelCount)));
    }
    this.encode(finalFrameBuffers);
    this.headerType += 4;
    this.OggGeneratePage();
  }

  /**
   * Free up memory before close the web worker.
   */
  close () {
    this.mInputBuffer.free();
    this.mResampledBuffer.free();
    this.mOutputBuffer.free();
    this._opus_encoder_destroy(this.encoder);
    this._speex_resampler_destroy(this.resampler);
  }

  /**
   * Interleave the channel buffer.
   * @param {Float32Array[]} channelBuffers - An array of buffers to interleave.
   */
  interleave (channelBuffers) {
    const chCount = channelBuffers.length;

    // if it only has one channel, no interleave needed.
    if (chCount === 1) {
      return channelBuffers[0];
    }
    // Format: | ch0 | ch1 | ch0 | ch1 | ch0 | ch1 | ch0 | ch1 | ...
    for (let ch = 0; ch < chCount; ch++) {
      let buffer = channelBuffers[ch];
      for (let i = 0; i < buffer.length; i++) {
        this.interleavedBuffers[i * chCount + ch] = buffer[i];
      }
    }
    return this.interleavedBuffers;
  }

  OpusInitCodec (outRate, chCount, bitRate = undefined) {
    let mErr = new WasmUint32(undefined);
    this.encoder = this._opus_encoder_create(outRate, chCount, OPUS_APPLICATION, mErr.pointer);
    let err = mErr.value;
    mErr.free();
    if (err !== OPUS_OK) {
      throw new Error('Opus encodor initialization failed.');
    }
    /** Configures the bitrate in the encoder.
     * Rates from 500 to 512000 bits per second are meaningful, as well as the
     * special values #OPUS_AUTO (-1000) and #OPUS_BITRATE_MAX (-1).
     * The value #OPUS_BITRATE_MAX can be used to cause the codec to use as much
     * rate as it can, which is useful for controlling the rate by adjusting the
     * output buffer size. The default is determined based on the number of
     * channels and the input sampling rate.
     */
    if (bitRate) {
      this.OpusSetOpusControl(OPUS_SET_BITRATE_REQUEST, bitRate);
    }
  }

  OpusSetOpusControl (request, vaArg) {
    let value = new WasmInt32(vaArg);
    this._opus_encoder_ctl(this.encoder, request, value.pointer);
    value.free();
  }

  SpeexInitResampler (inputRate, outputRate, chCount) {
    let mErr = new WasmUint32(undefined);
    this.resampler = this._speex_resampler_init(chCount, inputRate, outputRate, SPEEX_RESAMPLE_QUALITY, mErr.pointer);
    let err = mErr.value;
    mErr.free();
    if (err !== RESAMPLER_ERR_SUCCESS) {
      throw new Error('Initializing resampler failed.');
    }
  }

  OggInitChecksumTable () {
    this.checksumTable = [];
    for (var i = 0; i < 256; i++) {
      var r = i << 24;
      for (var j = 0; j < 8; j++) {
        r = ((r & 0x80000000) !== 0) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
      }
      this.checksumTable[i] = (r & 0xffffffff);
    }
  }

  OggGetChecksum (data) {
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum = (checksum << 8) ^ this.checksumTable[ ((checksum >>> 24) & 0xff) ^ data[i] ];
    }
    return checksum >>> 0;
  }

  OggGenerateIdPage (inputRate, chCount) {
    /**
     * Identification header format:
     *     0                   1                   2                   3
     *     0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
     *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *    |      'O'      |      'p'      |      'u'      |      's'      |
     *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *    |      'H'      |      'e'      |      'a'      |      'd'      |
     *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *    |  Version = 1  | Channel Count |           Pre-skip            |
     *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *    |                     Input Sample Rate (Hz)                    |
     *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *    |   Output Gain (Q7.8 in dB)    | Mapping Family|               |
     *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+               :
     *    |                                                               |
     *    :               Optional Channel Mapping Table...               :
     *    |                                                               |
     *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     */
    let view = new DataView(this.segmentData.buffer);
    // Magic Signature 'OpusHead'
    writeString(view, 0, 'OpusHead');
    // The version must always be 1 (8 bits, unsigned).
    view.setUint8(8, 1, true);
    // Number of output channels (8 bits, unsigned).
    view.setUint8(9, chCount, true);
    // Number of samples (at 48 kHz) to discard from the decoder output when
    // starting playback (16 bits, unsigned, little endian).
    // Currently pre-skip is 80ms.
    view.setUint16(10, 3840, true);
    // The sampling rate of input source (32 bits, unsigned, little endian).
    view.setUint32(12, inputRate, true);
    // Output gain, an encoder should set this field to zero (16 bits, signed,
    // little endian).
    view.setUint16(16, 0, true);
    // Channel Mapping Family 0: mono or stereo (left, right). (8 bits, unsigned).
    view.setUint8(18, 0, true);
    this.segmentTableIndex = 1;
    this.segmentDataIndex = this.segmentTable[0] = 19;
    this.headerType = 2;
    this.OggGeneratePage();
  }

  OggGenerateCommentPage () {
    /**
     * Comment header format:
     *   0                   1                   2                   3
     *   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |      'O'      |      'p'      |      'u'      |      's'      |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |      'T'      |      'a'      |      'g'      |      's'      |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |                     Vendor String Length                      |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |                                                               |
     *  :                        Vendor String...                       :
     *  |                                                               |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |                   User Comment List Length                    |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |                 User Comment #0 String Length                 |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |                                                               |
     *  :                   User Comment #0 String...                   :
     *  |                                                               |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |                 User Comment #1 String Length                 |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     */
    let view = new DataView(this.segmentData.buffer);
    // Magic Signature 'OpusTags'
    writeString(view, 0, 'OpusTags');
    // Vendor String
    let vendor = 'Opus-Media-Recorder';
    view.setUint32(8, vendor.length, true); // Vendor String Length
    writeString(view, 12, vendor); // Vendor String name
    let offset = 12 + vendor.length;
    // User Comment
    view.setUint32(offset, 0, true); // User Comment List Length: No user comments, so 0
    offset += 4;

    this.segmentTableIndex = 1;
    this.segmentDataIndex = this.segmentTable[0] = offset;
    this.headerType = 0;
    this.OggGeneratePage();
  }

  OggGeneratePage () {
    /**
     * Ogg page header format:
     *   0                   1                   2                   3
     *   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1| Byte
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  | capture_pattern: Magic number for page start "OggS"           | 0-3
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  | version       | header_type   | granule_position              | 4-7
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |                                                               | 8-11
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |                               | bitstream_serial_number       | 12-15
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |                               | page_sequence_number          | 16-19
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |                               | CRC_checksum                  | 20-23
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |                               |page_segments  | segment_table | 24-27
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  | ...                                                           | 28-
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     */
    let granulePosition = (this.lastPositiveGranulePosition === this.granulePosition) ? -1 : this.granulePosition;
    let pageBuffer = new ArrayBuffer(27 + this.segmentTableIndex + this.segmentDataIndex);
    let view = new DataView(pageBuffer);
    let page = new Uint8Array(pageBuffer);

    writeString(view, 0, 'OggS');
    view.setUint8(4, 0, true); // Version: 0
    view.setUint8(5, this.headerType, true); // 1 = continuation, 2 = beginning of stream, 4 = end of stream

    // Number of samples upto and including this page at 48000Hz, into signed 64 bit Little Endian integer
    // Javascript Number maximum value is 53 bits or 2^53 - 1
    view.setUint32(6, granulePosition, true);
    if (granulePosition < 0) {
      view.setInt32(10, Math.ceil(granulePosition / 4294967297) - 1, true);
    } else {
      view.setInt32(10, Math.floor(granulePosition / 4294967296), true);
    }

    view.setUint32(14, OGG_SERIAL, true); // Bitstream serial number
    view.setUint32(18, this.pageIndex, true); // Page sequence number
    this.pageIndex += 1;
    view.setUint8(26, this.segmentTableIndex, true); // Number of segments in page.
    page.set(this.segmentTable.subarray(0, this.segmentTableIndex), 27); // Segment Table
    page.set(this.segmentData.subarray(0, this.segmentDataIndex), 27 + this.segmentTableIndex); // Segment Data
    view.setUint32(22, this.OggGetChecksum(page), true); // Checksum

    this.encodedBuffers.push(pageBuffer);

    this.segmentTableIndex = 0;
    this.segmentDataIndex = 0;
    this.buffersInPage = 0;
    if (granulePosition > 0) {
      this.lastPositiveGranulePosition = granulePosition;
    }
  }

  OggSegmentPacket (packetLength) {
    var packetIndex = 0;

    while (packetLength >= 0) {
      if (this.segmentTableIndex === 255) {
        this.OggGeneratePage();
        this.headerType = 1;
      }

      var segmentLength = Math.min(packetLength, 255);
      this.segmentTable[ this.segmentTableIndex++ ] = segmentLength;
      this.segmentData.set(this.mOutputBuffer.subarray(packetIndex, packetIndex + segmentLength), this.segmentDataIndex);
      this.segmentDataIndex += segmentLength;
      packetIndex += segmentLength;
      packetLength -= 255;
    }

    this.granulePosition += (48 * OPUS_FRAME_SIZE);
    if (this.segmentTableIndex === 255) {
      this.OggGeneratePage();
      this.headerType = 0;
    }
  }
}

var oggEncoder;
WASM.onRuntimeInitialized = function () {
  // Emscripten (wasm) module is loaded
  // and notify the host ready to accept 'init' message.
  self.postMessage({ command: 'readyToInit' });

  self.onmessage = function (e) {
    const { command } = e.data;
    switch (command) {
      case 'init':
        const { sampleRate, channelCount, bitsPerSecond } = e.data;
        oggEncoder = new _OggOpusEncoder(sampleRate, channelCount, bitsPerSecond);
        break;

      case 'pushInputData':
        const { channelBuffers, length, duration } = e.data;
        // On Chrome, Float32Array doesn't recognize its buffer after transferred.
        // So re-create Float32Array right after a web worker received it.
        for (let i = 0; i < oggEncoder.config.channelCount; i++) {
          channelBuffers[i] = new Float32Array(channelBuffers[i].buffer);
        }

        oggEncoder.encode(channelBuffers, length, duration);
        break;

      case 'getEncodedData':
      case 'done':
        if (command === 'done') {
          oggEncoder.encodeFinalFrame();
        }

        const buffers = oggEncoder.encodedBuffers;
        self.postMessage({
          command: command === 'done' ? 'lastEncodedData' : 'encodedData',
          buffers
        }, buffers);
        oggEncoder.encodedBuffers = [];

        if (command === 'done') {
          // Free memory and close
          oggEncoder.close();
          self.close();
        }
        break;

      default:
        // Ignore
        break;
    }
  };
};
