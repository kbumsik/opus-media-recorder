'use strict';

// Recorder object
let recorder;
// Buttons
let buttonCreate = document.querySelector('#buttonCreate');
let buttonStart = document.querySelector('#buttonStart');
let buttonPause = document.querySelector('#buttonPause');
let buttonResume = document.querySelector('#buttonResume');
let buttonStop = document.querySelector('#buttonStop');
let buttonStopTracks = document.querySelector('#buttonStopTracks');
// User-selectable option
let mimeSelect = document.querySelector('#mimeSelect');
let mimeSelectValue = '';
mimeSelect.onchange = (e) => { mimeSelectValue = e.target.value; };
let timeSlice = document.querySelector('#timeSlice');
// Player
let player = document.querySelector('#player');
let link = document.querySelector('#link');

// This creates a MediaRecorder object
buttonCreate.onclick = () => {
  navigator.mediaDevices.getUserMedia({audio: true, video: false})
    .then((stream) => {
      if (recorder && recorder.state !== 'inactive') {
        console.log('Stop the recorder first');
        throw new Error('');
      }
      return stream;
    })
    .then(createMediaRecorder)
    .then(printStreamInfo) // Just for debugging purpose.
    .then(_ => console.log('Creating MediaRecorder is successful.'))
    .then(initButtons)
    .then(updateButtonState)
    .catch(_ => console.log('MediaRecorder is failed!!'));
};

function createMediaRecorder (stream) {
  // Create recorder object
  let config = { mimeType: mimeSelectValue };
  recorder = new MediaRecorder(stream, config);

  let dataChunks = [];
  // Recorder Event Handlers
  recorder.onstart = _ => {
    dataChunks = [];
    console.log('Recorder started');
  };
  recorder.ondataavailable = (e) => {
    dataChunks.push(e.data);
    console.log('Recorder data available');
  };
  recorder.onstop = (e) => {
    // When stopped add a link to the player and the download link
    let blob = new Blob(dataChunks, {'type': recorder.mimeType});
    dataChunks = [];
    let audioURL = URL.createObjectURL(blob);
    player.src = audioURL;
    link.href = audioURL;
    console.log('Recorder stopped');
  };
  recorder.onpause = _ => console.log('Recorder paused');
  recorder.onresume = _ => console.log('Recorder resumed');
  recorder.onerror = _ => console.log('Recorder encounters error');

  return stream;
};

function initButtons () {
  buttonStart.onclick = _ => { recorder.start(timeSlice.value); updateButtonState(); };
  buttonPause.onclick = _ => { recorder.pause(); updateButtonState(); };
  buttonResume.onclick = _ => { recorder.resume(); updateButtonState(); };
  buttonStop.onclick = _ => { recorder.stop(); updateButtonState(); };
  buttonStopTracks.onclick = _ => {
    // stop all tracks (this will delete a mic icon from a browser tab
    recorder.stream.getTracks().forEach(i => i.stop());
    console.log('Tracks (stream) stopped. click \'Create\' button to capture stream.');
  };
}

// Overriding console.log
document.addEventListener('DOMContentLoaded', _ => {
  // Check compability
  if (window.MediaRecorder === undefined) {
    console.error('No MediaRecorder found');
  } else {
    let contentTypes = [
      'audio/wave',
      'audio/wav',
      // 'audio/webm',
      // 'audio/webm;codecs=opus',
      'audio/ogg',
      'audio/ogg;codecs=opus'
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
      buttonStopTracks.dusabled = false;
      break;
    case 'recording':
      buttonCreate.disabled = true;
      buttonStart.disabled = true;
      buttonPause.disabled = false;
      buttonResume.disabled = false;
      buttonStop.disabled = false;
      buttonStopTracks.dusabled = false;
      break;
    case 'paused':
      buttonCreate.disabled = true;
      buttonStart.disabled = true;
      buttonPause.disabled = true;
      buttonResume.disabled = false;
      buttonStop.disabled = false;
      buttonStopTracks.dusabled = false;
      break;
    default:
      // Maybe recorder is not initialized yet so just ingnore it.
      break;
  }
}

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
