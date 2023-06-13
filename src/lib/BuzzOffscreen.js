'use strict';

import Logger from './Logger.js';
import RingTone from './RingTone.js';
import JsSIP from 'jssip';

function BuzzOffscreen() {

    this.version = "$$version$$";

    const logger = new Logger("BuzzOffscreen");
    logger.debug('BuzzOffscreen created, ver:' + this.version);

    let state = {
        previouslyLoggedIn: false,
        phoneNumber: '',
        dialedNumber: undefined,
        audioContext: new AudioContext(),
        audioOutput: new Audio(),
        servers: [],
        call: undefined,
        mute: false,
        hold: false,
        transferring: false,
        previousNumber: undefined,
        hijackLinks: false,
        externalAPIURL: undefined,
        externalAPIPort: [],
        infoMessage: '',
        fromExternal: false,
        audioInputs: [],
        audioInput: undefined,
        audioInputId: undefined,
        audioOutputs: [],
        audioOutputId: undefined,
        ringOutputId: undefined,
        incoming_server: undefined,
        incoming_answer: false,
        micAccess: false,
        optionsDoc: undefined,
        autoAnswer: false,
        callLog: undefined,
        lastDialedNumber: undefined,
        microphone: {
            source: undefined,
            destination: undefined,
            gain: undefined
        },
        meter: {
            input: {
                streamSource: undefined,
                processor: undefined,
                volume: 0,
                peak: 0,
                peakTime: undefined
            },
            output: {
                streamSource: undefined,
                processor: undefined,
                volume: 0,
                peak: 0,
                peakTime: undefined
            }
        },
        buzzLog: []
    };
    let tone = new RingTone(state.audioContext);
    let testTone = new RingTone(new AudioContext());

    this.init = function () {
        logger.debug('init - ' + window.buzzOffscreen.getUserAgent());
        buzzLog('Start - UserAgent: ' + window.buzzOffscreen.getUserAgent());

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (typeof request.action !== 'undefined') {
                switch (request.action) {
                    case 'check-mic':
                        logger.debug('onMessage, request: %o', request);
                        checkMic(true);
                        sendResponse(true);
                        break;
                    case 'ping':
                        logger.debug('onMessage, request: %o', request);
                        sendResponse({
                            action: 'pong',
                            version: window.buzzOffscreen.version
                        });
                        break;
                    case 'login':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.login(false);
                        break;
                    case 'logout':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.logout();
                        state.previouslyLoggedIn = false;
                        break;
                    case 'get-status':
                        logger.debug('onMessage, request: %o', request);
                        sendResponse(getStatus());
                        break;
                    case 'check-on-call':
                        logger.debug('onMessage, request: %o', request);
                        sendResponse(window.buzzOffscreen.isOnCall());
                        break;
                    case 'get-media':
                        logger.debug('onMessage, request: %o', request);
                        const media = getMedia()
                        media.ringTones = tone.getRingTones();
                        sendResponse(media);
                        break;
                    case 'test-media':
                        logger.debug('onMessage, request: %o', request);
                        if (request.data.action === 'play') {
                            window.buzzOffscreen.startPlaybackTest(request.data);
                        } else {
                            window.buzzOffscreen.stopPlaybackTest();
                        }
                        break;
                    case 'set-media':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.setAudioInput(request.audioInput);
                        window.buzzOffscreen.setAudioOutput(request.audioOutput);
                        break;
                    case 'load-options-from-api':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.loadSettingsFromExternalAPI();
                        break;
                    case 'store-options':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.updateOptions(request.data);
                        break;
                    case 'set-number':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.setPhoneNumber(request.data);
                        break;
                    case 'call':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.call(request.data);
                        break;
                    case 'hangup':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.hangup(false);
                        break;
                    case 'answer':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.answer();
                        break;
                    case 'silence':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.silence();
                        break;
                    case 'send-dtmf':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.sendDTMF(request.data);
                        break;
                    case 'mute':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.mute();
                        break;
                    case 'hold':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.hold();
                        break;
                    case 'transferring':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.transferring(request.data);
                        break;
                    case 'transfer':
                        logger.debug('onMessage, request: %o', request);
                        window.buzzOffscreen.transfer(request.data);
                        break;
                    case 'get-levels':
                        logger.debug('onMessage, request: %o', request);
                        sendResponse({
                            inputVolume: buzzOffscreen.getInputVolume(),
                            outputVolume: buzzOffscreen.getOutputVolume()
                        });
                        break;
                }
            }
        });

        chrome.runtime.onConnect.addListener(function (port) {
            logger.debug('onConnect, port: %o', port);
            if (typeof port.sender !== 'undefined' && state.externalAPIURL && state.externalAPIURL.test(port.sender.url)) {
                logger.debug('External API connection allowed');
                state.externalAPIPort.push(port);
                port.onMessage.addListener(function (msg) {
                    logger.debug('onMessage (Content Script): %o', msg);
                    if (msg === 'ping') {
                        port.postMessage('pong');
                    } else if (typeof msg.action !== 'undefined') {
                        switch (msg.action) {
                            case 'ping':
                                logger.debug('sending pong');
                                port.postMessage({
                                    action: 'pong',
                                    version: window.buzzOffscreen.version
                                });
                                break;
                            case 'login':
                                window.buzzOffscreen.login(true);
                                break;
                            case 'call':
                                window.buzzOffscreen.callNumber(msg.phoneNumber, true);
                                break;
                            case 'answer':
                                window.buzzOffscreen.answer();
                                break;
                            case 'hangup':
                                window.buzzOffscreen.hangup(true);
                                break;
                            case 'set-settings':
                                logger.debug('Got settings from External API');
                                chrome.runtime.sendMessage({
                                    action: 'populate-options',
                                    data: msg.settings
                                }).then();
                                break;
                            default:
                                logger.warn('unhandled action: %s', msg.action);
                        }
                    }
                });
                chrome.runtime.sendMessage({
                    action: 'external-api-change',
                    data: true
                }).then();
                port.onDisconnect.addListener(function (disconnectedPort) {
                    logger.debug('Runtime connection disconnected: %o', disconnectedPort);
                    let pos = state.externalAPIPort.indexOf(disconnectedPort);
                    if (pos >= 0) {
                        logger.debug('removed from externalAPIPort');
                        state.externalAPIPort.splice(pos, 1);
                        chrome.runtime.sendMessage({
                            action: 'external-api-change',
                            data: state.externalAPIPort.length > 0
                        }).then();
                    } else {
                        logger.debug('could not find externalAPIPort, %i', pos);
                    }
                });
            }
        });

        state.audioOutput.load();

        (async () => {
            const opts = await chrome.runtime.sendMessage({action: 'get-options'});
            window.buzzOffscreen.updateOptions(opts);
            // listen for media device changes
            navigator.mediaDevices.ondevicechange = function () {
                buzzLog('Media devices have changed');
                updateDeviceList();
            };
            checkMic(false);
            if (opts.sync_opts.start_popout) {
                await chrome.runtime.sendMessage({action: 'popout-window'});
            }
        })();
    };

    this.updateOptions = function (opts) {
        logger.debug('updateOptions(opts:%o)', opts);
        state.hijackLinks = opts.sync_opts.hijack_links;
        if (opts.sync_opts.external_api) {
            state.externalAPIURL = new RegExp(opts.sync_opts.external_api);
        }
        state.autoAnswer = opts.sync_opts.auto_answer;

        if (opts.local_opts) {
            if (opts.local_opts.media_input) {
                window.buzzOffscreen.setAudioInput(opts.local_opts.media_input);
            }
            if (opts.local_opts.media_output) {
                window.buzzOffscreen.setAudioOutput(opts.local_opts.media_output);
            }
            if (opts.local_opts.ring_output) {
                window.buzzOffscreen.setRingOutput(opts.local_opts.ring_output);
            }
            if (opts.local_opts.ring_tone) {
                tone.setRingTone(opts.local_opts.ring_tone);
            }
        }

        let createSipServers = false;
        let timeout = 50;
        if (state.servers.length > 0) {
            let server = serverFromOptions(opts.sync_opts.sip_1);
            if (server !== state.servers[0].sip_server ||
                opts.sync_opts.sip_1.extension !== state.servers[0].sip_extension ||
                opts.sync_opts.sip_1.password !== state.servers[0].sip_password) {
                createSipServers = true;
            }
            if (!createSipServers) {
                server = serverFromOptions(opts.sync_opts.sip_2);
                if (server.length > 0 && state.servers.length === 1) {
                    createSipServers = true;
                } else if (server.length === 0 && state.servers.length === 2) {
                    createSipServers = true;
                } else if (server.length > 0 && state.servers.length === 2 &&
                    (server !== state.servers[1].sip_server ||
                        opts.sync_opts.sip_2.extension !== state.servers[1].sip_extension ||
                        opts.sync_opts.sip_2.password !== state.servers[1].sip_password)) {
                    createSipServers = true;
                }
            }

            if (createSipServers) {
                buzzLog('Servers options changed...');
                logger.debug('servers changing, shutdown 1st');
                timeout = 2000;
                window.buzzOffscreen.shutdown();
            }
        } else {
            createSipServers = true;
        }

        if (createSipServers) {
            setTimeout(function () {
                let hasSettings = false;
                logger.debug('Init Server 1');
                if (createSipServer('Server 1', opts.sync_opts.sip_1)) {
                    hasSettings = true;
                } else {
                    logger.warn('Server 1 Missing settings');
                    buzzLog('Server 1 Missing settings');
                }
                logger.debug('Init Server 2');
                if (createSipServer('Server 2', opts.sync_opts.sip_2)) {
                    hasSettings = true;
                } else {
                    logger.debug('Server 2 Missing settings');
                    buzzLog('Server 1 Missing settings');
                }
                if (!hasSettings) {
                    logger.error('Missing settings');
                    buzzLog('Missing server settings');
                    updatePopupViewMessage('Missing settings', true, 5000);
                    return;
                }
                if (state.previouslyLoggedIn) {
                    window.buzzOffscreen.login(false);
                } else {
                    logger.debug('auto_login: %s', opts.sync_opts.auto_login);
                    if (opts.sync_opts.auto_login) {
                        buzzLog('Auto login enabled');
                        window.buzzOffscreen.login(false);
                    } else {
                        buzzLog('Auto login disabled');
                    }
                }
            }, timeout);
        }
    }


    function checkMic(fromPopup) {
        // check we have access to the microphone
        logger.debug('Checking Access to mic...');
        navigator.getUserMedia({audio: true}, function (stream) {
            logger.debug('... have access to mic');
            state.micAccess = true;
            stream.getAudioTracks()[0].stop();
            if (fromPopup) {
                buzzLog('Permission to mic granted');
            }
            if (state.audioInputs.length === 0) {
                updateDeviceList();
            }
        }, function (err) {
            checkMicError(err);
        });
    }

    function checkMicError(err) {
        logger.warn('Error: %s - %s', err.name, err.message);
        if (err.name === 'NotAllowedError' || err.name.toLowerCase().indexOf('media') >= 0) {
            buzzLog('Permission to mic not granted');
            state.micAccess = false;
            chrome.runtime.sendMessage({action: 'open-mic-permission'}).then();
        }
    }

    function getMicrophone(callback) {
        if (!state.microphone.destination) {
            state.microphone.destination = state.audioContext.createMediaStreamDestination();
        }
        let constraints = {
            audio: true
        }
        if (state.audioInput) {
            constraints.audio = {deviceId: {exact: state.audioInput}};
        }
        if (state.microphone.source) {
            state.microphone.source.mediaStream.getAudioTracks()[0].stop();
            state.microphone.source.disconnect();
        }
        navigator.getUserMedia(constraints, function (stream) {
            state.microphone.source = state.audioContext.createMediaStreamSource(stream);
            state.microphone.source.connect(state.microphone.destination);
            createMeter('input', state.microphone.source);
            callback(state.microphone.destination.stream);
        }, function (err) {
            checkMicError(err);
        });
    }

    function addCallLog(type, display, number) {
        state.callLog = {
            time: new Date().getTime(),
            type: type,
            success: false,
            display: display,
            number: number
        };
    }

    function updateLastCallLogToSuccessful() {
        if (state.callLog) {
            state.callLog.success = true;
            storeCallLog();
        }
    }

    function storeCallLog() {
        if (state.callLog) {
            chrome.runtime.sendMessage({
                action: 'add-call-log',
                data: state.callLog
            }).then(state.callLog = undefined);
        }
    }

    function incomingCall(data, server) {
        logger.debug('incoming call');
        let cli = 'Unknown';
        logger.debug('remote_identity: %o', data.session.remote_identity);
        let number = '';
        if (data.session.remote_identity.uri && data.session.remote_identity.uri.user) {
            cli = data.session.remote_identity.uri.user;
            number = data.session.remote_identity.uri.user;
        }
        if (data.session.remote_identity && data.session.remote_identity.display_name) {
            cli = data.session.remote_identity.display_name;
        }
        addCallLog('Incoming', cli, number);
        // Avoid if busy or other incoming
        if (window.buzzOffscreen.getStatus() === 'offhook') {
            logger.debug('status offhook: replied with 486 "Busy Here"');
            data.session.terminate({
                status_code: 486,
                reason_phrase: 'Busy Here'
            });
            storeCallLog();
            return;
        }

        // register session events
        state.call = data.session;
        state.call.on('peerconnection', function (e) {
            logger.debug('peerconnection: %o', e.peerconnection);
            e.peerconnection.addEventListener('addstream', function (event) {
                logger.debug('peerconnection addstream');
                setOutputStream(event.stream);
            });
        });
        state.call.on('failed', function (e) {
            logger.debug('failed');
            console.log(e);
            tone.stopPlayback();
            tone.boopBoop();
            onhook(server);
            storeCallLog();
        });
        state.call.on('ended', function (e) {
            logger.debug('ended');
            tone.stopPlayback();
            tone.boopBoop();
            onhook(server);
        });
        state.call.on('sdp', function (e) {
            logger.debug('sdp %o', e);
        });
        state.call.on('connecting', function (e) {
            logger.debug('connecting');
        });
        state.call.on('accepted', function (e) {
            logger.debug('accepted');
            tone.stopPlayback();
            tone.beep();
            updatePopupViewMessage('On Call: ' + cli, false, 0);
            state.incoming_answer = false;
            offhook(server, cli);
            updateLastCallLogToSuccessful();
        });
        state.call.on('hold', function (e) {
            logger.debug('hold');
            state.hold = true;
            updateStatus();
        });
        state.call.on('unhold', function (e) {
            logger.debug('unhold');
            state.hold = false;
            if (state.transferring) {
                state.transferring = false;
            }
            updateStatus();
        });
        state.call.on('muted', function (e) {
            logger.debug('muted');
            state.mute = true;
            updateStatus();
        });
        state.call.on('unmuted', function (e) {
            logger.debug('unmuted');
            state.mute = false;
            updateStatus();
        });
        state.call.on('reinvite', function (e) {
            logger.debug('reinvite: %o', e);
        });
        state.incoming_server = server;
        updatePopupViewMessage('Ringing: ' + cli, false, 0);
        state.incoming_answer = true;
        updateStatus();

        function startIncomingCallNotification() {
            showNotification('Incoming Call', cli, true);
            tone.startPlayback();
            if (state.autoAnswer) {
                function autoAnswerCall() {
                    setTimeout(function () {
                        if (state.call && !state.call.isEnded() && state.incoming_answer) {
                            logger.debug('Auto Answering...');
                            window.buzzOffscreen.answer();
                        } else {
                            logger.debug('Already Answered, ignoring');
                        }
                    }, 2000);
                }
                chrome.runtime.sendMessage({action: 'is-idle'}, (res) => {
                    if (!res) {
                        logger.debug('Not Idle or No Idle Permission, Auto Answer in 2 sec');
                        autoAnswerCall();
                    }
                });
            }
        }

        // get the sidebar to auto answer if the request was from there...
        if (state.externalAPIPort.length > 0) {
            sendExternal({
                action: 'incoming-call',
                cli: cli
            });
            setTimeout(function () {
                if (state.call && !state.call.isEnded() && !state.call.isEstablished()) {
                    startIncomingCallNotification();
                }
            }, 100);
        } else {
            startIncomingCallNotification();
        }
    }

    function setOutputStream(stream) {
        if (stream) {
            logger.debug('setOutputStream(%o)', stream);
            if (!state.audioOutput.paused) {
                logger.debug('audio already playing, pausing 1st');
                state.audioOutput.pause();
            }
            state.audioOutput.srcObject = stream;
            state.audioOutput.play();
            createMeter('output', state.audioContext.createMediaStreamSource(stream));
        }
    }

    function createMeter(type, streamSource) {
        state.meter[type].volume = 0;
        state.meter[type].peak = 0;
        state.meter[type].streamSource = streamSource;
        state.meter[type].processor = state.audioContext.createScriptProcessor(1024, 2, 2);
        state.meter[type].processor.onaudioprocess = function (event) {
            let sum = 0;
            let buf;
            buf = event.inputBuffer.getChannelData(0);
            for (let i = 0; i < buf.length; i++) {
                sum += buf[i] * buf[i];
            }
            let rms = Math.sqrt(sum / buf.length);
            // try get it to a percentage, not sure where the 1.4 comes in was from an example...
            let vol = Math.floor(rms * 100 * 1.4);
            if (vol > state.meter[type].peak) {
                state.meter[type].peakTime = window.performance.now();
                state.meter[type].peak = vol;
            } else if ((window.performance.now() - state.meter[type].peakTime) > 500) {
                state.meter[type].peakTime = window.performance.now();
                state.meter[type].peak = Math.max(vol, (state.meter[type].peak * 0.95));
            }
            state.meter[type].volume = vol;
        };
        state.meter[type].streamSource.connect(state.meter[type].processor);
        if (type === 'input') {
            state.meter[type].processor.connect(state.microphone.destination);
        } else {
            state.meter[type].processor.connect(state.audioContext.destination);
        }
    }

    function updatePopupViewMessage(message, error, timeout) {
        state.infoMessage = '';
        chrome.runtime.sendMessage({
            action: 'update-message',
            data: {
                message: message,
                error: error,
                timeout: timeout
            }
        }).then();
        if (!error && timeout === 0) {
            state.infoMessage = message;
        }
    }

    function updateStatus() {
        chrome.runtime.sendMessage({
            action: 'update-status',
            data: getStatus()
        }).then();
    }

    function showNotification(title, message, showAnswerButtons) {
        chrome.runtime.sendMessage({
            action: 'show-notification',
            data: {
                type: 'basic',
                title: title,
                message: message || '',
                iconUrl: 'img/icon-blue-128.png',
                buttons: showAnswerButtons ? [{title: 'Answer'}, {title: 'Reject'}] : [],
                requireInteraction: showAnswerButtons
            }
        }).then();
    }

    function onhook(server) {
        state.call = undefined;
        state.incoming_answer = false;
        state.hold = false;
        state.mute = false;
        state.phoneNumber = '';
        state.dialedNumber = '';
        state.fromExternal = false;
        state.audioOutput.pause();
        if (typeof server !== 'undefined' && typeof server.connection !== 'undefined') {
            server.connection.status = 'onhook';
        }
        updateStatus();
        updatePopupViewMessage(undefined, false, 0);
        sendExternal({action: 'call-ended'});
        if (state.microphone.source) {
            if (state.microphone.source.mediaStream) {
                state.microphone.source.mediaStream.getAudioTracks()[0].stop();
            }
            state.microphone.source.disconnect();
            state.microphone.source = undefined;
        }
        if (state.meter.input.processor) {
            state.meter.input.processor.disconnect();
            state.meter.input.processor = undefined;
        }
        if (state.meter.output.processor) {
            state.meter.output.processor.disconnect();
            state.meter.output.processor = undefined;
        }
        if (state.meter.output.streamSource) {
            state.meter.output.streamSource.disconnect();
            state.meter.output.streamSource = undefined;
        }
        state.meter.input.volume = 0;
        state.meter.input.peak = 0;
        state.meter.output.volume = 0;
        state.meter.output.peak = 0;
    }

    function offhook(server, cli) {
        if (typeof server !== 'undefined' && typeof server.connection !== 'undefined') {
            server.connection.status = 'offhook';
        }
        updateStatus();
        sendExternal({
            action: 'call-started',
            cli: cli
        });
    }

    function notifyExternal(msg) {
        if (state.fromExternal) {
            sendExternal(msg);
        }
    }

    function sendExternal(msg) {
        if (state.externalAPIPort.length > 0) {
            for (let p = 0; p < state.externalAPIPort.length; p++) {
                try {
                    state.externalAPIPort[p].postMessage(msg);
                } catch (err) {
                    logger.warn("Error posting to external API: %o", err);
                }
            }
        }
    }

    function showError(error) {
        updatePopupViewMessage(error, true, 5000);
    }

    function serverFromOptions(options) {
        if (typeof options === 'undefined' || typeof options.host === 'undefined' ||
            options.host.trim().length === 0) {
            return '';
        }
        let server = 'wss://' + options.host;
        if (options.port) {
            server += ':' + options.port;
        } else {
            server += ':8089';
        }
        if (options.path) {
            server += options.path;
        } else {
            server += '/ws';
        }
        return server;
    }

    this.getUserAgent = function () {
        if (!this._theUserAgent) {
            let agent = 'Buzz* ' + this.version + ' on ';
            logger.debug('Browser User Agent: %s', navigator.userAgent);
            if (/Windows/i.test(navigator.userAgent)) {
                agent += 'Windows';
            } else if (/Mac/i.test(navigator.userAgent)) {
                agent += 'Mac';
            } else if (/CrOS/i.test(navigator.userAgent)) {
                agent += 'ChromeOS';
            } else if (/Linux/i.test(navigator.userAgent)) {
                agent += 'Linux';
            } else {
                agent += 'Unknown OS';
            }
            agent += ' - ';
            if (/Edg/.test(navigator.userAgent)) {
                const browser = navigator.userAgent.match(/(Edg)\/(([0-9]+\.?)+)/);
                agent += browser[1] + '/' + browser[2];
            } else if (/Chrom(?:e|ium)/.test(navigator.userAgent)) {
                const browser = navigator.userAgent.match(/(Chrom(?:e|ium))\/(([0-9]+\.?)+)/);
                agent += browser[1] + '/' + browser[2];
            } else {
                agent += 'Unknown Browser';
            }
            this._theUserAgent = agent;
        }
        return this._theUserAgent;
    }

    function createSipServer(name, options) {
        let server = serverFromOptions(options);
        if (server.length === 0 || typeof options.extension === 'undefined' || options.extension.trim().length === 0) {
            return false;
        }
        let cnf = {
            sip_server: server,
            sip_server_host: options.host,
            sip_extension: options.extension,
            sip_password: options.password,
            sip_user: 'sip:' + options.extension + '@' + options.host,
            pcConfig: {
                rtcpMuxPolicy: 'negotiate',
                iceServers: []
            },
            connection: {
                /** @type WebSocketInterface */
                socket: undefined,
                /** @type UA */
                jssip: undefined,
                loggedIn: false,
                status: 'offline'
            }
        };
        if (options.ice) {
            let servers = options.ice.split(',');
            for (let i = 0; i < servers.length; i++) {
                cnf.pcConfig.iceServers.push({urls: [servers[i]]});
            }
        }
        cnf.connection.socket = new JsSIP.WebSocketInterface(cnf.sip_server);
        let configuration = {
            sockets: [cnf.connection.socket],
            uri: cnf.sip_user,
            display_name: cnf.sip_extension,
            authorization_user: cnf.sip_extension,
            password: cnf.sip_password,
            register: true,
            registrar_server: 'sip:' + cnf.sip_server_host,
            session_timers: true,
            user_agent: window.buzzOffscreen.getUserAgent(),
            connection_recovery_min_interval: 5,
            connection_recovery_max_interval: 60
        };
        logger.debug('JsSIP config: %o', configuration);
        cnf.connection.jssip = new JsSIP.UA(configuration);
        cnf.connection.jssip.on('connecting', function () {
            logger.debug(name + ' connecting to ' + cnf.sip_server);
            buzzLog(name + ' connecting to ' + cnf.sip_server);
            updatePopupViewMessage('Connecting to server ...', false, 0);
        });
        cnf.connection.jssip.on('connected', function () {
            logger.debug(name + ' connected to ' + cnf.sip_server);
            buzzLog(name + ' connected to ' + cnf.sip_server);
        });
        cnf.connection.jssip.on('disconnected', function () {
            logger.debug(name + ' disconnected from ' + cnf.sip_server);
            buzzLog(name + ' disconnected from ' + cnf.sip_server);
            cnf.connection.status = 'offline';
            cnf.connection.loggedIn = false;
            updateStatus();
            updatePopupViewMessage('Disconnected from server', true, 5000);
        });
        cnf.connection.jssip.on('registered', function () {
            logger.debug(name + ' registered ' + cnf.sip_user);
            buzzLog(name + ' registered ' + cnf.sip_user + ' on ' + cnf.sip_server);
            state.previouslyLoggedIn = true;
            cnf.connection.loggedIn = true;
            cnf.connection.status = 'onhook';
            updatePopupViewMessage('Connected to server', false, 5000);
            updateStatus();
        });
        cnf.connection.jssip.on('unregistered', function () {
            logger.debug(name + 'unregistered ' + cnf.sip_user);
            buzzLog(name + ' unregistered ' + cnf.sip_user + ' on ' + cnf.sip_server);
            cnf.connection.loggedIn = false;
            updateStatus();
            showError('No longer registered - incoming calls will fail');
        });
        cnf.connection.jssip.on('registrationFailed', function (e) {
            logger.debug(name + 'registrationFailed on ' + cnf.sip_user);
            buzzLog(name + ' register of ' + cnf.sip_user + ' failed on ' + cnf.sip_server + ' - ' + e.cause);
            cnf.connection.loggedIn = false;
            updateStatus();
            updatePopupViewMessage('Registration Failed: ' + e.cause, true);
            showError('Registration Failed: ' + e.cause);
        });
        cnf.connection.jssip.on('newRTCSession', function (data) {
            // ignore our sessions (outgoing calls)
            if (data.originator === 'local')
                return;
            logger.debug('newRTCSession from ' + cnf.sip_server_host);
            incomingCall(data, cnf);
        });
        cnf.connection.jssip.on('newMessage', function (data) {
            logger.debug('newMessage from ' + cnf.sip_server_host, data);
        });
        // NOTE: skipping registrationExpiring event so JsSIP handles re-register
        logger.debug('jssip created for ' + cnf.sip_server_host);
        state.servers.push(cnf);
        return true;
    }

    this.shutdown = function () {
        logger.debug('shutdown');
        this.logout();
        state.servers = [];
    };

    function getStatus() {
        return {
            status: window.buzzOffscreen.getStatus(),
            isLoggedIn: window.buzzOffscreen.isLoggedIn(),
            canLogin: state.servers.length > 0,
            hasMicAccess: state.micAccess,
            servers: window.buzzOffscreen.getServers(),
            phoneNumber: state.phoneNumber,
            dialedNumber: state.dialedNumber,
            externalAPI: state.externalAPIPort.length > 0,
            infoMessage: state.infoMessage,
            isOnHold: state.hold,
            isOnMute: state.mute,
            transferring: state.transferring
        };
    }

    function updateDeviceList() {
        logger.debug('updateDeviceList()');
        if (state.micAccess) {
            navigator.mediaDevices.enumerateDevices().then(function (devices) {
                let audioInputs = [];
                let audioOutputs = [];
                let audioInput, audioOutput, ringOutput;
                for (let i = 0; i !== devices.length; ++i) {
                    logger.debug('media device %s: %o', i, devices[i]);
                    if (devices[i].kind === 'audioinput') {
                        audioInputs.push({
                            id: devices[i].deviceId,
                            name: devices[i].deviceId === 'default' ? 'Default' : (devices[i].label || 'microphone ' + (audioInputs.length + 1))
                        });
                        if (state.audioInputId === devices[i].deviceId) audioInput = devices[i].deviceId;
                    } else if (devices[i].kind === 'audiooutput') {
                        audioOutputs.push({
                            id: devices[i].deviceId,
                            name: devices[i].deviceId === 'default' ? 'Default' : (devices[i].label || 'speaker ' + (audioOutputs.length + 1))
                        });
                        if (state.audioOutputId === devices[i].deviceId) audioOutput = devices[i].deviceId;
                        if (state.ringOutputId === devices[i].deviceId) ringOutput = devices[i].deviceId;
                    }
                }
                state.audioInputs = audioInputs;
                state.audioOutputs = audioOutputs;
                window.buzzOffscreen.setAudioInput(audioInput);
                window.buzzOffscreen.setAudioOutput(audioOutput);
                window.buzzOffscreen.setRingOutput(ringOutput);
                chrome.runtime.sendMessage({
                    action: 'update-media',
                    data: getMedia()
                }).then();
            });
        } else {
            logger.warn('no mic access...');
            chrome.runtime.sendMessage({
                action: 'update-media',
                data: {
                    hasMicAccess: state.micAccess,
                }
            }).then();
        }
    }

    function getMedia() {
        return {
            hasMicAccess: state.micAccess,
            audioInputs: state.audioInputs,
            currentAudioInputId: state.audioInputId,
            audioOutputs: state.audioOutputs,
            currentAudioOutputId: state.audioOutputId,
            currentRingOutputId: state.ringOutputId,
        }
    }

    this.login = function (external) {
        logger.debug('login(external:%s)', external);
        state.fromExternal = external;
        for (let srv = 0; srv < state.servers.length; srv++) {
            if (state.servers[srv].connection.jssip && state.servers[srv].connection.jssip.isConnected() && !external) {
                logger.debug('jssip already connected to %s, stopping 1st ...', state.servers[srv].sip_server);
                state.servers[srv].connection.jssip.stop();
            }
            state.servers[srv].connection.jssip.start();
        }
        if (state.servers.length === 0) {
            notifyExternal({action: 'error', error: 'No servers setup'});
        }
    };

    this.logout = function () {
        logger.debug('logout()');
        for (let srv = 0; srv < state.servers.length; srv++) {
            if (state.servers[srv].connection.jssip) {
                state.servers[srv].connection.jssip.stop();
            } else {
                state.servers[srv].connection.loggedIn = false;
                state.servers[srv].connection.status = 'offline';
            }
        }
    };

    this.call = function (serverIdx) {
        this.callNumber(state.phoneNumber, false, serverIdx);
    };

    this.callNumber = function (phoneNumber, external, serverIdx) {
        logger.debug('callNumber - ' + phoneNumber);
        if (this.isOnCall()) {
            logger.warn('on a call - ignoring');
            return;
        }
        state.fromExternal = external;
        logger.debug('fromExternal - ' + external);
        if (!phoneNumber) {
            logger.warn('No Phone Number');
            updatePopupViewMessage('No Phone Number', true, 3000);
            notifyExternal({action: 'error', error: 'No Phone Number'});
            return;
        }
        if (state.servers.length === 0) {
            logger.warn('No servers setup');
            notifyExternal({action: 'error', error: 'No servers setup'});
            return;
        }
        if (typeof serverIdx === 'undefined') {
            serverIdx = 0;
        } else {
            serverIdx = parseInt(serverIdx);
            if (isNaN(serverIdx) || state.servers.length < (serverIdx + 1)) {
                logger.warn('Requested server not configured, using server 1');
                serverIdx = 0;
            }
        }
        let server = state.servers[serverIdx];
        logger.debug('using server ' + (serverIdx + 1));
        if (!server.connection.loggedIn && state.servers.length > 1) {
            serverIdx = serverIdx === 1 ? 0 : 1;
            logger.debug('Not logged in, using server ' + (serverIdx + 1));
            server = state.servers[serverIdx];
        }
        if (external && !server.connection.loggedIn) {
            notifyExternal({action: 'error', error: 'Not Logged In'});
            return;
        }
        // call events
        let eventHandlers = {
            peerconnection: function (data) {
                logger.debug('call peer connection %o', data.peerconnection);
                data.peerconnection.addEventListener('addstream', function (event) {
                    logger.debug('call addstream');
                    setOutputStream(event.stream);
                });
            },
            connecting: function (data) {
                logger.debug('call connecting');
                server.connection.status = 'offhook';
            },
            progress: function (data) {
                logger.debug('call progress');
                tone.startRinging();
            },
            failed: function (data) {
                logger.debug('call failed: %o', data);
                tone.stopRinging();
                tone.boopBoop();
                let errorMessage = 'Call Failed: ' + data.cause;
                if (data.cause === 'SIP Failure Code') {
                    errorMessage += ' - ' + data.message.status_code + ':' + data.message.reason_phrase;
                }
                updatePopupViewMessage(errorMessage, true, 5000);
                onhook(server);
                notifyExternal({action: 'error', error: errorMessage});
                storeCallLog();
            },
            ended: function (data) {
                logger.debug('call ended');
                tone.boopBoop();
                onhook(server);
                storeCallLog();
            },
            confirmed: function (data) {
                logger.debug('call confirmed');
                tone.stopRinging();
                tone.beep();
                updatePopupViewMessage('On Call to ' + state.dialedNumber, false, 0);
                updateLastCallLogToSuccessful();
            },
            hold: function (data) {
                logger.debug('hold');
                state.hold = true;
                updateStatus();
            },
            unhold: function (data) {
                logger.debug('unhold');
                state.hold = false;
                if (state.transferring) {
                    state.transferring = false;
                }
                updateStatus();
            },
            muted: function (data) {
                logger.debug('muted');
                state.mute = true;
                updateStatus();
            },
            unmuted: function (data) {
                logger.debug('unmuted');
                state.mute = false;
                updateStatus();
            },
            getusermediafailed: function (data) {
                logger.debug('getusermediafailed: %o', data);
                window.buzzOffscreen.hangup(false);
                checkMicError(data);
            }
        };
        state.dialedNumber = phoneNumber;
        getMicrophone(function (stream) {
            let options = getConnectionOptions(server, eventHandlers);
            delete options.mediaConstraints;
            options.mediaStream = stream;
            let callUri = 'sip:' + state.dialedNumber + '@' + server.sip_server_host;
            updatePopupViewMessage('Calling ' + state.dialedNumber + ' ...', false, 0);
            logger.debug('calling: %s', callUri);
            state.call = server.connection.jssip.call(callUri, options);
            addCallLog('Outgoing', state.dialedNumber, state.dialedNumber);
            offhook(server, state.dialedNumber);
        });
    };

    function getConnectionOptions(server, eventHandlers) {
        let opts = {
            mediaConstraints: {
                audio: true,
                video: false
            },
            rtcOfferConstraints: {
                offerToReceiveAudio: 1,
                offerToReceiveVideo: 0
            },
            rtcAnswerConstraints: {
                offerToReceiveAudio: 1,
                offerToReceiveVideo: 0
            }
        };
        if (typeof server !== 'undefined' && typeof server.pcConfig !== 'undefined') {
            opts.pcConfig = server.pcConfig;
        }
        if (state.audioInput) {
            // although the JsSIP definition is boolean it hands it to the browser getUserMedia which
            // has Boolean or MediaTrackConstraints https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamConstraints
            opts.mediaConstraints.audio = {deviceId: {exact: state.audioInput}};
        }
        if (eventHandlers) {
            opts.eventHandlers = eventHandlers;
        }
        return opts;
    }

    this.answer = function () {
        if (state.call) {
            tone.stopPlayback();
            state.call.answer(getConnectionOptions(state.incoming_server));
        }
        state.incoming_answer = false;
        state.incoming_server = undefined;
    };

    this.hangup = function (external) {
        state.fromExternal = external;
        state.incoming_answer = false;
        state.incoming_server = undefined;
        if (state.call) {
            state.call.terminate();
            // fallback to clear some state if the end event not fired...
            setTimeout(function () {
                if (state.call) {
                    onhook(undefined);
                }
            }, 150);
        }
    };

    this.mute = function () {
        if (state.call) {
            if (state.mute) {
                state.call.unmute();
            } else {
                state.call.mute();
            }
        }
    };

    this.hold = function () {
        if (state.call) {
            if (state.hold) {
                state.call.unhold();
            } else {
                state.call.hold();
            }
        }
    };

    this.getPhoneNumber = function () {
        return state.phoneNumber;
    };

    this.setPhoneNumber = function (number) {
        state.phoneNumber = number.replace(/[^\d\*\#]/g, '');
        return state.phoneNumber;
    };

    this.getStatus = function () {
        if (state.call) {
            if (state.incoming_answer) {
                return 'ringing';
            }
            return 'offhook';
        }
        if (state.servers.length > 0) {
            if (state.servers.length > 1) {
                if (state.servers[0].connection.status === 'offline' && state.servers[1].connection.status === 'offline') {
                    // both servers are offline
                    return 'offline';
                }
                if (state.servers[0].connection.status === 'offhook' || state.servers[1].connection.status === 'offhook') {
                    // 1 of the connections is offhook (on an call...)
                    return 'offhook';
                }
            }
            return state.servers[0].connection.status;
        }
        return 'offline';
    };

    this.getServers = function () {
        let servers = [];
        for (let i=0; i < state.servers.length; i++) {
            let serverStatus = {
                server: state.servers[i].sip_server,
                connection: 'offline',
                status: undefined
            };
            if (state.servers[i].connection.status !== 'offline' && state.servers[i].connection.loggedIn) {
                serverStatus.connection = 'online';
                serverStatus.status = state.servers[i].connection.status;
            }
            servers.push(serverStatus);
        }
        return servers;
    }

    this.isLoggedIn = function () {
        if (state.servers.length === 0) return false;
        if (state.servers[0].connection.loggedIn) return true;
        return state.servers.length > 1 && state.servers[1].connection.loggedIn;
    };

    this.sendDTMF = function (value) {
        if (state.call) {
            state.call.sendDTMF(value);
        }
    };

    this.isOnCall = function () {
        return !!state.call;
    };

    this.getAudioInputs = function () {
        return state.audioInputs;
    };

    this.setAudioInput = function (deviceId) {
        if (deviceId) {
            state.audioInputId = deviceId;
            for (let i = 0; i < state.audioInputs.length; i++) {
                if (deviceId === state.audioInputs[i].id) {
                    state.audioInput = deviceId;
                    logger.debug('set audio input to %s', state.audioInput);
                    if (state.microphone.source) {
                        getMicrophone(function (stream) {
                            logger.debug('changed input source');
                        });
                    }
                    return;
                }
            }
        }
        logger.debug('default audio input');
        state.audioInput = undefined;
    };

    this.setAudioOutput = function (deviceId) {
        if (deviceId) {
            state.audioOutputId = deviceId;
            for (let i = 0; i < state.audioOutputs.length; i++) {
                if (deviceId === state.audioOutputs[i].id) {
                    state.audioOutput.setSinkId(deviceId);
                    tone.audioSinkId = deviceId;
                    logger.debug('set audio output to %s', deviceId);
                    return;
                }
            }
        }
        logger.debug('default audio output');
        state.audioOutput.setSinkId('default');
        tone.audioSinkId = 'default';
    };

    this.setRingOutput = function (deviceId) {
        if (deviceId) {
            state.ringOutputId = deviceId;
        }
        let speakers = 'default';
        for (let i = 0; i < state.audioOutputs.length; i++) {
            if (deviceId !== 'default' && deviceId === state.audioOutputs[i].id) {
                tone.ringSinkId = deviceId;
                logger.debug('set ring output to %s', deviceId);
                return;
            } else if (state.audioOutputs[i].name.toLowerCase().indexOf('speaker') >= 0) {
                speakers = state.audioOutputs[i].id;
            }
        }
        logger.debug('default ring output to speaker %s', speakers);
        tone.ringSinkId = speakers;
    };

    this.loadSettingsFromExternalAPI = function (optionsDoc) {
        if (state.externalAPIPort.length > 0) {
            logger.debug('Request settings from external API Port');
            state.optionsDoc = optionsDoc;
            // get the settings from the last connection
            state.externalAPIPort[state.externalAPIPort.length - 1].postMessage({action: 'get-settings'});
        } else {
            logger.warn('No external API Port, cannot request settings');
        }
    };

    this.startPlaybackTest = function (data) {
        if (!data.audioDeviceId) data.audioDeviceId = 'default';
        testTone.audioSinkId = data.audioDeviceId;
        if (!data.ringDeviceId) data.ringDeviceId = 'default';
        testTone.ringSinkId = data.ringDeviceId;
        setTimeout(function () {
            if (data.ringtone === -1) {
                testTone.startRinging();
            } else {
                testTone.setRingTone(data.ringtone, () => testTone.startPlayback());
            }
        }, 100);
    };

    this.stopPlaybackTest = function () {
        testTone.stopPlayback();
        testTone.stopRinging();
    };

    this.transferring = function (transferring) {
        if (!this.isOnCall()) return;
        state.transferring = transferring;
        if (transferring) {
            state.previousNumber = state.phoneNumber;
            state.phoneNumber = '';
        } else {
            state.phoneNumber = state.previousNumber;
            state.previousNumber = undefined;
        }
        if (state.transferring && !state.hold) {
            logger.debug('hold call, starting transfer');
            this.hold();
        } else if (!state.transferring && state.hold) {
            logger.debug('unhold call, cancelling transfer');
            this.hold();
        }
    }

    this.transfer = function (number) {
        if (!this.isOnCall()) return;
        if (!number) {
            logger.warn('No Phone Number for transfer');
            updatePopupViewMessage('No Phone Number', true, 3000);
            return;
        }
        state.transferring = false;
        let eventHandlers = {
            requestFailed: function (e) {
                logger.debug('tx req failed: ' + e.cause);
                tone.beep();
                updatePopupViewMessage(e.cause, true, 5000);
            },
            accepted: function (e) {
                logger.debug('tx accepted');
                window.buzzOffscreen.hangup(false);
                updatePopupViewMessage('Call transferred', false, 2000);
            },
            failed: function (e) {
                logger.debug('tx failed: ' + e.status_line.reason_phrase);
                window.buzzOffscreen.hangup(false);
                tone.beep();
                updatePopupViewMessage(e.status_line.reason_phrase, true, 5000);
            },
        };
        state.call.refer(number, {eventHandlers: eventHandlers});
    }

    this.silence = function () {
        tone.stopPlayback();
    }

    this.debugJsSIP = function (on) {
        if (on) {
            JsSIP.debug.enable('JsSIP:*,BuzzOffscreen');
        } else {
            JsSIP.debug.disable();
            JsSIP.debug.enable('BuzzOffscreen');
        }
    }

    this.getLastDialedNumber = function () {
        return state.lastDialedNumber;
    }

    this.getInputVolume = function () {
        if (state.call) {
            return [state.meter.input.volume, state.meter.input.peak];
        }
        return [0, 0];
    }

    this.getOutputVolume = function () {
        if (state.call) {
            return [state.meter.output.volume, state.meter.output.peak];
        }
        return [0, 0];
    }

    function buzzLog(message) {
        chrome.runtime.sendMessage({
            action: 'add-log',
            data: message
        }).then();
    }

}

window.buzzOffscreen = new BuzzOffscreen();
window.buzzOffscreen.init();

