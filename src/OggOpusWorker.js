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

class _OggOpusEncoder {
  constructor (sampleRate, channelCount, moduleRef) {
    this.config = Object.assign({
      bufferLength: 4096, // Define size of incoming buffer
      encoderApplication: 2049, /** 2048 = Voice (Lower fidelity)
                                 *  2049 = Full Band Audio (Highest fidelity)
                                 *  2051 = Restricted Low Delay (Lowest latency) */
      encoderFrameSize: 20, // Specified in ms.
      encoderSampleRate: 48000, // Desired encoding sample rate. Audio will be resampled
      maxBuffersPerPage: 10, // Tradeoff latency with overhead
      numberOfChannels: 1,
      originalSampleRate: 44100,
      resampleQuality: 6, // Value between 0 and 10 inclusive. 10 being highest quality.
      serial: Math.floor(Math.random() * 4294967296)
    }, {
      numberOfChannels: channelCount,
      originalSampleRate: sampleRate
    });
    this.encodedBuffers = [];

    this._opus_encoder_create = moduleRef._opus_encoder_create;
    this._opus_encoder_ctl = moduleRef._opus_encoder_ctl;
    this._speex_resampler_process_interleaved_float = moduleRef._speex_resampler_process_interleaved_float;
    this._speex_resampler_init = moduleRef._speex_resampler_init;
    this._opus_encode_float = moduleRef._opus_encode_float;
    this._free = moduleRef._free;
    this._malloc = moduleRef._malloc;
    this._HEAPU8 = moduleRef.HEAPU8;
    this._HEAP32 = moduleRef.HEAP32;
    this._HEAPF32 = moduleRef.HEAPF32;

    this.pageIndex = 0;
    this.granulePosition = 0;
    this.segmentData = new Uint8Array(65025); // Maximum length of oggOpus data
    this.segmentDataIndex = 0;
    this.segmentTable = new Uint8Array(255); // Maximum data segments
    this.segmentTableIndex = 0;
    this.buffersInPage = 0;

    this.OggInitChecksumTable();
    this.OpusInitCodec();
    this.SpeexInitResampler();
    this.OggGenerateIdPage();
    this.OggGenerateCommentPage();

    if (this.config.numberOfChannels === 1) {
      // TODO: Overriding Interleave()???
      this.interleave = function (buffers) { return buffers[0]; };
    } else {
      this.interleavedBuffers = new Float32Array(this.config.bufferLength * this.config.numberOfChannels);
    }
  }

  encode (buffers, length, duration) {
    // TODO: what interleave does?
    let samples = this.interleave(buffers);
    let sampleIndex = 0;

    while (sampleIndex < samples.length) {
      var lengthToCopy = Math.min(this.resampleBufferLength - this.resampleBufferIndex, samples.length - sampleIndex);
      this.resampleBuffer.set(samples.subarray(sampleIndex, sampleIndex + lengthToCopy), this.resampleBufferIndex);
      sampleIndex += lengthToCopy;
      this.resampleBufferIndex += lengthToCopy;

      if (this.resampleBufferIndex === this.resampleBufferLength) {
        this._speex_resampler_process_interleaved_float(this.resampler, this.resampleBufferPointer, this.resampleSamplesPerChannelPointer, this.encoderBufferPointer, this.encoderSamplesPerChannelPointer);
        var packetLength = this._opus_encode_float(this.encoder, this.encoderBufferPointer, this.encoderSamplesPerChannel, this.encoderOutputPointer, this.encoderOutputMaxLength);
        this.segmentPacket(packetLength);
        this.resampleBufferIndex = 0;
      }
    }

    this.buffersInPage++;
    if (this.buffersInPage >= this.config.maxBuffersPerPage) {
      this.OggGeneratePage();
    }
  }

  encodeFinalFrame () {
    let finalFrameBuffers = [];
    for (let i = 0; i < this.config.numberOfChannels; ++i) {
      finalFrameBuffers.push(new Float32Array(this.config.bufferLength - (this.resampleBufferIndex / this.config.numberOfChannels)));
    }
    this.encode(finalFrameBuffers);
    this.headerType += 4;
    this.OggGeneratePage();
  }

