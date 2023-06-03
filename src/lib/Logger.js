'use strict';

import debug from 'debug';

export default class Logger {

    constructor(name) {
        this._debug = debug(name);
        this._warn = debug(name + ':WARN');
        this._error = debug(name + ':ERROR');
        this._debug.log = console.info.bind(console);
        this._warn.log = console.warn.bind(console);
        this._error.log = console.error.bind(console);
        this._debug.enabled = true;
        this._warn.enabled = true;
        this._error.enabled = true;
        // enable debug on all modules
        debug.enable(name);
    }

    get debug() {
        return this._debug;
    }

    get warn() {
        return this._warn;
    }

    get error() {
        return this._error;
    }
    
}
