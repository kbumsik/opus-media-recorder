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

export { writeString };
