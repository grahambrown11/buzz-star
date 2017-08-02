'use strict';

import debug from 'debug';
// enable debug on all modules
debug.enable('*');

const APP_NAME = 'ChromePhone';

export default class Logger {

    constructor() {
        this._debug = debug(APP_NAME);
        this._warn = debug(APP_NAME + ':WARN');
        this._error = debug(APP_NAME + ':ERROR');
        this._debug.log = console.info.bind(console);
        this._warn.log = console.warn.bind(console);
        this._error.log = console.error.bind(console);
        this._debug.enabled = true;
        this._warn.enabled = true;
        this._error.enabled = true;
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
