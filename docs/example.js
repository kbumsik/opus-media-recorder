'use strict';

// Recorder object
let recorder;
let visualAudioContext; // Only for decoration purpose.
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
    .catch(_ => console.log('MediaRecorder is failed!!'))
    .then(createVisualization) // Decoration purpose only.
    .then(printStreamInfo) // Just for debugging purpose.
    .then(_ => console.log('Creating MediaRecorder is successful.'))
    .then(initButtons)
    .then(updateButtonState)
    .catch(_ => console.log('Error after creating a MediaRecorder object. ' +
      'Recording should still works.'));
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
  recorder.onerror = e => console.log('Recorder encounters error:' + e.message);

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
      break;
    case 'recording':
      buttonCreate.disabled = true;
      buttonStart.disabled = true;
      buttonPause.disabled = false;
      buttonResume.disabled = false;
      buttonStop.disabled = false;
      buttonStopTracks.disabled = false; // For debugging purpose
      break;
    case 'paused':
      buttonCreate.disabled = true;
      buttonStart.disabled = true;
      buttonPause.disabled = true;
      buttonResume.disabled = false;
      buttonStop.disabled = false;
      buttonStopTracks.disabled = false; // For debugging purpose
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

// Decoration purpose only. opus-media-recorder users don't need this.
function createVisualization (stream) {
  if (visualAudioContext) {
    return stream;
  }

  visualAudioContext = new (window.AudioContext || window.webkitAudioContext)();

  let timeAnalyser = visualAudioContext.createAnalyser();
  timeAnalyser.minDecibels = -90;
  timeAnalyser.maxDecibels = -10;
  timeAnalyser.smoothingTimeConstant = 0.85;

  let freqAnalyser = visualAudioContext.createAnalyser();
  freqAnalyser.minDecibels = -90;
  freqAnalyser.maxDecibels = -10;
  freqAnalyser.smoothingTimeConstant = 0.85;

  // set up canvas contexts for visualizations
  let canvas = document.querySelector('.stream-vis__canvas');
  let canvasContext = canvas.getContext('2d');
  let intendedWidth = document.querySelector('.stream-vis__div').clientWidth;
  canvas.setAttribute('width', intendedWidth);

  let source = visualAudioContext.createMediaStreamSource(stream);
  source.connect(timeAnalyser);
  source.connect(freqAnalyser);

  /**
   * visualize stream
   */
  function visualize () {
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    // time visualization prep
    timeAnalyser.fftSize = 2048;
    let timeBufferLength = timeAnalyser.fftSize;
    let timeDataArray = new Uint8Array(timeBufferLength);

    // frequency visualization prep
    freqAnalyser.fftSize = 128;
    let freqBufferLength = freqAnalyser.frequencyBinCount;
    let freqDataArray = new Uint8Array(freqBufferLength);

    // create time based visualization
    function drawTime () {
      timeAnalyser.getByteTimeDomainData(timeDataArray);

      canvasContext.lineWidth = 4;
      canvasContext.strokeStyle = 'rgb(120, 120, 120)';

      canvasContext.beginPath();

      let sliceWidth = WIDTH * 1.0 / timeBufferLength;
      let x = 0;

      for (let i = 0; i < timeBufferLength; i++) {
        let v = timeDataArray[i] / 128.0;
        let y = v * HEIGHT / 2;

        if (i === 0) {
          canvasContext.moveTo(x, y);
        } else {
          canvasContext.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasContext.lineTo(canvas.width, canvas.height / 2);
      canvasContext.stroke();
    };

    // create frequency based visualization
    function drawFreq () {
      freqAnalyser.getByteFrequencyData(freqDataArray);

      let barWidth = (WIDTH / freqBufferLength);
      let barHeight;
      let x = 0;
      let rgbBase = recorder.state === 'recording' ? 70 : 150;

      for (let i = 0; i < freqBufferLength; i++) {
        barHeight = 1.5 * freqDataArray[i];

        // blue bars for low signal, red for high
        let whiteStrength = rgbBase + barHeight / 3;
        canvasContext.fillStyle = `rgb(${whiteStrength},${whiteStrength},${whiteStrength})`;
        canvasContext.fillRect(x, HEIGHT - barHeight / 2, barWidth, barHeight / 2);

        x += barWidth + 1;
      }
    };

    function draw () {
      requestAnimationFrame(draw);

      canvasContext.clearRect(0, 0, WIDTH, HEIGHT);

      drawTime();
      drawFreq();
    }

    draw();
  };

  visualize();
  return stream;
}
