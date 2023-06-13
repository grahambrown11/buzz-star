'use strict';

export default class Tone {

    constructor(context) {
        this.context = context;
        this.audioDest = this.context.createMediaStreamDestination();
        this.audioOutput = new Audio();
        this.audioOutput.srcObject = this.audioDest.stream;
        this.status = 0;
    }

    set audioSinkId(deviceId) {
        this.audioOutput.setSinkId(deviceId);
    };

    start(freq1, freq2) {
        if (this.status === 1) return;
        this.audioOutput.play();
        this.osc1 = this.context.createOscillator();
        this.osc2 = this.context.createOscillator();
        this.gainNode = this.context.createGain();
        this.gainNode.gain.value = 0.25;
        this.filter = this.context.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 8000;
        this.osc1.connect(this.gainNode);
        this.osc2.connect(this.gainNode);
        this.gainNode.connect(this.filter);
        this.filter.connect(this.audioDest);
        this.osc1.frequency.value = freq1;
        this.osc2.frequency.value = freq2;
        this.osc1.start(0);
        this.osc2.start(0);
        this.status = 1;
    };

    stop() {
        this.audioOutput.pause();
        this.osc1.stop(0);
        this.osc2.stop(0);
        this.status = 0;
    };

}
