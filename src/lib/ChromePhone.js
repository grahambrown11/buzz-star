'use strict';

import Logger from './Logger.js';
import Tone from './Tone.js';
import JsSIP from 'jssip';

function ChromePhone() {

    this.version = "$$version$$";

    let logger = new Logger();
    logger.debug('ChromePhone created, ver:' + this.version);

    let state = {
        previouslyLoggedIn: false,
        phoneNumber: '',
        dialedNumber: undefined,
        audioContext: new AudioContext(),
        audioOutput: new Audio(),
        notificationId: undefined,
        servers: [],
        call: undefined,
        mute: false,
        hold: false,
        hijackLinks: false,
        externalAPIURL: undefined,
        externalAPIPort: [],
        errorMessage: undefined,
        errorTimeout: undefined,
        infoMessage: undefined,
        fromExternal: false,
        audioInputs: [],
        audioInput: undefined,
        audioInputId: undefined,
        audioOutputs: [],
        audioOutputId: undefined,
        ringOutputId: undefined,
        incoming_pcConfig: undefined,
        incoming_answer: false,
        micAccess: false,
        optionsDoc: undefined,
        autoAnswer: false,
        broadcast: new BroadcastChannel('buzz_bus'),
        popoutWindowId: undefined,
        callLog: [],
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
    let tone = new Tone(state.audioContext);
    let testTone = new Tone(new AudioContext());

    function checkMic() {
        // check we have access to the microphone
        logger.debug('Checking Access to mic...');
        navigator.getUserMedia({audio: true}, function (stream) {
            logger.debug('... have access to mic');
            state.micAccess = true;
            stream.getAudioTracks()[0].stop();
            if (state.audioInputs.length === 0) {
                updateDeviceList();
            }
        }, function (err) {
            checkMicError(err);
        });
    }

    function checkMicError(err) {
        logger.warn('Error: %s - %s', err.name, err.message);
        if ('chrome' in window && chrome.extension && (err.name === 'NotAllowedError' || err.name.toLowerCase().indexOf('media') >= 0)) {
            buzzLog('Permission to mic not granted');
            state.micAccess = false;
            window.open(chrome.extension.getURL('microphone.html'), 'mic_popup', 'width=500,height=300,status=no,scrollbars=no,resizable=no');
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
        state.callLog.unshift(
            {time: new Date().getTime(), type: type, success: false, display: display, number: number}
        );
        // for now limiting the list to 20
        if (state.callLog.length > 20) {
            state.callLog.pop();
        }
        if (type === 'Outgoing') {
            state.lastDialedNumber = number;
            if ('chrome' in window) {
                chrome.storage.local.set({last_dialed_number: state.lastDialedNumber});
            }
        }
    }

    function updateLastCallLogToSuccessful() {
        state.callLog[0].success = true;
        storeCallLog();
    }

    function storeCallLog() {
        if ('chrome' in window) {
            chrome.storage.local.set({call_log: state.callLog});
        }
    }

    function incomingCall(data, cnf) {
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
        if (window.chromePhone.getStatus() === 'offhook') {
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
            state.incoming_answer = false;
            state.call = undefined;
            cnf.connection.status = 'onhook';
            onhook();
            storeCallLog();
        });
        state.call.on('ended', function (e) {
            logger.debug('ended');
            tone.stopPlayback();
            tone.boopBoop();
            state.incoming_answer = false;
            state.call = undefined;
            cnf.connection.status = 'onhook';
            onhook();
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
            state.infoMessage = 'On Call: ' + cli;
            state.incoming_answer = false;
            cnf.connection.status = 'offhook';
            offhook();
            updateLastCallLogToSuccessful();
        });
        state.call.on('hold', function (e) {
            logger.debug('hold');
            state.hold = true;
            updatePopupHold();
        });
        state.call.on('unhold', function (e) {
            logger.debug('unhold');
            state.hold = false;
            updatePopupHold();
        });
        state.call.on('muted', function (e) {
            logger.debug('muted');
            state.mute = true;
            updatePopupMute();
        });
        state.call.on('unmuted', function (e) {
            logger.debug('unmuted');
            state.mute = false;
            updatePopupMute();
        });
        state.call.on('reinvite', function (e) {
            logger.debug('reinvite: %o', e);
        });
        state.incoming_pcConfig = cnf.pcConfig;
        state.infoMessage = 'Ringing: ' + cli;
        state.incoming_answer = true;
        updateOverallStatus();

        function startIncomingCallNotification() {
            showNotification('Incoming Call', cli, true);
            tone.startPlayback();
            if (state.autoAnswer) {
                function autoAnswerCall() {
                    setTimeout(function () {
                        if (state.call && !state.call.isEnded() && state.incoming_answer) {
                            logger.debug('Auto Answering...');
                            window.chromePhone.answer();
                        } else {
                            logger.debug('Already Answered, ignoring');
                        }
                    }, 2000);
                }

                if ('chrome' in window) {
                    chrome.permissions.contains({permissions: ['idle']}, function (hasIdleAccess) {
                        if (hasIdleAccess) {
                            logger.debug('Has Idle Permission, checking state...');
                            chrome.idle.queryState((15 * 60), function (idleState) {
                                logger.debug('IdleState: %o', idleState);
                                if (idleState === 'active') {
                                    logger.debug('Not Idle, Auto Answer in 2 sec');
                                    autoAnswerCall();
                                }
                            });
                        } else {
                            logger.warn('No Idle Permission');
                            autoAnswerCall();
                        }
                    });

                } else {
                    autoAnswerCall();
                }
            }
        }

        // get the sidebar to auto answer if the request was from there...
        if (state.externalAPIPort.length > 0) {
            for (let p = 0; p < state.externalAPIPort.length; p++) {
                try {
                    state.externalAPIPort[p].postMessage({action: 'incoming-call', cli: cli});
                } catch (err) {
                    logger.warn("Error posting to external API: %o", err);
                }
            }
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

    function updatePopupViewMessages() {
        if (state.broadcast) {
            state.broadcast.postMessage({action: 'updateMessages'});
        } else if ('uiUpdateMessages' in window) {
            uiUpdateMessages();
        }
    }

    function updatePopupViewStatus() {
        if (state.broadcast) {
            state.broadcast.postMessage({action: 'updateStatus'});
        } else if ('uiUpdateStatus' in window) {
            uiUpdateStatus();
        }
    }

    function showNotification(title, message, showAnswerButtons) {
        if ('chrome' in window && chrome.notifications) {
            chrome.notifications.create(state.notificationId, {
                type: 'basic',
                title: title,
                message: message || '',
                iconUrl: 'img/icon-blue-128.png',
                buttons: showAnswerButtons ? [{title: 'Answer'}, {title: 'Reject'}] : [],
                requireInteraction: showAnswerButtons
            }, function (id) {
                state.notificationId = id;
            });
        }
    }

    function clearNotification() {
        if (state.notificationId) {
            chrome.notifications.clear(state.notificationId);
            state.notificationId = undefined;
        }
    }

    function onhook() {
        state.infoMessage = undefined;
        state.hold = false;
        state.mute = false;
        state.phoneNumber = '';
        state.dialedNumber = '';
        state.fromExternal = false;
        state.audioOutput.pause();
        updateOverallStatus();
        clearNotification();
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

    function offhook() {
        updateOverallStatus();
        clearNotification();
    }

    function notifyExternalOfError() {
        notifyExternal({action: 'error', error: state.errorMessage});
    }

    function notifyExternal(msg) {
        if (state.fromExternal && state.externalAPIPort.length > 0) {
            for (let p = 0; p < state.externalAPIPort.length; p++) {
                state.externalAPIPort[p].postMessage(msg);
            }
        }
    }

    function showError(error) {
        if (state.errorTimeout) {
            clearTimeout(state.errorTimeout);
        }
        state.errorMessage = error;
        updatePopupViewMessages();
        state.errorTimeout = setTimeout(function () {
            state.errorMessage = undefined;
            updatePopupViewMessages();
        }, 5000);
    }

    function updatePopupMute() {
        if (state.broadcast) {
            state.broadcast.postMessage({action: 'updateMute'});
        } else if ('uiUpdateMute' in window) {
            uiUpdateMute();
        }
    }

    function updatePopupHold() {
        if (state.broadcast) {
            state.broadcast.postMessage({action: 'updateHold'});
        } else if ('uiUpdateHold' in window) {
            uiUpdateHold();
        }
    }

    function getIcons(color) {
        return {
            '16': 'img/icon-' + color + '-16.png',
            '32': 'img/icon-' + color + '-32.png',
            '48': 'img/icon-' + color + '-48.png',
            '128': 'img/icon-' + color + '-128.png'
        };
    }

    function updateOverallStatus() {
        let status = window.chromePhone.getStatus();
        let icon = getIcons('blue');
        if (status === 'offhook' || status === 'ringing') {
            icon = getIcons('red');
        } else if (status === 'onhook') {
            icon = getIcons('green');
        }
        if ('chrome' in window && chrome.browserAction) {
            chrome.browserAction.setIcon({path: icon});
        }
        updatePopupViewStatus();
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
            user_agent: window.chromePhone.getUserAgent(),
            connection_recovery_min_interval: 5,
            connection_recovery_max_interval: 60
        };
        logger.debug('JsSIP config: %o', configuration);
        cnf.connection.jssip = new JsSIP.UA(configuration);
        cnf.connection.jssip.on('connecting', function () {
            logger.debug(name + ' connecting to ' + cnf.sip_server);
            buzzLog(name + ' connecting to ' + cnf.sip_server);
            state.errorMessage = undefined;
            state.infoMessage = 'Connecting to server ...';
            updatePopupViewStatus();
        });
        cnf.connection.jssip.on('connected', function () {
            logger.debug(name + ' connected to ' + cnf.sip_server);
            buzzLog(name + ' connected to ' + cnf.sip_server);
            state.errorMessage = undefined;
            state.infoMessage = 'Connected to server';
            updatePopupViewStatus();
            setTimeout(function () {
                state.infoMessage = undefined;
                state.errorMessage = undefined;
                updatePopupViewStatus();
            }, 3000);
        });
        cnf.connection.jssip.on('disconnected', function () {
            logger.debug(name + ' disconnected from ' + cnf.sip_server);
            buzzLog(name + ' disconnected from ' + cnf.sip_server);
            cnf.connection.status = 'offline';
            cnf.connection.loggedIn = false;
            state.infoMessage = undefined;
            updateOverallStatus();
            showError('Disconnected from server');
        });
        cnf.connection.jssip.on('registered', function () {
            logger.debug(name + ' registered ' + cnf.sip_user);
            buzzLog(name + ' registered ' + cnf.sip_user + ' on ' + cnf.sip_server);
            cnf.connection.loggedIn = true;
            cnf.connection.status = 'onhook';
            state.infoMessage = undefined;
            updateOverallStatus();
        });
        cnf.connection.jssip.on('unregistered', function () {
            logger.debug(name + 'unregistered ' + cnf.sip_user);
            buzzLog(name + ' unregistered ' + cnf.sip_user + ' on ' + cnf.sip_server);
            cnf.connection.loggedIn = false;
            state.infoMessage = undefined;
            updatePopupViewStatus();
            showError('No longer registered - incoming calls will fail');
        });
        cnf.connection.jssip.on('registrationFailed', function (e) {
            logger.debug(name + 'registrationFailed on ' + cnf.sip_user);
            buzzLog(name + ' register of ' + cnf.sip_user + ' failed on ' + cnf.sip_server + ' - ' + e.cause);
            cnf.connection.loggedIn = false;
            state.infoMessage = undefined;
            updatePopupViewStatus();
            showError('Registration Failed: ' + e.cause);
        });
        cnf.connection.jssip.on('newRTCSession', function (data) {
            // ignore our sessions (outgoing calls)
            if (data.originator === 'local')
                return;
            logger.debug('newRTCSession from ' + cnf.sip_server_host);
            incomingCall(data, cnf.pcConfig);
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

    function checkExternalAPIURL(url) {
        if (typeof state.externalAPIURL !== 'undefined' && typeof url !== 'undefined') {
            return state.externalAPIURL.test(url);
        }
        return false;
    }

    this.init = function (sync_opts, local_opts) {
        logger.debug('init');
        logger.debug(this.getUserAgent());
        if ('chrome' in window && window.chrome.extension) {
            logger.debug('Is a chrome extension');
            buzzLog('Start - UserAgent: ' + this.getUserAgent());

            chrome.browserAction.setIcon({path: getIcons('blue')});

            // listen for media device changes
            navigator.mediaDevices.ondevicechange = function () {
                buzzLog('Media devices have changed');
                updateDeviceList();
            };
            checkMic();

            chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
                if (typeof request.action !== 'undefined') {
                    if (request.action === 'check-mic') {
                        checkMic();
                    } else if (request.action === 'inject') {
                        var api_allowed = false;
                        if (typeof sender !== 'undefined') {
                            api_allowed = checkExternalAPIURL(sender.url);
                        }
                        sendResponse({
                            api_allowed: api_allowed,
                            tel_links: state.hijackLinks
                        });
                    } else if (request.action === 'ping') {
                        sendResponse({
                            action: 'pong',
                            version: window.chromePhone.version
                        });
                    } else if (request.action === 'call') {
                        window.chromePhone.setPhoneNumber(request.phoneNumber);
                        if (state.broadcast) {
                            state.broadcast.postMessage({action: 'setPhoneNumber'});
                        }
                    } else {
                        logger.debug('unknown action runtime onMessage, request: %o, sender: %o', request, sender);
                    }
                } else {
                    logger.debug('unhandled runtime onMessage, request: %o, sender: %o', request, sender);
                }
            });

            chrome.runtime.onConnect.addListener(function (port) {
                logger.debug('onConnect, port: %o', port);
                if (typeof port.sender !== 'undefined' && checkExternalAPIURL(port.sender.url)) {
                    logger.debug('External API connection allowed');
                    state.externalAPIPort.push(port);
                    port.onMessage.addListener(function (msg) {
                        logger.debug('onMessage (Content Script): %o', msg);
                        if (msg === 'ping') {
                            port.postMessage('pong');
                        } else if (typeof msg.action !== 'undefined') {
                            if (msg.action === 'ping') {
                                logger.debug('sending pong');
                                port.postMessage({action: 'pong', version: window.chromePhone.version});
                            } else if (msg.action === 'call') {
                                window.chromePhone.callNumber(msg.phoneNumber, true);
                            } else if (msg.action === 'answer' && state.call) {
                                window.chromePhone.answer();
                            } else if (msg.action === 'login') {
                                window.chromePhone.login(true);
                            } else if (msg.action === 'set-settings') {
                                window.chromePhone.updateSettingsScreen(msg.settings);
                            }
                        }
                    });
                    port.onDisconnect.addListener(function (disconnectedPort) {
                        logger.debug('Runtime connection disconnected: %o', disconnectedPort);
                        let pos = state.externalAPIPort.indexOf(disconnectedPort);
                        if (pos >= 0) {
                            logger.debug('removed from externalAPIPort');
                            state.externalAPIPort.splice(pos, 1);
                        } else {
                            logger.debug('could not find externalAPIPort, %i', pos);
                        }
                    });
                }
            });

            chrome.notifications.onButtonClicked.addListener(function (id, button) {
                logger.debug('notification ' + id + ' button ' + button + ' clicked');
                clearNotification();
                if (button === 0) {
                    window.chromePhone.answer();
                } else {
                    window.chromePhone.hangup(false);
                }
            });

            chrome.notifications.onClicked.addListener(function () {
                window.chromePhone.popoutWindow();
            });

            chrome.notifications.onClosed.addListener(function () {
                state.notificationId = undefined;
            });

            chrome.windows.onRemoved.addListener(function (windowId) {
                logger.debug('window closed %d', windowId);
                if (state.popoutWindowId === windowId) {
                    state.popoutWindowId = undefined;
                }
            });

            if (sync_opts.start_popout && !state.popoutWindowId) {
                window.chromePhone.popoutWindow();
            }

            chrome.storage.local.get('buzz_log', function (data) {
                if (typeof data.buzz_log !== 'undefined' && Array.isArray(data.buzz_log)) {
                    state.buzzLog = state.buzzLog.concat(data.buzz_log);
                }
            });

            chrome.storage.local.get('call_log', function (data) {
                if (typeof data.call_log !== 'undefined' && Array.isArray(data.call_log)) {
                    state.callLog = data.call_log;
                }
            });

            chrome.storage.local.get('last_dialed_number', function (data) {
                if (typeof data.last_dialed_number !== 'undefined') {
                    state.lastDialedNumber = data.last_dialed_number;
                }
            });
        }

        window.chromePhone.updateOptions(sync_opts, local_opts);
        state.audioOutput.load();
    };

    this.updateOptions = function (sync_opts, local_opts) {
        logger.debug('updateOptions(sync_opts:%o, local_opts:%o)', sync_opts, local_opts);
        buzzLog('Update Options');

        state.errorMessage = undefined;
        state.hijackLinks = sync_opts.hijack_links;
        state.autoAnswer = sync_opts.auto_answer;
        state.externalAPIURL = undefined;
        if (sync_opts.external_api) {
            state.externalAPIURL = new RegExp(sync_opts.external_api);
        }

        if (local_opts) {
            if (local_opts.media_input) {
                window.chromePhone.setAudioInput(local_opts.media_input);
            }
            if (local_opts.media_output) {
                window.chromePhone.setAudioOutput(local_opts.media_output);
            }
            if (local_opts.ring_output) {
                window.chromePhone.setRingOutput(local_opts.ring_output);
            }
            if (local_opts.ring_tone) {
                window.chromePhone.setRingTone(local_opts.ring_tone, false);
            }
        }

        let createSipServers = false;
        let timeout = 50;
        if (state.servers.length > 0) {
            let server = serverFromOptions(sync_opts.sip_1);
            if (server !== state.servers[0].sip_server ||
                sync_opts.sip_1.extension !== state.servers[0].sip_extension ||
                sync_opts.sip_1.password !== state.servers[0].sip_password) {
                createSipServers = true;
            }
            if (!createSipServers) {
                server = serverFromOptions(sync_opts.sip_2);
                if (server.length > 0 && state.servers.length === 1) {
                    createSipServers = true;
                } else if (server.length === 0 && state.servers.length === 2) {
                    createSipServers = true;
                } else if (server.length > 0 && state.servers.length === 2 &&
                    (server !== state.servers[1].sip_server ||
                    sync_opts.sip_2.extension !== state.servers[1].sip_extension ||
                    sync_opts.sip_2.password !== state.servers[1].sip_password)) {
                    createSipServers = true;
                }
            }

            if (createSipServers) {
                buzzLog('Servers changed, need to shutting down...');
                logger.debug('servers changing, shutdown 1st');
                timeout = 2000;
                window.chromePhone.shutdown();
            }
        } else {
            createSipServers = true;
        }

        if (createSipServers) {
            setTimeout(function () {
                let hasSettings = false;
                logger.debug('Init Server 1');
                if (createSipServer('Server 1', sync_opts.sip_1)) {
                    hasSettings = true;
                } else {
                    logger.warn('Server 1 Missing settings');
                }
                logger.debug('Init Server 2');
                if (createSipServer('Server 2', sync_opts.sip_2)) {
                    hasSettings = true;
                } else {
                    logger.debug('Server 2 Missing settings');
                }
                if (!hasSettings) {
                    state.errorMessage = 'Missing settings';
                    logger.error('Missing settings');
                    buzzLog('Missing server settings');
                    return;
                }
                logger.debug('auto_login: %s', sync_opts.auto_login);
                if (sync_opts.auto_login) {
                    buzzLog('Auto login enabled');
                    window.chromePhone.login(false);
                } else {
                    buzzLog('Auto login disabled');
                }
            }, timeout);
        }
    }

    function updateDeviceList() {
        if (state.micAccess) {
            logger.debug('updateDeviceList()');
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
                window.chromePhone.setAudioInput(audioInput);
                window.chromePhone.setAudioOutput(audioOutput);
                window.chromePhone.setRingOutput(ringOutput);
            });
        }
    }

    this.login = function (external) {
        logger.debug('login(external:%s)', external);
        state.fromExternal = external;
        state.errorMessage = undefined;
        state.infoMessage = undefined;
        for (let srv = 0; srv < state.servers.length; srv++) {
            if (state.servers[srv].connection.jssip && state.servers[srv].connection.jssip.isConnected() && !external) {
                logger.debug('jssip already connected to %s, stopping 1st ...', state.servers[srv].sip_server);
                state.servers[srv].connection.jssip.stop();
            }
            state.servers[srv].connection.jssip.start();
        }
    };

    this.logout = function () {
        logger.debug('logout()');
        state.previouslyLoggedIn = false;
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
        addCallLog('Outgoing', phoneNumber, phoneNumber);
        state.fromExternal = external;
        logger.debug('fromExternal - ' + external);
        state.infoMessage = undefined;
        if (!phoneNumber) {
            logger.warn('No Phone Number');
            showError('No Phone Number');
            if (external) {
                notifyExternal({action: 'error', error: 'No Phone Number'});
            }
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
        let srv = state.servers[serverIdx];
        logger.debug('using server ' + (serverIdx + 1));
        if (!srv.connection.loggedIn && state.servers.length > 1) {
            serverIdx = serverIdx === 1 ? 0 : 1;
            logger.debug('Not logged in, using server ' + (serverIdx + 1));
            srv = state.servers[serverIdx];
        }
        if (external && !srv.connection.loggedIn) {
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
                srv.connection.status = 'offhook';
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
                state.infoMessage = undefined;
                showError(errorMessage);
                state.call = undefined;
                srv.connection.status = 'onhook';
                onhook();
                notifyExternalOfError();
                storeCallLog();
            },
            ended: function (data) {
                logger.debug('call ended');
                tone.boopBoop();
                state.call = undefined;
                srv.connection.status = 'onhook';
                onhook();
                storeCallLog();
            },
            confirmed: function (data) {
                logger.debug('call confirmed');
                srv.connection.status = 'offhook';
                tone.stopRinging();
                tone.beep();
                state.infoMessage = 'On Call to ' + state.dialedNumber;
                updatePopupViewMessages();
                updateLastCallLogToSuccessful();
            },
            hold: function (data) {
                logger.debug('hold');
                state.hold = true;
                updatePopupHold();
            },
            unhold: function (data) {
                logger.debug('unhold');
                state.hold = false;
                updatePopupHold();
            },
            muted: function (data) {
                logger.debug('muted');
                state.mute = true;
                updatePopupMute();
            },
            unmuted: function (data) {
                logger.debug('unmuted');
                state.mute = false;
                updatePopupMute();
            },
            getusermediafailed: function (data) {
                logger.debug('getusermediafailed: %o', data);
                window.chromePhone.hangup(false);
                checkMicError(data);
            }
        };
        state.errorMessage = undefined;
        state.dialedNumber = phoneNumber;
        getMicrophone(function (stream) {
            let options = getConnectionOptions(srv.pcConfig, eventHandlers);
            delete options.mediaConstraints;
            options.mediaStream = stream;
            let callUri = 'sip:' + state.dialedNumber + '@' + srv.sip_server_host;
            state.infoMessage = 'Calling ' + state.dialedNumber + ' ...';
            logger.debug('calling: %s', callUri);
            state.call = srv.connection.jssip.call(callUri, options);
            offhook();
        });
    };

    function getConnectionOptions(pcConfig, eventHandlers) {
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
            },
            pcConfig: pcConfig
        };
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
            state.call.answer(getConnectionOptions(state.incoming_pcConfig));
            offhook();
        }
        state.incoming_answer = false;
        state.incoming_pcConfig = undefined;
    };

    this.hangup = function (external) {
        state.fromExternal = external;
        state.incoming_answer = false;
        state.incoming_pcConfig = undefined;
        if (state.call) {
            state.call.terminate();
        }
        onhook();
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

    this.isMuted = function () {
        return state.mute;
    };

    this.isOnHold = function () {
        return state.hold;
    };

    this.isLoggedIn = function () {
        if (state.servers.length === 0) return false;
        if (state.servers[0].connection.loggedIn) return true;
        return state.servers.length > 1 && state.servers[1].connection.loggedIn;
    };

    this.canLoggedIn = function () {
        return state.servers.length > 0;
    };

    this.getErrorMessage = function () {
        return state.errorMessage;
    };

    this.getInfoMessage = function () {
        return state.infoMessage;
    };

    this.startDTMF = function (value) {
        tone.startDTMF(value);
    };

    this.stopDTMF = function () {
        tone.stopDTMF();
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

    this.getCurrentAudioInputId = function() {
        return state.audioInputId;
    };

    this.getAudioOutputs = function () {
        return state.audioOutputs;
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

    this.getCurrentAudioOutputId = function() {
        return state.audioOutputId;
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

    this.hasMicAccess = function () {
        return state.micAccess;
    }

    this.connectedToExternalAPI = function () {
        logger.debug('externalAPIPort length: %i', state.externalAPIPort.length);
        return state.externalAPIPort.length > 0;
    };

    this.loadSettingsFromExternalAPI = function (optionsDoc) {
        if (this.connectedToExternalAPI()) {
            logger.debug('Request settings from CRM');
            state.optionsDoc = optionsDoc;
            // get the settings from the last connection
            state.externalAPIPort[state.externalAPIPort.length - 1].postMessage({action: 'get-settings'});
        } else {
            logger.warn('No Sidebar Port, cannot request settings');
        }
    };

    this.updateSettingsScreen = function (settings) {
        if (state.optionsDoc) {
            logger.debug('Got settings from External API');

            function setValue(id, val) {
                if (val) {
                    state.optionsDoc.getElementById(id).value = val;
                } else {
                    state.optionsDoc.getElementById(id).value = '';
                }
            }

            function setServer(id, settings) {
                setValue('sip_' + id + '_host', settings ? settings.host : '');
                setValue('sip_' + id + '_port', settings ? settings.port : '');
                setValue('sip_' + id + '_path', settings ? settings.path : '');
                setValue('sip_' + id + '_extension', settings ? settings.extension : '');
                setValue('sip_' + id + '_password', settings ? settings.password : '');
                setValue('sip_' + id + '_ice', settings ? settings.ice : '');
            }

            setServer('1', settings.sip_1);
            setServer('2', settings.sip_2);
            state.optionsDoc = undefined;
        } else {
            logger.warn('options doc was not set');
        }
    };

    this.startPlaybackTest = function (ringtone, audioDeviceId, ringDeviceId) {
        if (!audioDeviceId) audioDeviceId = 'default';
        testTone.audioSinkId = audioDeviceId;
        if (!ringDeviceId) ringDeviceId = 'default';
        testTone.ringSinkId = ringDeviceId;
        setTimeout(function () {
            if (ringtone) {
                testTone.startPlayback();
            } else {
                testTone.startRinging();
            }
        }, 100);
    };

    this.stopPlaybackTest = function (ringtone) {
        if (ringtone) {
            testTone.stopPlayback();
        } else {
            testTone.stopRinging();
        }
    };

    this.transfer = function (number) {
        if (!this.isOnCall()) return;
        let eventHandlers = {
            requestFailed: function (e) {
                logger.debug('tx req failed: ' + e.cause);
                showError(e.cause);
                if (window.chromePhone.isOnHold()) {
                    window.chromePhone.hold();
                }
            },
            accepted: function (e) {
                logger.debug('tx accepted');
                window.chromePhone.hangup(false);
                state.infoMessage = 'Call transferred';
                updatePopupViewMessages();
                setTimeout(function () {
                    state.infoMessage = undefined;
                    updatePopupViewMessages();
                }, 1500);
            },
            failed: function (e) {
                logger.debug('tx failed: ' + e.status_line.reason_phrase);
                showError(e.status_line.reason_phrase);
                if (window.chromePhone.isOnHold()) {
                    window.chromePhone.hold();
                }
            },
        };
        state.call.refer(number, {eventHandlers: eventHandlers});
    }

    this.silence = function () {
        tone.stopPlayback();
        if (state.broadcast) {
            state.broadcast.postMessage({action: 'hideSilenceButton'});
        }
    }

    this.debugJsSIP = function (on) {
        if (on) {
            JsSIP.debug.enable('JsSIP:*,ChromePhone');
        } else {
            JsSIP.debug.disable();
            JsSIP.debug.enable('ChromePhone');
        }
    }

    this.popoutWindow = function () {
        if ('chrome' in window) {
            let info = {
                focused: true,
                width: 220,
                height: 600,
                top: 0,
                left: 0
            };
            if (window.screen) {
                if (window.screen.availWidth > info.width) {
                    info.left = Math.round((window.screen.availWidth / 2) - (info.width / 2));
                }
                if (window.screen.availHeight > info.height) {
                    info.top = Math.round((window.screen.availHeight / 2) - (info.height / 2));
                }
            }
            if (typeof state.popoutWindowId === 'undefined') {
                info.url = chrome.extension.getURL('popup.html') + '?type=popout';
                info.type = 'popup';
                chrome.windows.create(info, function (win) {
                    if (win) {
                        logger.debug('popout created %d', win.id);
                        state.popoutWindowId = win.id;
                    }
                });
            } else {
                chrome.windows.update(state.popoutWindowId, info);
            }
        }
    }

    this.getCallLog = function () {
        return state.callLog;
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

    this.getRingTones = function () {
        return testTone.getRingTones();
    }

    this.setRingTone = function (idx, test) {
        if (test) {
            testTone.setRingTone(idx);
        } else {
            tone.setRingTone(idx);
        }
    }

    function buzzLog(message) {
        state.buzzLog.unshift({time: new Date().getTime(), message: message});
        // limiting the list to 50
        if (state.buzzLog.length > 50) {
            state.buzzLog.pop();
        }
        if ('chrome' in window) {
            chrome.storage.local.set({buzz_log: state.buzzLog});
        }
    }

    this.getBuzzLog = function () {
        return state.buzzLog;
    }

}

window.chromePhone = new ChromePhone();
// if a chrome extension
if ('chrome' in window && chrome.extension) {
    if (chrome.storage) {
        chrome.storage.local.get(local_opts, function (local_items) {
            chrome.storage.sync.get(sync_opts, function (sync_items) {
                window.chromePhone.init(sync_items, local_items);
            });
        });
    }
}
