'use strict';

import RingTones from './RingTone.js';

export default class Tone {

    constructor(context) {
        this.context = context;
        this.audioDest = this.context.createMediaStreamDestination();
        this.audioOutput = new Audio();
        this.audioOutput.srcObject = this.audioDest.stream;
        this.status = 0;
        this.ringing = 0;
        this.ringDest = this.context.createMediaStreamDestination();
        this.ringOutput = new Audio();
        this.ringOutput.srcObject = this.ringDest.stream;
        this.setRingTone(0);
    }

    set audioSinkId(deviceId) {
        this.audioOutput.setSinkId(deviceId);
    };

    set ringSinkId(deviceId) {
        this.ringOutput.setSinkId(deviceId);
    };

    getRingTones() {
        let tones = [];
        RingTones.ringTones.forEach(function (tone, index) {
            tones.push({id: index.toString(), name: tone.name});
        });
        return tones;
    };

    setRingTone(idx) {
        const binary = atob(RingTones.ringTones[idx].tone);
        const ringToneBuffer = new ArrayBuffer(binary.length);
        const bytes = new Uint8Array(ringToneBuffer);
        for (let i = 0; i < ringToneBuffer.byteLength; i++) {
            bytes[i] = binary.charCodeAt(i) & 0xFF;
        }
        const tone = this;
        this.context.decodeAudioData(ringToneBuffer, function(buffer) {
            tone.ringAudioBuffer = buffer;
        }).then();
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

    startDTMF(value) {
        if (this.ringing === 1) return;
        const dtmfFrequencies = {
            '1': {f1: 697, f2: 1209},
            '2': {f1: 697, f2: 1336},
            '3': {f1: 697, f2: 1477},
            '4': {f1: 770, f2: 1209},
            '5': {f1: 770, f2: 1336},
            '6': {f1: 770, f2: 1477},
            '7': {f1: 852, f2: 1209},
            '8': {f1: 852, f2: 1336},
            '9': {f1: 852, f2: 1477},
            '*': {f1: 941, f2: 1209},
            '0': {f1: 941, f2: 1336},
            '#': {f1: 941, f2: 1477}
        };
        this.start(dtmfFrequencies[value].f1, dtmfFrequencies[value].f2);
    };

    stopDTMF() {
        if (this.ringing === 1) return;
        this.stop();
    };

    createRingerLFO() {
        // Create an empty 3 second mono buffer at the sample rate of the AudioContext
        let channels = 1;
        let sampleRate = this.context.sampleRate;
        let frameCount = sampleRate * 3;
        let arrayBuffer = this.context.createBuffer(channels, frameCount, sampleRate);
        // getChannelData allows us to access and edit the buffer data and change.
        let bufferData = arrayBuffer.getChannelData(0);
        for (let i = 0; i < frameCount; i++) {
            // if the sample lies between 0 and 0.4 seconds, or 0.6 and 1 second, we want it to be on.
            if ((i / sampleRate > 0 && i / sampleRate < 0.4) || (i / sampleRate > 0.6 && i / sampleRate < 1.0)) {
                bufferData[i] = 0.25;
            }
        }
        this.ringerLFOBuffer = arrayBuffer;
    };

    startRinging() {
        this.start(400, 450);
        this.ringing = 1;
        // set our gain node to 0, because the LFO is calibrated to this level
        this.gainNode.gain.value = 0;
        this.createRingerLFO();
        this.ringerLFOSource = this.context.createBufferSource();
        this.ringerLFOSource.buffer = this.ringerLFOBuffer;
        this.ringerLFOSource.loop = true;
        // connect the ringerLFOSource to the gain Node audio param
        this.ringerLFOSource.connect(this.gainNode.gain);
        this.ringerLFOSource.start(0);
    };

    stopRinging() {
        if (this.ringing === 1) {
            this.ringerLFOSource.stop(0);
            this.ringerLFOSource.disconnect(0);
            this.stop();
            this.ringing = 0;
        }
    };

    boopBoop() {
        let tone = this;
        // wait for ringing to stop 1st
        if (this.ringing === 1) {
            this.stopRinging();
            setTimeout(function() {
                tone.boopBoop();
            }, 50);
            return;
        }
        tone.start(400, 400);
        setTimeout(function() {
            tone.stop();
            setTimeout(function() {
                tone.start(400, 400);
                setTimeout(function() {
                    tone.stop();
                }, 250);
            }, 200);
        }, 250);
    };

    beep() {
        this.start(1046, 1046);
        let tone = this;
        setTimeout(function() {
            tone.stop();
        }, 200);
    };

    startPlayback() {
        this.ringSource = this.context.createBufferSource();
        this.ringSource.loop = true;
        this.ringSource.buffer = this.ringAudioBuffer;
        this.ringSource.connect(this.ringDest);
        this.ringOutput.play();
        if (this.ringOutput.sinkId !== this.audioOutput.sinkId) {
            this.ringSource.connect(this.audioDest);
            this.audioOutput.play();
        }
        this.ringSource.start(0);
    }

    stopPlayback() {
        this.ringOutput.pause();
        this.audioOutput.pause();
        if (this.ringSource) {
            this.ringSource.stop(0);
            this.ringSource = null;
        }
    }

}
