var AudioAnalyser = function AudioAnalyserImpl(isNoCanvas) {
  this.audioSource = null;
  this.audioId = null;
  this.canvas = null;
  this.canvasCtx = null;
  this.WIDTH = 0;
  this.height = 0;
  this.noCanvas = isNoCanvas;

  this.audioCtx = null;
  this.analyser = null;
  this.bufferLength = 0;
  this.dataArray = null;

  this.analysisState = false;

  var _subscriptions = {};
  Object.defineProperty(this, 'subscriptions', {
    get: function() {
      return _subscriptions;
    }
  });

  var _delegations = {};
  Object.defineProperty(this, 'delegations', {
    get: function() {
      return _delegations;
    }
  });

  this.rafTokens = {
    performCalc: null
  };
};

AudioAnalyser.prototype = {
  constructor: AudioAnalyser,
  init: function() {
    this.analyser.fftSize = 128;
  },
  attachCanvas: function(canvas) {
    canvas = canvas[0] || canvas;

    if (this.canvas !== canvas) {
      this.canvas = canvas;
      this.setCanvasDimensions(canvas);
    }
  },
  setCanvasDimensions: function(canvas, isMerged) {
    this.canvas.width = this.WIDTH = this.canvas.clientWidth;
    this.canvas.height = this.HEIGHT = this.canvas.clientHeight;
    this.canvasCtx = this.canvas.getContext('2d');
    this.canvasCtx.lineWidth = this.canvas.height - 2;
    this.canvasCtx.lineCap = 'round';
    this.canvasCtx.fillStyle = isMerged ? 'rgba(255,255,255,0.3)' : 'white';
    this.canvasCtx.strokeStyle = '#09f';
  },
  analyse: function(track) {
    this.audioCtx = new (AudioContext || webkitAudioContext)();
    this.analyser = this.audioCtx.createAnalyser();
    this.audioSource = this.audioCtx.createMediaStreamSource(track);
    this.audioSource.connect(this.analyser);
    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);
    this.analysisState = true;

    if (!this.noCanvas) {
      this.canvasCtx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
    }

    this.delegate('subscribe.raf', this.performCalc, token => {
      this.rafTokens.performCalc = token;
    });
  },
  performCalc: function(hiPerfTimeStamp) {
    try {
      this.analyser.getByteTimeDomainData(this.dataArray);
      let magnitude = Math.sqrt(
        this.dataArray.reduce((collect, current) => {
          return collect + Math.pow((current - 128) / 128.0, 2);
        }, 0.0)
      );
      this.notifyDependencies('magnitude', magnitude);
      if (!this.noCanvas) {
        this.drawFn(magnitude);
      }
    } catch (e) {
      console.log(e);
    }
  },
  stopAnalysis: function() {
    this.analysisState = false;
    this.notify(0);
  },
  draw: function(magnitude) {
    this.canvasCtx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
    this.canvasCtx.beginPath();
    this.canvasCtx.moveTo(this.HEIGHT / 2, this.HEIGHT / 2);

    let lineWidth = Math.max((magnitude / 16) * this.WIDTH, this.HEIGHT / 2);
    this.canvasCtx.lineTo(lineWidth, this.HEIGHT / 2);
    this.canvasCtx.stroke();
  },
  drawMerged: function(magnitude) {
    this.canvasCtx.clearRect(0, 0, this.WIDTH, this.HEIGHT);
    this.canvasCtx.beginPath();
    let calcMag = (magnitude / 16) * this.WIDTH;
    this.canvasCtx.lineWidth = calcMag;
    this.canvasCtx.moveTo(this.HEIGHT / 2, this.HEIGHT / 2);
    this.canvasCtx.lineTo(this.HEIGHT / 2, this.HEIGHT / 2);
    this.canvasCtx.stroke();
  },
  drawFn: function(magnitude) {
    return this.draw(magnitude);
  },
  switchDraw: function(fnString) {
    if (typeof fnString == 'string' && this.__proto__[fnString]) {
      this.delegate('pause.raf', this.rafTokens.performCalc);
      this.clearCanvas();
      setTimeout(() => {
        this.setCanvasDimensions(this.canvas, fnString === 'drawMerged');
        this.__proto__.drawFn = this.__proto__[fnString];
        this.delegate('resume.raf', this.rafTokens.performCalc);
      }, 1500);
    }
  },
  clearCanvas: function() {
    this.canvasCtx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
  },
  on: function(ev, fn) {
    if (!this.subscriptions.hasOwnProperty(ev)) {
      this.subscriptions[ev] = {};
    }

    var currentSubscriptions = Object.keys(this.subscriptions);

    let randString = null;
    do {
      randString = (1 + Math.random()).toString(36).substring(2, 10);
    } while (currentSubscriptions.indexOf(randString) > -1);

    this.subscriptions[ev][randString] = fn;
  },
  notifyDependencies: function(ev, val) {
    if (this.subscriptions.hasOwnProperty(ev)) {
      for (var key in this.subscriptions[ev]) {
        this.subscriptions[ev][key](val);
      }
    }
  },
  delegate: function() {
    let args = Array.prototype.slice.call(arguments);
    if (this.delegations.hasOwnProperty(args[0])) {
      this.delegations[args[0]].forEach(fn => {
        fn.apply(this, args.slice(1));
      });
    }
  },
  ondelegation: function(type, fn) {
    if (!this.delegations.hasOwnProperty(type)) {
      this.delegations[type] = [];
    }

    this.delegations[type].push(fn);
  }
};

export default AudioAnalyser;
