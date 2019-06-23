import React, { Component } from 'react';
import OpusMediaRecorderView from './OpusMediaRecorderView'

class App extends Component {
  constructor(props) {
    super(props);
    const data = [];
    this.state = { data: data, blob: new Blob(data)};
  }

  render() {
    return (
      <div className="App">
        <OpusMediaRecorderView
          onDataAvailable={(e) => {
            const data = [...this.state.data, e.data];
            this.setState({
              data: data,
              blob: new Blob(data)
            })
          }}
          render={({ state, start, stop, pause, resume }) => (
            <div>
              <p>{state}</p>
              <button onClick={start}>Start Recording</button>
              <button onClick={stop}>Stop Recording</button>
              <audio
                src={this.state.data.length ? URL.createObjectURL(this.state.blob) : ''}
                controls
              />
            </div>
          )}
        />
      </div>
    )
  }
}

export default App;
