import { Component } from 'react';
import PropTypes from 'prop-types';
import MediaRecorder from 'opus-media-recorder';

// opus-media-recorder options
const workerOptions = {
  encoderWorkerFactory: function () {
    return new Worker(process.env.PUBLIC_URL + '/opus-media-recorder/encoderWorker.umd.js')
  },
  OggOpusEncoderWasmPath: process.env.PUBLIC_URL + '/opus-media-recorder/OggOpusEncoder.wasm',
  WebMOpusEncoderWasmPath: process.env.PUBLIC_URL + '/opus-media-recorder/WebMOpusEncoder.wasm',
};

class OpusMediaRecorderView extends Component {
  static propTypes = {
    mimeType: PropTypes.string,
    onDataAvailable: PropTypes.func.isRequired,
    render: PropTypes.func.isRequired
  }

  static defaultProps = {
    mimeType: ''
  }

  constructor(props) {
    super(props);
    this.state = {state: 'notInitialized'};
  }

  start = () => {
    console.log('start recording called');
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const options = { mimeType: this.props.mimeType }
      this.recorder = new MediaRecorder(stream, options, workerOptions);
      this.setState({state: 'inactive'});
      this.recorder.start();

      this.recorder.addEventListener('dataavailable', (e) => {
        console.log('Recording stopped, data available');
        this.onDataAvailable(e);
      });
      this.recorder.addEventListener('start', (e) => {
        console.log('start');
        this.setState({state: 'recording'});
      })
      this.recorder.addEventListener('stop', (e) => {
        console.log('stop');
        this.setState({state: 'inactive'});
      })
      this.recorder.addEventListener('pause', (e) => {
        console.log('pause');
        this.setState({state: 'paused'});
      })
      this.recorder.addEventListener('resume', (e) => {
        console.log('resume');
        this.setState({state: 'recording'});
      })
      this.recorder.addEventListener('error', (e) => {
        console.log('error');
      })
    });
  }

  stop = () => {
    console.log('stop recording called');
    this.recorder.stop();
  }

  pause = () => {
    console.log('pause recording called');
    this.recorder.pause();
  }

  onDataAvailable = (e) => {
    this.props.onDataAvailable(e);
  }

  render = () =>
    this.props.render({
      state: this.state.state,
      start: this.start,
      stop: this.stop,
      pause: this.pause,
      resume: this.resume,
  });
}

export default OpusMediaRecorderView;
