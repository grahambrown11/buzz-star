'use strict';

import Tone from './Tone.js';

export default class DTMF extends Tone {

    constructor() {
        super(new AudioContext());
    }

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

}