'use strict';

import Tone from './Tone.js';
import Ringer from './Ringer.js';

export default class RingTone extends Tone {

    constructor(context) {
        super(context);
        this.ringing = 0;
        this.ringDest = this.context.createMediaStreamDestination();
        this.ringOutput = new Audio();
        this.ringOutput.srcObject = this.ringDest.stream;
        this.setRingTone(0);
    }

    set ringSinkId(deviceId) {
        this.ringOutput.setSinkId(deviceId);
    };

    getRingTones() {
        let tones = [];
        Ringer.options.forEach(function (tone, index) {
            tones.push({id: index.toString(), name: tone.name});
        });
        return tones;
    };

    setRingTone(idx, callback) {
        const binary = atob(Ringer.options[idx].wav);
        const ringToneBuffer = new ArrayBuffer(binary.length);
        const bytes = new Uint8Array(ringToneBuffer);
        for (let i = 0; i < ringToneBuffer.byteLength; i++) {
            bytes[i] = binary.charCodeAt(i) & 0xFF;
        }
        const tone = this;
        this.context.decodeAudioData(ringToneBuffer, function(buffer) {
            tone.ringAudioBuffer = buffer;
        }).then(() => {
            if (callback)
                callback();
        });
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