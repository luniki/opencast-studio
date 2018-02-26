class Compositor extends EventEmitter {

  constructor(opts) {
    super();

    this.streams = [];
    this.streamOrder = [];

    this.codecs = [
                    'video/webm;codecs="vp9,opus"',
                    'video/webm;codecs="vp9.0,opus"',
                    'video/webm;codecs="avc1"',
                    'video/x-matroska;codecs="avc1"',
                    'video/webm;codecs="vp8,opus"'
                  ].filter(codec => MediaRecorder.isTypeSupported(codec));
    this.recorder = null;
    this.recData = [];

    this.width = (opts ? (opts.width || 1280) : 1280);
    this.height = (opts ? (opts.height || 720) : 720);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');

    let _stream = null;

    Object.defineProperty(this, 'stream', {
      get: function() {
        return _stream;
      },
      set: function(stream) {
        if (stream === null || stream instanceof MediaStream) {
          _stream = stream;
          if (stream) {
            this.emit('stream', {stream: stream, id: 'composite'});
          }
        }
      }
    });

    this.rafToken = null;

    Object.defineProperty(this, 'dimensions', {
      get: function() {
        return {width: this.width, height: this.height};
      }
    });

    let _browser = window.hasOwnProperty('InstallTrigger') ? 'firefox' : (
                     window.hasOwnProperty('chrome') && chrome.app ? 'chrome' : 'other'
                   );

    this.isChrome = _browser === 'chrome';
  }

  addStream(streamObj) {
    let streamIndex = this.streams.map(curStream => curStream.id).indexOf(streamObj.id);
    if (streamIndex > -1) {
      this.streams[streamIndex].active = true;
      console.log('here');
      if (this.streams[streamIndex].stream.id != streamObj.stream.id) {
        console.log('inside');
        console.log(this.streams[streamIndex]);
        this.streams[streamIndex].stream = streamObj.stream;
        this.streams[streamIndex].video.srcObject = streamObj.stream;
      }
      else console.log('same id');
      return;
    }
    if (this.streams.length > 4) {
      throw new Error('max streams attached');
    }

    let video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;

    video.onloadedmetadata = () => {
      let position = this.getPosition(video, streamObj.id);

      this.streams.push({
        id: streamObj.id,
        stream: streamObj.stream,
        video: video,
        active: true,
        offsetX: position.offsetX,
        offsetY: position.offsetY,
        width: position.width,
        height: position.height
      });
      if (streamObj.id == 'desktop') {
        this.streamOrder.unshift(streamObj.id);
      }
      else {
        this.streamOrder.push(streamObj.id);
      }
    };
    video.srcObject = streamObj.stream;

    if (this.stream && streamObj.stream.getAudioTracks().length) {
      console.log(streamObj.stream.getAudioTracks()[0], this.stream);
      this.addAudioTrack(streamObj.stream.getAudioTracks()[0]);
    }
  }

  removeStream(id) {
    return new Promise((resolve, reject) => {
      let streamIndex = this.streams.map(curStream => curStream.id).indexOf(id);

      if (streamIndex === -1) {
        reject("no such stream");
        return;
      }

      resolve(this.streams.splice(streamIndex, 1));
    });
  }

  getPosition(video, id) {
    switch (id) {
      case 'desktop':
        return {
            width: Math.min(video.videoWidth, this.width),
           height: Math.min(video.videoHeight, this.height),
          offsetX: 0,
          offsetY: (this.height - Math.min(video.videoHeight, this.height)) / 2
        };

      default:
        let aspectRatio = video.videoWidth / video.videoHeight;
        let isLandscape = aspectRatio > 1;
        let width = (isLandscape) ? this.width / 4 : this.height / 4 * aspectRatio; 
        let height = (isLandscape) ? (this.width / 4) / aspectRatio : this.height / 4;
        let offsets = this.getDefaultOffsets(width, height);
        return {
            width: width,
           height: height,
          offsetX: offsets.x,
          offsetY: offsets.y
        };
    }
  }

  getDefaultOffsets(width, height) {
    let x = this.width - width;
    let y = this.height - height;

    this.streams.forEach(stream => {
      if (stream.id !== 'desktop') {
        if (x >= stream.offsetX && x < (stream.offsetX + stream.width) &&
            y >= stream.offsetY && y < (stream.offsetY + stream.height)) {
          x = Math.max(0, stream.offsetX - width);
        }
      }
    });

    return {x: x, y: y};
  }

  draw() {
    this.streams
      .sort((a, b) => this.streamOrder.indexOf(a.stream.id) - this.streamOrder.indexOf(b.stream.id))
      .filter(stream => stream.active)
      .forEach(stream => {
        this.ctx.drawImage(stream.video, stream.offsetX, stream.offsetY, stream.width, stream.height);
      });
  }

  start() {
    this.emit('subscribe.raf', this.draw, function(token) {
      this.rafToken = token;
    });

    this.stream = this.canvas.captureStream(30);
    this.streams.forEach(streamObj => {
      if (streamObj.stream.getAudioTracks().length) {
        this.addAudioTrack(streamObj.stream.getAudioTracks()[0]);
      }
    });
  }

  stop() {
    this.emit('unsubscribe.raf', this.refToken, () => this.rafToken = null);
    this.stream = null;
    this.emit('stream.remove', 'composite');
  }

  addAudioTrack(track) {
    if (this.isChrome) {
      this.stream.addTrack(track);
    }
    else {
      this.stream = new MediaStream([track, ...this.stream.getVideoTracks(), ...this.stream.getAudioTracks()])
    }
    this.emit('stream.mute');
  }

  record() {
    if (!this.recorder) {
      if (!this.stream) {
        throw new Error("Can't record as stream is not active");
      }

      this.recorder = new Recorder(this.stream);
      this.recorder.on('record.complete', media => {
        media.id = 'compositor';
        this.emit('record.complete', media);
        this.recorder = null;
      });
      this.recorder.start(1000);
    }
    else {
      this.recorder.resume();
    }
  }

  stopRecording() {
    if (this.recorder) {
      this.recorder.stop();
      this.emit('record.prepare', {
         label: 'compositor',
            id: 'compositor',
        flavor: 'Composite'
      });
    }
  }

  pauseRecording() {
    this.recorder.pause();
  }
}
