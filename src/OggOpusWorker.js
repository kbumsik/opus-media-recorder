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

const OPUS_APPLICATION = 2049; /** Defined in opus_defines.h
                                *  2048: OPUS_APPLICATION_VOIP = Voice (Lower fidelity)
                                *  2049: OPUS_APPLICATION_AUDIO = Full Band Audio (Highest fidelity)
                                *  2051: OPUS_APPLICATION_RESTRICTED_LOWDELAY = Restricted Low Delay (Lowest latency) */
const OPUS_OUTPUT_SAMPLE_RATE = 48000; // Desired encoding sample rate. Audio will be resampled
const OPUS_FRAME_SIZE = 20; // Specified in ms.
const OPUS_SET_BITRATE_REQUEST = 4002; // Defined in opus_defines.h

const SPEEX_RESAMPLE_QUALITY = 6; // Value between 0 and 10 inclusive. 10 being highest quality.

const OGG_MAX_BUFFERS_PER_PAGE = 10; // Tradeoff latency with overhead
const OGG_SERIAL = Math.floor(Math.random() * 0xFFFFFFFF); // Bitstream serial number, any random 32-bit number

const BUFFER_LENGTH = 4096;

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

class _OggOpusEncoder {
  constructor (inputSampleRate, channelCount) {
    this.config = {
      inputSampleRate, // Usually 44100Hz or 48000Hz
      channelCount
    };
    this.encodedBuffers = [];

    this._opus_encoder_create = WASM._opus_encoder_create;
    this._opus_encoder_ctl = WASM._opus_encoder_ctl;
    this._speex_resampler_process_interleaved_float = WASM._speex_resampler_process_interleaved_float;
    this._speex_resampler_init = WASM._speex_resampler_init;
    this._opus_encode_float = WASM._opus_encode_float;
    this._free = WASM._free;
    this._malloc = WASM._malloc;
    this._HEAPU8 = WASM.HEAPU8;
    this._HEAPF32 = WASM.HEAPF32;

    this.pageIndex = 0;
    this.granulePosition = 0;
    this.segmentData = new Uint8Array(65025); // Maximum length of oggOpus data
    this.segmentDataIndex = 0;
    this.segmentTable = new Uint8Array(255); // Maximum data segments
    this.segmentTableIndex = 0;
    this.buffersInPage = 0;

    this.OggInitChecksumTable();
    this.OpusInitCodec(OPUS_OUTPUT_SAMPLE_RATE, channelCount, undefined);
    this.SpeexInitResampler(inputSampleRate, OPUS_OUTPUT_SAMPLE_RATE, channelCount);
    this.OggGenerateIdPage(inputSampleRate, channelCount);
    this.OggGenerateCommentPage();

    // TODO: Figure out how to delete this thing.
    this.interleavedBuffers = (channelCount !== 1) ? new Float32Array(BUFFER_LENGTH * channelCount) : undefined;
  }

  encode (buffers, length, duration) {
    let samples = this.interleave(buffers);
    let sampleIndex = 0;

    while (sampleIndex < samples.length) {
      var lengthToCopy = Math.min(this.resampleBufferLength - this.resampleBufferIndex, samples.length - sampleIndex);
      this.resampleBuffer.set(samples.subarray(sampleIndex, sampleIndex + lengthToCopy), this.resampleBufferIndex);
      sampleIndex += lengthToCopy;
      this.resampleBufferIndex += lengthToCopy;

      if (this.resampleBufferIndex === this.resampleBufferLength) {
        this._speex_resampler_process_interleaved_float(this.resampler, this.resampleBufferPointer, this.mInputSamplesPerChannel.pointer, this.encoderBufferPointer, this.mOutputSamplePerChannel.pointer);
        var packetLength = this._opus_encode_float(this.encoder, this.encoderBufferPointer, this.mOutputSamplePerChannel.value, this.encoderOutputPointer, this.encoderOutputMaxLength);
        this.segmentPacket(packetLength);
        this.resampleBufferIndex = 0;
      }
    }

    this.buffersInPage++;
    if (this.buffersInPage >= OGG_MAX_BUFFERS_PER_PAGE) {
      this.OggGeneratePage();
    }
  }

