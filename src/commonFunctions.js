/**
 * Emscripten (wasm) Module. It has be initialized by setWASM.
 */
let WASM;

/**
 * Write a string to a DataView.
 * @param {DataView} dataView - dataView object to write a string.
 * @param {*} offset - offset in bytes
 * @param {*} string - string to write
 */
function writeString (dataView, offset, string) {
  for (let i = 0; i < string.length; i++) {
    dataView.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Set a wasm module for Wasm-prefixed classes/functions
 * @param {WebAssemblyModule} module - module to set
 */
function setWASM (module) {
  WASM = module;
}

/**
 * C molloc class interface
 */
class WasmMallocPointer {
  /**
   * Allocate memory
   * @param {number} size - size of allocated memory in bytes.
   * @param {boolean} isSigned
   * @param {boolean} isFloat
   */
  constructor (size, isSigned = false, isFloat = false) {
    this._size = size;
    switch (this._size) {
      case 1:
        this._heapArray = isSigned ? WASM.HEAP8 : WASM.HEAPU8;
        break;
      case 2:
        this._heapArray = isSigned ? WASM.HEAP16 : WASM.HEAPU16;
        break;
      case 4:
        this._heapArray = isSigned ? WASM.HEAP32 : WASM.HEAPU32;
        break;
      default:
        // Pointer is treated as buffer
        this._heapArray = WASM.HEAPU8;
    }

    if (isFloat) {
      // When floating nuber set, override setting.
      this._size = 4;
      this._heapArray = WASM.HEAPF32;
    }

    // Note that is uses the original size parameter.
    this._pointer = WASM._malloc(size);
  }

  /**
   * Free memory
   */
  free () {
    WASM._free(this.pointer);
  }

  /**
   * Get pointer (reference). The pointer is meaningless in the JS context
   * so it is only useful when calling WASM functions.
   */
  get pointer () {
    return this._pointer;
  }

  /**
   * Dereference the pointer to get a value.
   */
  get value () {
    let bitsToShift = 0;
    switch (this._size) {
      case 2:
        bitsToShift = 1;
        break;
      case 4:
        bitsToShift = 2;
        break;
      default:
        throw new Error('Pointer can be only deferenced as integer-sized');
    }
    return this._heapArray[this.pointer >> bitsToShift];
  }

  /**
   * Dereference the pointer to set a value.
   */
  set value (valueToSet) {
    let bitsToShift = 0;
    switch (this._size) {
      case 2:
        bitsToShift = 1;
        break;
      case 4:
        bitsToShift = 2;
        break;
      default:
        throw new Error('Pointer can be only deferenced as integer-sized');
    }
    this._heapArray[this.pointer >> bitsToShift] = valueToSet;
  }
}

/**
 * C malloc allocated signed int32 object
 */
class WasmInt32 extends WasmMallocPointer {
  /**
   * Allocate and assign number
   * @param {number|undefined} value - If undefined the value is not assigned to the memory.
   */
  constructor (value) {
    super(4, true);
    if (typeof value !== 'undefined') {
      this.value = value;
    }
  }
}

/**
 * C malloc allocated unsigned int32 object
 */
class WasmUint32 extends WasmMallocPointer {
  /**
   * Allocate and assign number
   * @param {number|undefined} value - If undefined the value is not assigned to the memory.
   */
  constructor (value) {
    super(4, false);
    if (typeof value !== 'undefined') {
      this.value = value;
    }
  }
}

/**
 * C malloc allocated float buffer object
 */
class WasmMallocBuffer extends WasmMallocPointer {
  /**
   * Allocate buffer
   * @param {number} length - Size of buffer in the number of units, NOT in bytes
   * @param {number} unitSize - Size of a unit in bytes
   * @param {bool} isSigned
   * @param {bool} isFloat
   */
  constructor (length, unitSize, isSigned = false, isFloat = false) {
    super(length * unitSize, isSigned, isFloat);
    let bitsToShift = 0;
    switch (unitSize) {
      case 1:
        this._heapArray = isSigned ? WASM.HEAP8 : WASM.HEAPU8;
        bitsToShift = 0;
        break;
      case 2:
        this._heapArray = isSigned ? WASM.HEAP16 : WASM.HEAPU16;
        bitsToShift = 1;
        break;
      case 4:
        this._heapArray = isSigned ? WASM.HEAP32 : WASM.HEAPU32;
        bitsToShift = 2;
        break;
      default:
        throw new Error('Unit size must be an integer-size');
    }
    if (isFloat) {
      this._heapArray = WASM.HEAPF32;
      bitsToShift = 2;
    }
    let offset = this._pointer >> bitsToShift;
    this._buffer = this._heapArray.subarray(offset, offset + length);
    this._length = length;
  }

  set (array, offset) {
    this._buffer.set(array, offset);
  }

  subarray (begin, end) {
    return this._buffer.subarray(begin, end);
  }

  get length () {
    return this._length;
  }
}

/**
 * C malloc allocated float buffer object
 */
class WasmFloat32Buffer extends WasmMallocBuffer {
  constructor (length) {
    super(length, 4, true, true);
  }
}

/**
 * C malloc allocated unsigned uint8 buffer object
 */
class WasmUint8Buffer extends WasmMallocBuffer {
  /**
   * Allocate and assign number
   * @param {number|undefined} value - If undefined the value is not assigned to the memory.
   */
  constructor (length) {
    super(length, 1, false, false);
  }
}

export { writeString,
  setWASM, WasmInt32, WasmUint32, WasmUint8Buffer, WasmFloat32Buffer };
