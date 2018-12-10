'use strict';

import { setWASM, WasmInt32, WasmUint32,
  WasmUint8Buffer, WasmFloat32Buffer } from './commonFunctions.js';

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
    // Ogg container imported using WebIDL binding
    this._contrainer = new WASM.OggContainer(OPUS_OUTPUT_SAMPLE_RATE, channelCount,
                                             Math.floor(Math.random() * 0xFFFFFFFF));

    this.OpusInitCodec(OPUS_OUTPUT_SAMPLE_RATE, channelCount, bitsPerSecond);
    this.SpeexInitResampler(inputSampleRate, OPUS_OUTPUT_SAMPLE_RATE, channelCount);

    this.inputSamplesPerChannel = inputSampleRate * OPUS_FRAME_SIZE / 1000;
    this.outputSamplePerChannel = OPUS_OUTPUT_SAMPLE_RATE * OPUS_FRAME_SIZE / 1000;

    // Initialize all buffers
    //  |input buffer| =={reampler}=> |resampled buffer| =={encoder}=> |output buffer|
    this.inputBufferIndex = 0;
    this.mInputBuffer = new WasmFloat32Buffer(this.inputSamplesPerChannel * channelCount);
    this.mResampledBuffer = new WasmFloat32Buffer(this.outputSamplePerChannel * channelCount);
    this.mOutputBuffer = new WasmUint8Buffer(OPUS_OUTPUT_MAX_LENGTH);

    // Create Ogg metadata
    this.OggGenerateIdPage();
    this.OggGenerateCommentPage();

    // TODO: Figure out how to delete this thing.
    this.interleavedBuffers = (channelCount !== 1)
                            ? new Float32Array(BUFFER_LENGTH * channelCount)
                            : undefined;
  }

  encode (buffers, final = false) {
    let samples = this.interleave(buffers);
    let sampleIndex = 0;

    while (sampleIndex < samples.length) {
      // Copy samples to input buffer
      let lengthToCopy = Math.min(this.mInputBuffer.length - this.inputBufferIndex,
                                  samples.length - sampleIndex);
      this.mInputBuffer.set(samples.subarray(sampleIndex, sampleIndex + lengthToCopy),
                            this.inputBufferIndex);
      this.inputBufferIndex += lengthToCopy;

      // When mInputBuffer is fill, then encode.
      if (this.inputBufferIndex >= this.mInputBuffer.length) {
        // Resampling
        let mInputLength = new WasmUint32(this.inputSamplesPerChannel);
        let mOutputLength = new WasmUint32(this.outputSamplePerChannel);
        let err = this._speex_resampler_process_interleaved_float(
          this.resampler,
          this.mInputBuffer.pointer,
          mInputLength.pointer,
          this.mResampledBuffer.pointer,
          mOutputLength.pointer);
        mInputLength.free();
        mOutputLength.free();
        if (err !== RESAMPLER_ERR_SUCCESS) {
          throw new Error('Resampling error.');
        }
        // Encoding
        let packetLength = this._opus_encode_float(this.encoder,
                                                   this.mResampledBuffer.pointer,
                                                   this.outputSamplePerChannel,
                                                   this.mOutputBuffer.pointer,
                                                   this.mOutputBuffer.length);
        if (packetLength < 0) {
          throw new Error('Opus encoding error.');
        }
        // Input packget to Ogg page generator
        this._contrainer.writeStream(this.mOutputBuffer.pointer,
                                     packetLength,
                                     this.outputSamplePerChannel, // 960 samples
                                     false);
        this.inputBufferIndex = 0;
      }
      sampleIndex += lengthToCopy;
    }
    if (final) {
      // Just to flag this is the end of the stream
      this._contrainer.writeStream(this.mOutputBuffer.pointer,
                                   0, // No bytes
                                   0, // No samples
                                   true);
    }

    // Generate Ogg pages
    let morePage = 1;
    while (morePage > 0) {
      morePage = this._contrainer.producePacketPage(false);
      this.OggPushPage();
    }
    // If this is the last call, then flush remaining packets into an Ogg page
    if (final) {
      this._contrainer.producePacketPage(true);
      this.OggPushPage();
    }
  }

  encodeFinalFrame () {
    const {channelCount} = this.config;

    // Fill zero to buffers, size is the same as re rest of inputBuffer.
    let finalFrameBuffers = [];
    for (let i = 0; i < channelCount; ++i) {
      finalFrameBuffers.push(new Float32Array(BUFFER_LENGTH - (this.inputBufferIndex / channelCount)));
    }
    this.encode(finalFrameBuffers, true);
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
    WASM.destroy(this._contrainer);
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
    this.resampler = this._speex_resampler_init(chCount, inputRate, outputRate,
                                                SPEEX_RESAMPLE_QUALITY, mErr.pointer);
    let err = mErr.value;
    mErr.free();
    if (err !== RESAMPLER_ERR_SUCCESS) {
      throw new Error('Initializing resampler failed.');
    }
  }

  OggGenerateIdPage () {
    this._contrainer.produceIDPage();
    this.OggPushPage();
  }

  OggGenerateCommentPage () {
    this._contrainer.produceCommentPage();
    this.OggPushPage();
  }

  OggPushPage () {
    if (!this._contrainer.safeToCopy()) {
      return false;
    }
    // Get header buffer
    let header = new Uint8Array(WASM.HEAPU8.buffer,
                                this._contrainer.getOggHeader(),
                                this._contrainer.getOggHeaderSize());
    // Get body buffer
    let body = new Uint8Array(WASM.HEAPU8.buffer,
                              this._contrainer.getOggBody(),
                              this._contrainer.getOggBodySize());
    // Copy buffer and push
    this.encodedBuffers.push(new Uint8Array(header).buffer);
    this.encodedBuffers.push(new Uint8Array(body).buffer);
    return true;
  }
}

let oggEncoder;
WASM.onRuntimeInitialized = function () {
  // Enable Wasm-prefixed classes/functions
  setWASM(WASM);

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
        const { channelBuffers, length, duration } = e.data; // eslint-disable-line
        // On Chrome, Float32Array doesn't recognize its buffer after transferred.
        // So re-create Float32Array right after a web worker received it.
        for (let i = 0; i < oggEncoder.config.channelCount; i++) {
          channelBuffers[i] = new Float32Array(channelBuffers[i].buffer);
        }

        oggEncoder.encode(channelBuffers);
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
