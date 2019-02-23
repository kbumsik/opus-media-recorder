(function () {
  'use strict';

  // Non-standard options
  const workerOptions = {
    OggOpusEncoderWasmPath: 'https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/OggOpusEncoder.wasm',
    WebMOpusEncoderWasmPath: 'https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/WebMOpusEncoder.wasm'
  };

  // Polyfill MediaRecorder
  window.MediaRecorder = OpusMediaRecorder;

  // Recorder object
  let recorder;
  // Buttons
  let buttonCreate = document.querySelector('#buttonCreate');
  let buttonStart = document.querySelector('#buttonStart');
  let buttonPause = document.querySelector('#buttonPause');
  let buttonResume = document.querySelector('#buttonResume');
  let buttonStop = document.querySelector('#buttonStop');
  let buttonStopTracks = document.querySelector('#buttonStopTracks'); // For debugging purpose
  // User-selectable option
  let mimeSelect = document.querySelector('#mimeSelect');
  let mimeSelectValue = '';
  mimeSelect.onchange = (e) => { mimeSelectValue = e.target.value; };
  let timeSlice = document.querySelector('#timeSlice');
  // Player
  let player = document.querySelector('#player');
  let link = document.querySelector('#link');
  // Sticky divs
  let status = document.querySelector('#status');

  // This creates a MediaRecorder object
  buttonCreate.onclick = () => {
    navigator.mediaDevices.getUserMedia({audio: true, video: false})
      .then((stream) => {
        if (recorder && recorder.state !== 'inactive') {
          console.log('Stop the recorder first');
          throw new Error('Stop the recorder first');
        }
        return stream;
      })
      .then(createMediaRecorder)
      .catch(e => {
        console.log(`MediaRecorder is failed: ${e.message}`);
        Promise.reject(new Error());
      })
      .then(printStreamInfo) // Just for debugging purpose.
      .then(_ => console.log('Creating MediaRecorder is successful.'))
      .then(initButtons)
      .then(updateButtonState);
  };

  function createMediaRecorder (stream) {
    // Create recorder object
    let options = { mimeType: mimeSelectValue };
    recorder = new MediaRecorder(stream, options, workerOptions);

    let dataChunks = [];
    // Recorder Event Handlers
    recorder.onstart = _ => {
      dataChunks = [];

      console.log('Recorder started');
      updateButtonState();
    };
    recorder.ondataavailable = (e) => {
      dataChunks.push(e.data);

      console.log('Recorder data available');
      updateButtonState();
    };
    recorder.onstop = (e) => {
      // When stopped add a link to the player and the download link
      let blob = new Blob(dataChunks, {'type': recorder.mimeType});
      dataChunks = [];
      let audioURL = URL.createObjectURL(blob);
      player.src = audioURL;
      link.href = audioURL;
      let extension = recorder.mimeType.match(/ogg/) ? '.ogg'
                    : recorder.mimeType.match(/webm/) ? '.webm'
                    : recorder.mimeType.match(/wav/) ? '.wav'
                    : '';
      link.download = 'recording' + extension;

      console.log('Recorder stopped');
      updateButtonState();
    };
    recorder.onpause = _ => console.log('Recorder paused');
    recorder.onresume = _ => console.log('Recorder resumed');
    recorder.onerror = e => console.log('Recorder encounters error:' + e.message);

    return stream;
  }
  function initButtons () {
    buttonStart.onclick = _ => recorder.start(timeSlice.value);
    buttonPause.onclick = _ => recorder.pause();
    buttonResume.onclick = _ => recorder.resume();
    buttonStop.onclick = _ => recorder.stop();
    buttonStopTracks.onclick = _ => {
      // stop all tracks (this will delete a mic icon from a browser tab
      recorder.stream.getTracks().forEach(i => i.stop());
      console.log('Tracks (stream) stopped. click \'Create\' button to capture stream.');
    };
  }

  // Check compatibility
  window.addEventListener('load', _ => {
    // Check compatibility
    if (window.OpusMediaRecorder === undefined) {
      console.error('No OpusMediaRecorder found');
    } else {
      // Check available content types
      let contentTypes = [
        'audio/wave',
        'audio/wav',
        'audio/ogg',
        'audio/ogg;codecs=opus',
        'audio/webm',
        'audio/webm;codecs=opus'
      ];
      contentTypes.forEach(type => {
        console.log(type + ' is ' +
          (MediaRecorder.isTypeSupported(type)
            ? 'supported' : 'NOT supported'));
      });
    }
  }, false);

  // Update state of buttons when any buttons clicked
  function updateButtonState () {
    switch (recorder.state) {
      case 'inactive':
        buttonCreate.disabled = false;
        buttonStart.disabled = false;
        buttonPause.disabled = true;
        buttonResume.disabled = true;
        buttonStop.disabled = true;
        buttonStopTracks.disabled = false; // For debugging purpose
        status.innerHTML =
          link.href ? 'Recording complete. You can play or download the recording below.'
                    : 'Stream created. Click "start" button to start recording.';
        break;
      case 'recording':
        buttonCreate.disabled = true;
        buttonStart.disabled = true;
        buttonPause.disabled = false;
        buttonResume.disabled = false;
        buttonStop.disabled = false;
        buttonStopTracks.disabled = false; // For debugging purpose
        status.innerHTML = 'Recording. Click "stop" button to play recording.';
        break;
      case 'paused':
        buttonCreate.disabled = true;
        buttonStart.disabled = true;
        buttonPause.disabled = true;
        buttonResume.disabled = false;
        buttonStop.disabled = false;
        buttonStopTracks.disabled = false; // For debugging purpose
        status.innerHTML = 'Paused. Click "resume" button.';
        break;
      default:
        // Maybe recorder is not initialized yet so just ingnore it.
        break;
    }
  }


  /*******************************************************************************
   * Debug helpers
   *    This section is only for debugging purpose, library users don't need them.
   ******************************************************************************/
  // Monkey-patching console.log for debugging.
  document.addEventListener('DOMContentLoaded', (e) => {
    let lineCount = 0;

    function overrideConsole (oldFunction, divLog) {
      return function (text) {
        oldFunction(text);
        lineCount += 1;
        if (lineCount > 100) {
          let str = divLog.innerHTML;
          divLog.innerHTML = str.substring(str.indexOf('<br>') + '<br>'.length);
        }
        divLog.innerHTML += text + '<br>';
      };
    }
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

  // print stream information (for debugging)
  function printStreamInfo (stream) {
    for (const track of stream.getAudioTracks()) {
      console.log('Track Information:');
      for (const key in track) {
        if (typeof track[key] !== 'function') {
          console.log(`\t${key}: ${track[key]}`);
        }
      }
      console.log('Track Settings:');
      let settings = track.getSettings();
      for (const key in settings) {
        if (typeof settings[key] !== 'function') {
          console.log(`\t${key}: ${settings[key]}`);
        }
      }
    }
  }
  /*******************************************************************************
   * End of debug helpers
   ******************************************************************************/

}());