  encodeFinalFrame () {
    const {channelCount} = this.config;

    let finalFrameBuffers = [];
    for (let i = 0; i < channelCount; ++i) {
      finalFrameBuffers.push(new Float32Array(BUFFER_LENGTH - (this.resampleBufferIndex / channelCount)));
    }
    this.encode(finalFrameBuffers);
    this.headerType += 4;
    this.OggGeneratePage();
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

  segmentPacket (packetLength) {
    var packetIndex = 0;

    while (packetLength >= 0) {
      if (this.segmentTableIndex === 255) {
        this.OggGeneratePage();
        this.headerType = 1;
      }

      var segmentLength = Math.min(packetLength, 255);
      this.segmentTable[ this.segmentTableIndex++ ] = segmentLength;
      this.segmentData.set(this.encoderOutputBuffer.subarray(packetIndex, packetIndex + segmentLength), this.segmentDataIndex);
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

  OpusInitCodec (outRate, chCount, bitRate = undefined) {
    let mErr = new WasmUint32(undefined);
    this.encoder = this._opus_encoder_create(outRate, chCount, OPUS_APPLICATION, mErr.pointer);
    mErr.free();

    if (bitRate) {
      this.OpusSetOpusControl(OPUS_SET_BITRATE_REQUEST, bitRate);
    }

    let mOutputSamplePerChannel = new WasmUint32(outRate * OPUS_FRAME_SIZE / 1000);

    let encoderBufferLength = mOutputSamplePerChannel.value * chCount;
    let encoderBufferPointer = this._malloc(encoderBufferLength * 4); // 4 bytes per sample
    let encoderBuffer = this._HEAPF32.subarray(encoderBufferPointer >> 2, (encoderBufferPointer >> 2) + encoderBufferLength);

    let encoderOutputMaxLength = 4000;
    let encoderOutputPointer = this._malloc(encoderOutputMaxLength);
    let encoderOutputBuffer = this._HEAPU8.subarray(encoderOutputPointer, encoderOutputPointer + encoderOutputMaxLength);

    this.mOutputSamplePerChannel = mOutputSamplePerChannel;

    this.encoderBufferLength = encoderBufferLength;
    this.encoderBufferPointer = encoderBufferPointer;
    this.encoderBuffer = encoderBuffer;
    this.encoderOutputMaxLength = encoderOutputMaxLength;
    this.encoderOutputPointer = encoderOutputPointer;
    this.encoderOutputBuffer = encoderOutputBuffer;
  }

  OpusSetOpusControl (request, vaArg) {
    let value = new WasmInt32(vaArg);
    this._opus_encoder_ctl(this.encoder, request, value.pointer);
    value.free();
  }

  SpeexInitResampler (inputRate, outputRate, chCount) {
    let mErr = new WasmUint32(undefined);
    this.resampler = this._speex_resampler_init(chCount, inputRate, outputRate, SPEEX_RESAMPLE_QUALITY, mErr.pointer);
    mErr.free();

    let resampleBufferIndex = 0;
    let mInputSamplesPerChannel = new WasmUint32(inputRate * OPUS_FRAME_SIZE / 1000);

    let resampleBufferLength = mInputSamplesPerChannel.value * chCount;
    let resampleBufferPointer = this._malloc(resampleBufferLength * 4); // 4 bytes per sample
    let resampleBuffer = this._HEAPF32.subarray(resampleBufferPointer >> 2, (resampleBufferPointer >> 2) + resampleBufferLength);

    this.resampleBufferIndex = resampleBufferIndex;
    this.mInputSamplesPerChannel = mInputSamplesPerChannel;
    this.resampleBufferLength = resampleBufferLength;
    this.resampleBufferPointer = resampleBufferPointer;
    this.resampleBuffer = resampleBuffer;
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
    writeString(view, 0, 'OpusHead'); // Magic Signature 'OpusHead'
    view.setUint8(8, 1, true); // Version
    view.setUint8(9, chCount, true); // Channel count
    view.setUint16(10, 3840, true); // pre-skip (80ms)
    view.setUint32(12, inputRate, true); // original sample rate
    view.setUint16(16, 0, true); // output gain
    view.setUint8(18, 0, true); // Channel Mapping Family 0: mono or stereo (left, right).
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
    // Magic
    writeString(view, 0, 'OpusTags'); // Magic Signature 'OpusTags'
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
        const { sampleRate, channelCount } = e.data;
        oggEncoder = new _OggOpusEncoder(sampleRate, channelCount);
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
          self.close();
        }
        break;

      default:
        // Ignore
        break;
    }
  };
};
