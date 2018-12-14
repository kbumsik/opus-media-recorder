#ifndef EMSCRIPTEN_JS_WRITER_H_
#define EMSCRIPTEN_JS_WRITER_H_

#include <emscripten.h>
#include <cstdint>

EM_JS(void, queueBuffer, (const void* buf, int len), {
  // Create a Typed Array
  let array = new Uint8Array(Module.HEAPU8.buffer, buf, len);
  // Then copy and queue
  webmOpusWorker.encodedBuffers.push(new Uint8Array(array).buffer);
});

#endif /* EMSCRIPTEN_JS_WRITER_H_ */
