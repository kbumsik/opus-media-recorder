/**
 * This file is only for debugging purpose, library users don't need this.
 */
'use strict';

// Monkey-patching console.log for debugging.
document.addEventListener('DOMContentLoaded', (e) => {
  let lineCount = 0;

  function overrideConsole (oldFunction, divLog) {
    return function (text) {
      oldFunction(text);
      lineCount += 1;
      if (lineCount > 35) {
        let str = divLog.innerHTML;
        divLog.innerHTML = str.substring(str.indexOf('<br>') + '<br>'.length);
      }
      divLog.innerHTML += text + '<br>';
    };
  };

  console.log = overrideConsole(console.log.bind(console), document.getElementById('errorLog'));
  console.error = overrideConsole(console.error.bind(console), document.getElementById('errorLog'));
  console.debug = overrideConsole(console.debug.bind(console), document.getElementById('errorLog'));
  console.info = overrideConsole(console.info.bind(console), document.getElementById('errorLog'));
}, false);

// Print any error
window.onerror = (msg, url, lineNo, columnNo, error) => {
  let substring = 'script error';
  if (msg.toLowerCase().indexOf(substring) > -1) {
    console.log('Script Error: See Browser Console for Detail');
  } else {
    let message = [
      'Message: ' + msg,
      'URL: ' + url,
      'Line: ' + lineNo,
      'Column: ' + columnNo,
      'Error object: ' + JSON.stringify(error)
    ].join(' - ');

    console.log(message);
  }
  return false;
};