  interleave (buffers) {
    for (let i = 0; i < this.config.bufferLength; i++) {
      for (let channel = 0; channel < this.config.numberOfChannels; channel++) {
        this.interleavedBuffers[ i * this.config.numberOfChannels + channel ] = buffers[ channel ][ i ];
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

    this.granulePosition += (48 * this.config.encoderFrameSize);
    if (this.segmentTableIndex === 255) {
      this.OggGeneratePage();
      this.headerType = 0;
    }
  }

  OpusInitCodec () {
    const {encoderSampleRate, numberOfChannels, encoderApplication,
      encoderBitRate, encoderComplexity, encoderFrameSize} = this.config;

    var errLocation = this._malloc(4);
    this.encoder = this._opus_encoder_create(encoderSampleRate, numberOfChannels, encoderApplication, errLocation);
    this._free(errLocation);

    if (encoderBitRate) {
      this.OpusSetOpusControl(4002, encoderBitRate);
    }

    if (encoderComplexity) {
      this.OpusSetOpusControl(4010, encoderComplexity);
    }

    let encoderSamplesPerChannel = encoderSampleRate * encoderFrameSize / 1000;
    let encoderSamplesPerChannelPointer = this._malloc(4);
    this._HEAP32[ encoderSamplesPerChannelPointer >> 2 ] = encoderSamplesPerChannel;

    let encoderBufferLength = encoderSamplesPerChannel * numberOfChannels;
    let encoderBufferPointer = this._malloc(encoderBufferLength * 4); // 4 bytes per sample
    let encoderBuffer = this._HEAPF32.subarray(encoderBufferPointer >> 2, (encoderBufferPointer >> 2) + encoderBufferLength);

    let encoderOutputMaxLength = 4000;
    let encoderOutputPointer = this._malloc(encoderOutputMaxLength);
    let encoderOutputBuffer = this._HEAPU8.subarray(encoderOutputPointer, encoderOutputPointer + encoderOutputMaxLength);

    this.encoderSamplesPerChannel = encoderSamplesPerChannel;
    this.encoderSamplesPerChannelPointer = encoderSamplesPerChannelPointer;
    this.encoderBufferLength = encoderBufferLength;
    this.encoderBufferPointer = encoderBufferPointer;
    this.encoderBuffer = encoderBuffer;
    this.encoderOutputMaxLength = encoderOutputMaxLength;
    this.encoderOutputPointer = encoderOutputPointer;
    this.encoderOutputBuffer = encoderOutputBuffer;
  }

  OpusSetOpusControl (control, value) {
    let location = this._malloc(4);
    this._HEAP32[ location >> 2 ] = value;
    this._opus_encoder_ctl(this.encoder, control, location);
    this._free(location);
  }

  SpeexInitResampler () {
    const {numberOfChannels, originalSampleRate, encoderSampleRate,
      resampleQuality, encoderFrameSize} = this.config;
    let errLocation = this._malloc(4);

    this.resampler = this._speex_resampler_init(numberOfChannels, originalSampleRate, encoderSampleRate, resampleQuality, errLocation);
    this._free(errLocation);

    let resampleBufferIndex = 0;
    let resampleSamplesPerChannel = originalSampleRate * encoderFrameSize / 1000;
    let resampleSamplesPerChannelPointer = this._malloc(4);
    this._HEAP32[ resampleSamplesPerChannelPointer >> 2 ] = resampleSamplesPerChannel;

    let resampleBufferLength = resampleSamplesPerChannel * numberOfChannels;
    let resampleBufferPointer = this._malloc(resampleBufferLength * 4); // 4 bytes per sample
    let resampleBuffer = this._HEAPF32.subarray(resampleBufferPointer >> 2, (resampleBufferPointer >> 2) + resampleBufferLength);

    this.resampleBufferIndex = resampleBufferIndex;
    this.resampleSamplesPerChannel = resampleSamplesPerChannel;
    this.resampleSamplesPerChannelPointer = resampleSamplesPerChannelPointer;
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

  OggGenerateIdPage () {
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
    const {numberOfChannels, originalSampleRateOverride,
      originalSampleRate} = this.config;

    let view = new DataView(this.segmentData.buffer);
    writeString(view, 0, 'OpusHead'); // Magic Signature 'OpusHead'
    view.setUint8(8, 1, true); // Version
    view.setUint8(9, numberOfChannels, true); // Channel count
    view.setUint16(10, 3840, true); // pre-skip (80ms)
    view.setUint32(12, originalSampleRateOverride || originalSampleRate, true); // original sample rate
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
    this.segmentDataIndex = this.segmentTable[0] = 26;
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

    view.setUint32(14, this.config.serial, true); // Bitstream serial number
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
/**
 * Emscripten (wasm) Module. Module is globally defined after compiling with emcc.
 * String indexing is used to prevent transpilers (e.g. babel) from changing name.
 */
self['Module'] = {};
self['Module'].onRuntimeInitialized = function () {
  // Emscripten (wasm) module is loaded
  // and notify the host ready to accept 'init' message.
  self.postMessage({ command: 'readyToInit' });

  self.onmessage = function (e) {
    const { command } = e.data;
    switch (command) {
      case 'init':
        const { sampleRate, channelCount } = e.data;
        oggEncoder = new _OggOpusEncoder(sampleRate, channelCount, self['Module']);
        break;

      case 'pushInputData':
        const { channelBuffers, length, duration } = e.data;
        // On Chrome, Float32Array doesn't recognize its buffer after transferred.
        // So re-create Float32Array right after a web worker received it.
        for (let i = 0; i < oggEncoder.config.numberOfChannels; i++) {
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
