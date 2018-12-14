#ifndef EMSCRIPTEN_JS_WRITER_H_
#define EMSCRIPTEN_JS_WRITER_H_

#include <emscripten.h>
#include <cstdint>

EM_JS(void, queueBuffer, (const void* buf, int len), {
  let array = new Uint8Array(Module.HEAPU8.buffer, buf, len);
  webmOpusWorker.encodedBuffers.push(array.buffer);
});

#endif /* EMSCRIPTEN_JS_WRITER_H_ */
