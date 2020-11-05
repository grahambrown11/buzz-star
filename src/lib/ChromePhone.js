'use strict';

import Logger from './Logger.js';
import JsSIP from 'jssip';

function ChromePhone() {

    let logger = new Logger();
    logger.debug('ChromePhone created');

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
        externalAPIPort: undefined,
        errorMessage: undefined,
        errorTimeout: undefined,
        infoMessage: undefined,
        fromExternal: false,
        audioInputs: [],
        audioInput: undefined,
        audioInputId: undefined,
        audioOutputs: [],
        audioOutputId: undefined,
        incoming_pcConfig: undefined,
        incoming_answer: false,
        micAccess: false,
        optionsDoc: undefined
    };
    let tone = new Tone(state.audioContext);

    function checkMic() {
        // check we have access to the microphone
        logger.debug('Checking Access to mic...');
        navigator.getUserMedia({audio: true}, function(stream) {
            logger.debug('... have access to mic');
            state.micAccess = true;
            stream.getAudioTracks()[0].stop();
            if (state.audioInputs.length === 0) {
                updateDeviceList();
            }
        }, function(err) {
            checkMicError(err);
        });
    }

    function checkMicError(err) {
        logger.warn('Error: %s - %s', err.name, err.message);
        if ('chrome' in window && chrome.extension && (err.name === 'NotAllowedError' || err.name.toLowerCase().indexOf('media') >= 0)) {
            state.micAccess = false;
            window.open(chrome.extension.getURL('microphone.html'), "mic_popup", "width=500,height=300,status=no,scrollbars=no,resizable=no");
        }
    }

    function incomingCall(data, pcConfig) {
        logger.debug('incoming call');
        // Avoid if busy or other incoming
        if (chromePhone.getStatus() === 'offhook') {
            logger.debug('status offhook: replied with 486 "Busy Here"');
            data.session.terminate({
                status_code   : 486,
                reason_phrase : 'Busy Here'
            });
            return;
        }

        // register session events
        state.call = data.session;
        let cli = 'Unknown';
        logger.debug('remote_identity: %o', state.call.remote_identity);
        if (state.call.remote_identity && state.call.remote_identity.display_name)
            cli = state.call.remote_identity.display_name;
        else if (state.call.remote_identity && state.call.remote_identity.uri && state.call.remote_identity.uri.user)
            cli = state.call.remote_identity.uri.user;

        state.call.on('failed', function(e) {
            logger.debug('failed');
            console.log(e);
            tone.boopBoop();
            state.incoming_answer = false;
            state.call = undefined;
            onhook();
        });
        state.call.on('ended', function(e) {
            logger.debug('ended');
            tone.boopBoop();
            state.incoming_answer = false;
            state.call = undefined;
            onhook();
        });
        state.call.on('connecting', function(e) {
            logger.debug('connecting');
            let remoteStream = this.connection.getRemoteStreams()[0];
            setOutputStream(remoteStream);
        });
        state.call.on('accepted', function(e) {
            logger.debug('accepted');
            state.infoMessage = 'On Call: ' + cli;
            state.incoming_answer = false;
            offhook();
        });
        state.call.on('hold', function(e) {
            logger.debug('hold');
            state.hold = true;
            updatePopupHold();
        });
        state.call.on('unhold', function(e) {
            logger.debug('unhold');
            state.hold = false;
            updatePopupHold();
        });
        state.call.on('muted', function(e) {
            logger.debug('muted');
            state.mute = true;
            updatePopupMute();
        });
        state.call.on('unmuted', function(e) {
            logger.debug('unmuted');
            state.mute = false;
            updatePopupMute();
        });
        state.incoming_pcConfig = pcConfig;
        state.infoMessage = 'Ringing: ' + cli;
        state.incoming_answer = true;
        updateOverallStatus();
        function startIncomingCallNotification() {
            showNotification("Incoming Call", cli, true);
            tone.startRinging();
        }
        // get the sidebar to auto answer if the request was from there...
        if (state.externalAPIPort) {
            state.externalAPIPort.postMessage({action: 'incoming-call', cli: cli});
            setTimeout(function() {
                if (!state.call.isEnded() && !state.call.isEstablished()) {
                    startIncomingCallNotification();
                }
            }, 100);
        } else {
            startIncomingCallNotification();
        }
    }

    function setOutputStream(stream) {
        if (stream) {
            logger.debug('setOutputStream()');
            state.audioOutput.srcObject = stream;
            state.audioOutput.play();
            logger.debug('Stream: %o', stream);
        }
    }

    function updatePopupViewStatus() {
        if ('chrome' in window && chrome.extension) {
            let popup = chrome.extension.getViews({type: 'popup'})[0];
            if (popup) {
                popup.updateFromBackground();
            }
        } else if ('updateFromBackground' in window) {
            updateFromBackground();
        }
    }

    function showNotification(title, message, showAnswerButtons) {
        if ('chrome' in window && chrome.notifications) {
            chrome.notifications.create(state.notificationId, {
                type: 'basic',
                title: title,
                message: message || '',
                iconUrl: 'img/phone-blank.png',
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
    }

    function offhook() {
        updateOverallStatus();
        clearNotification();
    }

    function notifyExternalOfError() {
        notifyExternal({error: state.errorMessage});
    }

    function notifyExternal(msg) {
        if (state.fromExternal && state.externalAPIPort) {
            state.externalAPIPort.postMessage(msg);
        }
    }

    function showError(error) {
        state.infoMessage = undefined;
        if (state.errorTimeout) {
            clearTimeout(state.errorTimeout);
        }
        state.errorMessage = error;
        state.errorTimeout = setTimeout(function () {
            state.errorMessage = undefined;
            updatePopupViewStatus();
        }, 5000);
    }

    function updatePopupMute() {
        if ('chrome' in window && chrome.extension) {
            let popup = chrome.extension.getViews({type: 'popup'})[0];
            if (popup) {
                popup.updateMute();
            }
        } else if ('updateMute' in window) {
            updateMute();
        }
    }

    function updatePopupHold() {
        if ('chrome' in window && chrome.extension) {
            let popup = chrome.extension.getViews({type: 'popup'})[0];
            if (popup) {
                popup.updateHold();
            }
        } else if ('updateHold' in window) {
            updateHold();
        }
    }

    function updatePopupMessages() {
        if ('chrome' in window && chrome.extension) {
            let popup = chrome.extension.getViews({type: 'popup'})[0];
            if (popup) {
                popup.updateMessages();
            }
        } else if ('updateMessages' in window) {
            updateMessages();
        }
    }

    function updateOverallStatus() {
        let status = chromePhone.getStatus();
        let icon = 'img/phone-blank.png';
        if (status === 'offhook' || status === 'ringing') {
            icon = 'img/phone-red.png';
        } else if (status === 'onhook') {
            icon = 'img/phone-green.png';
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

    function createSipServer(options) {
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
                rtcpMuxPolicy : 'negotiate',
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
            session_timers: true
        };
        logger.debug('JsSIP config: %o', configuration);
        cnf.connection.jssip = new JsSIP.UA(configuration);
        cnf.connection.jssip.on('connecting', function () {
            logger.debug('connecting to ' + cnf.sip_server);
            state.errorMessage = undefined;
            state.infoMessage = 'Connecting to server ...';
            updatePopupViewStatus();
        });
        cnf.connection.jssip.on('connected', function () {
            logger.debug('connected to ' + cnf.sip_server);
            state.errorMessage = undefined;
            state.infoMessage = 'Connected to server';
            updatePopupViewStatus();
            setTimeout(function () {
                state.infoMessage = undefined;
                updatePopupViewStatus();
            }, 3000);
        });
        cnf.connection.jssip.on('disconnected', function () {
            logger.debug('disconnected from ' + cnf.sip_server);
            state.infoMessage = undefined;
            // not using showError as this must persist
            state.errorMessage = 'Disconnected from server';
            cnf.connection.status = 'offline';
            cnf.connection.loggedIn = false;
            updateOverallStatus();
        });
        cnf.connection.jssip.on('registered', function () {
            logger.debug('registered ' + cnf.sip_user);
            cnf.connection.loggedIn = true;
            cnf.connection.status = 'onhook';
            updateOverallStatus();
        });
        cnf.connection.jssip.on('unregistered', function () {
            logger.debug('unregistered ' + cnf.sip_user);
            state.errorMessage = 'No longer registered - incoming calls will fail';
            updatePopupViewStatus();
        });
        cnf.connection.jssip.on('registrationFailed', function (e) {
            logger.debug('registrationFailed on ' + cnf.sip_user);
            showError('Registration Failed: ' + e.cause);
            updatePopupViewStatus();
        });
        cnf.connection.jssip.on('newRTCSession', function (data) {
            // ignore our sessions (outgoing calls)
            if (data.originator === 'local')
                return;
            logger.debug('newRTCSession from ' + cnf.sip_server_host);
            incomingCall(data, cnf.pcConfig);
        });
        cnf.connection.jssip.on('newMessage', function () {
            logger.debug('newMessage from ' + cnf.sip_server_host);
        });
        // NOTE: skipping registrationExpiring event so JsSIP handles re-register
        logger.debug('jssip created for ' + cnf.sip_server_host);
        state.servers.push(cnf);
        return true;
    }

    this.shutdown = function() {
        logger.debug('shutdown');
        this.logout();
        state.servers = [];
    };

    this.init = function (sync_opts, local_opts) {
        logger.debug('init');
        if ('chrome' in window && chrome.extension) {
            logger.debug('Is a chrome extension');
            chrome.browserAction.setIcon({path: 'img/phone-blank.png'});

            // listen for media device changes
            navigator.mediaDevices.ondevicechange = function() {
                updateDeviceList();
            };
            checkMic();

            chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
                if (request.action) {
                    if (request.action === 'check-mic') {
                        checkMic();
                    } else if (request.action === 'inject') {
                        var api_allowed = false;
                        if (state.externalAPIURL && sender.url === state.externalAPIURL) {
                            api_allowed = true;
                        }
                        sendResponse({
                            api_allowed: api_allowed,
                            tel_links: state.hijackLinks
                        });
                    } else if (request.action === 'call') {
                        chromePhone.setPhoneNumber(request.phoneNumber);
                    } else {
                        logger.debug('unknown action runtime onMessage, request: %o, sender: %o', request, sender);
                    }
                } else {
                    logger.debug('unhandled runtime onMessage, request: %o, sender: %o', request, sender);
                }
            });

            chrome.runtime.onConnect.addListener(function(port) {
                logger.debug('onConnect, port: %o', port);
                state.externalAPIPort = port; // for now the last sidebar connect wins...
                port.onMessage.addListener(function (msg) {
                    logger.debug('onMessage (Content Script): %o', msg);
                    if (msg === 'ping') {
                        state.externalAPIPort.postMessage('pong');
                    } else if (typeof msg.action !== 'undefined') {
                        if (msg.action === 'ping') {
                            logger.debug('sending pong');
                            state.externalAPIPort.postMessage({action: 'pong'});
                        } else if (msg.action === 'call') {
                            chromePhone.callNumber(msg.phoneNumber, true);
                        } else if (msg.action === 'answer' && state.call) {
                            chromePhone.answer();
                        } else if (msg.action === 'login') {
                            chromePhone.login(true);
                        } else if (msg.action === 'set-settings') {
                            chromePhone.updateSettingsScreen(msg.settings);
                        }
                    }
                });
                port.onDisconnect.addListener(function(disconnectedPort) {
                    logger.debug('Runtime connection disconnected');
                    if (disconnectedPort === state.externalAPIPort) {
                        state.externalAPIPort = undefined;
                    }
                });
            });

            chrome.notifications.onButtonClicked.addListener(function (id, button) {
                console.log('notification ' + id + ' button ' + button + ' clicked');
                clearNotification();
                if (button === 0) {
                    chromePhone.answer();
                } else {
                    chromePhone.hangup(false);
                }
            });

            chrome.notifications.onClosed.addListener(function () {
                state.notificationId = undefined;
            });
        }

        chromePhone.updateOptions(sync_opts, local_opts);

    };

    this.updateOptions = function (sync_opts, local_opts) {

        logger.debug('updateOptions(sync_opts:%o, local_opts:%o)', sync_opts, local_opts);
        state.errorMessage = undefined;

        state.hijackLinks = sync_opts.hijack_links;
        state.externalAPIURL = undefined;
        if (sync_opts.external_api) {
            state.externalAPIURL = sync_opts.external_api;
        }

        if (local_opts) {
            if (local_opts.media_input) {
                chromePhone.setAudioInput(local_opts.media_input);
            }
            if (local_opts.media_output) {
                chromePhone.setAudioOutput(local_opts.media_output);
            }
        }

        let createSipServers = false;
        let timeout = 50;
        if (state.servers.length > 0) {
            let server = serverFromOptions(sync_opts.sip_1);
            if (server !== state.servers[0].sip_server &&
                    sync_opts.sip_1.extension !== state.servers[0].sip_extension &&
                    sync_opts.sip_1.password !== state.servers[0].sip_password) {
                createSipServers = true;
            }
            server = serverFromOptions(sync_opts.sip_2);
            if (server.length > 0 && state.servers.length === 1) {
                createSipServers = true;
            } else if (server.length === 0 && state.servers.length === 2) {
                createSipServers = true;
            } else if (server !== state.servers[1].sip_server &&
                sync_opts.sip_2.extension !== state.servers[1].sip_extension &&
                sync_opts.sip_2.password !== state.servers[1].sip_password) {
                createSipServers = true;
            }

            if (createSipServers) {
                logger.debug("servers changing, shutdown 1st");
                timeout = 2000;
                chromePhone.shutdown();
            }
        } else {
            createSipServers = true;
        }

        if (createSipServers) {
            setTimeout(function() {
                let hasSettings = false;
                logger.debug('Init Server 1');
                if (createSipServer(sync_opts.sip_1)) {
                    hasSettings = true;
                } else {
                    logger.warn('Server 1 Missing settings');
                }
                logger.debug('Init Server 2');
                if (createSipServer(sync_opts.sip_2)) {
                    hasSettings = true;
                } else {
                    logger.debug('Server 2 Missing settings');
                }
                if (!hasSettings) {
                    state.errorMessage = 'Missing settings';
                    logger.error('Missing settings');
                    return;
                }
                logger.debug('auto_login: %s', sync_opts.auto_login);
                if (sync_opts.auto_login) {
                    chromePhone.login(false);
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
                let audioInput, audioOutput;
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
                    }
                }
                state.audioInputs = audioInputs;
                state.audioOutputs = audioOutputs;
                chromePhone.setAudioInput(audioInput);
                chromePhone.setAudioOutput(audioOutput);
            });
        }
    }

    this.login = function(external) {
        logger.debug('login(external:%s)', external);
        state.fromExternal = external;
        state.errorMessage = undefined;
        state.infoMessage = undefined;
        for (let srv=0; srv < state.servers.length; srv++) {
            if (state.servers[srv].connection.jssip && state.servers[srv].connection.jssip.isConnected()) {
                logger.debug('jssip already connected to %s, stopping 1st ...', state.servers[srv].sip_server);
                state.servers[srv].connection.jssip.stop();
            }
            state.servers[srv].connection.jssip.start();
        }
    };

     this.logout = function() {
        logger.debug('logout()');
        state.previouslyLoggedIn = false;
        for (let srv=0; srv < state.servers.length; srv++) {
            if (state.servers[srv].connection.jssip) {
                state.servers[srv].connection.jssip.stop();
            } else {
                state.servers[srv].connection.loggedIn = false;
                state.servers[srv].connection.status = 'offline';
            }
        }
    };

    this.call = function() {
        this.callNumber(state.phoneNumber, false);
    };

    this.callNumber = function(phoneNumber, external) {
        if (this.isOnCall()) return;
        state.fromExternal = external;
        if (!phoneNumber) {
            logger.warn("No Phone Number");
            showError("No Phone Number");
            return;
        }
        if (state.servers.length === 0) {
            logger.warn("No servers setup");
            notifyExternal({error: 'No servers setup'});
            return;
        }
        let srv = state.servers[0];
        if (!srv.connection.loggedIn && state.servers.length > 1) {
            logger.debug("Server 1 not logged in, using server 2");
            srv = state.servers[1];
        }
        if (external && !srv.connection.loggedIn) {
            notifyExternal({error: 'Not Logged In'});
            return;
        }
        // call events
        let eventHandlers = {
            connecting: function() {
                logger.debug('call connecting');
                state.call.connection.addEventListener('addstream', function(event) {
                    logger.debug('connection addstream');
                    setOutputStream(event.stream);
                });
            },
            progress: function() {
                logger.debug('call progress');
                tone.startRinging();
            },
            failed: function(e) {
                logger.debug('call failed: %o', e);
                tone.stopRinging();
                tone.boopBoop();
                let errorMessage = 'Call Failed: ' + e.cause;
                if (e.cause === 'SIP Failure Code') {
                    errorMessage += ' - ' + e.message.status_code + ':' + e.message.reason_phrase;
                }
                showError(errorMessage);
                state.call = undefined;
                onhook();
                notifyExternalOfError();
            },
            ended: function() {
                logger.debug('call ended');
                tone.boopBoop();
                state.call = undefined;
                onhook();
            },
            confirmed: function() {
                logger.debug('call confirmed');
                tone.stopRinging();
                tone.beep();
                state.infoMessage = 'On Call to ' + state.dialedNumber;
                updatePopupMessages();
            },
            hold: function() {
                logger.debug('hold');
                state.hold = true;
                updatePopupHold();
            },
            unhold: function(e) {
                logger.debug('unhold');
                state.hold = false;
                updatePopupHold();
            },
            muted: function(e) {
                logger.debug('muted');
                state.mute = true;
                updatePopupMute();
            },
            unmuted: function(e) {
                logger.debug('unmuted');
                state.mute = false;
                updatePopupMute();
            },
            getusermediafailed: function(e) {
                logger.debug('getusermediafailed: %o', e);
                chromePhone.hangup(false);
                checkMicError(e);
            }

        };
        state.errorMessage = undefined;
        state.dialedNumber = phoneNumber;
        state.infoMessage = 'Calling ' + state.dialedNumber + ' ...';
        let callUri = 'sip:' + state.dialedNumber + '@' + srv.sip_server_host;
        logger.debug('caling: %s', callUri);
        state.call = srv.connection.jssip.call(callUri, {
            eventHandlers: eventHandlers,
            mediaConstraints: {
                audio: {deviceId: state.audioInput ? {exact: state.audioInput} : undefined},
                video: false
            },
            rtcOfferConstraints: {
                offerToReceiveAudio : 1,
                offerToReceiveVideo : 0
            },
            pcConfig: srv.pcConfig
        });
        offhook();
    };

    this.answer = function() {
        if (state.call) {
            state.call.answer({
                pcConfig: state.incoming_pcConfig
            });
            tone.stopRinging();
            offhook();
        }
        state.incoming_answer = false;
        state.incoming_pcConfig = undefined;
    };

    this.hangup = function(external) {
        state.fromExternal = external;
        state.incoming_answer = false;
        state.incoming_pcConfig = undefined;
        if (state.call) {
            state.call.terminate();
            state.call.close();
        }
        onhook();
    };

    this.mute = function() {
        if (state.call) {
            if (state.mute) {
                state.call.unmute();
            } else {
                state.call.mute();
            }
        }
    };

    this.hold = function() {
        if (state.call) {
            if (state.hold) {
                state.call.unhold();
            } else {
                state.call.hold();
            }
        }
    };

    this.getPhoneNumber = function() {
        return state.phoneNumber;
    };

    this.setPhoneNumber = function(number) {
        state.phoneNumber = number;
    };

    this.getStatus = function() {
        if (state.call) {
            if (state.incoming_answer) return 'ringing';
            return 'offhook';
        }
        let status = 'offline';
        if (state.servers.length > 0) {
            if (state.servers[0].connection.status !== 'offline') {
                status = state.servers[0].connection.status;
            }
            if (status !== 'offhook' && state.servers.length > 1 && state.servers[1].connection.status !== 'offline') {
                status = state.servers[0].connection.status;
            }
        }
        return status;
    };

    this.isMuted = function() {
        return state.mute;
    };

    this.isOnHold = function() {
        return state.hold;
    };

    this.isLoggedIn = function() {
        if (state.servers.length === 0) return false;
        if (state.servers[0].connection.loggedIn) return true;
        return state.servers.length > 1 && state.servers[1].connection.loggedIn;
    };

    this.canLoggedIn = function() {
        return state.servers.length > 0;
    };

    this.getErrorMessage = function() {
        return state.errorMessage;
    };

    this.getInfoMessage = function() {
        return state.infoMessage;
    };

    this.startDTMF = function(value) {
        tone.startDTMF(value);
    };

    this.stopDTMF = function() {
        tone.stopDTMF();
    };

    this.sendDTMF = function(value) {
        if (state.call) {
            state.call.sendDTMF(value);
        }
    };

    this.isOnCall = function() {
        return state.call;
    };

    this.getAudioInputs = function() {
        return state.audioInputs;
    };

    this.setAudioInput = function(deviceId) {
        if (deviceId) {
            state.audioInputId = deviceId;
            for (let i = 0; i < state.audioInputs.length; i++) {
                if (deviceId === state.audioInputs[i].id) {
                    state.audioInput = deviceId;
                    logger.debug('set audio input to %s', state.audioInput);
                    return;
                }
            }
        }
        logger.debug('default audio input');
        state.audioInput = undefined;
    };

    this.getAudioOutputs = function() {
        return state.audioOutputs;
    };

    this.setAudioOutput = function(deviceId) {
        if (deviceId) {
            state.audioOutputId = deviceId;
            for (let i = 0; i < state.audioOutputs.length; i++) {
                if (deviceId === state.audioOutputs[i].id) {
                    state.audioOutput.setSinkId(deviceId);
                    tone.setAudioSinkId(deviceId);
                    logger.debug('set audio output to %s', state.audioOutputId);
                    return;
                }
            }
        }
        logger.debug('default audio output');
        state.audioOutput.setSinkId('default');
        tone.setAudioSinkId('default');
    };

    this.hasMicAccess = function() {
        return state.micAccess;
    }

    this.connectedToExternalAPI = function() {
        logger.debug('externalAPIPort type: ' + (typeof state.externalAPIPort));
        return typeof state.externalAPIPort !== "undefined";
    };

    this.loadSettingsFromExternalAPI = function(optionsDoc) {
        if (state.externalAPIPort) {
            logger.debug('Request settings from CRM');
            state.optionsDoc = optionsDoc;
            state.externalAPIPort.postMessage({action: 'get-settings'});
        } else {
            logger.warn('No Sidebar Port, cannot request settings');
        }
    };

    this.updateSettingsScreen = function(settings) {
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

}

function Tone(context) {

    /**
     * AudioContext
     */
    this.context = context;

    this.destination = this.context.createMediaStreamDestination();
    this.audioOutput = new Audio();
    this.audioOutput.srcObject = this.destination.stream;

    this.status = 0;
    this.ringing = 0;

    let dtmfFrequencies = {
        "1": {f1: 697, f2: 1209},
        "2": {f1: 697, f2: 1336},
        "3": {f1: 697, f2: 1477},
        "4": {f1: 770, f2: 1209},
        "5": {f1: 770, f2: 1336},
        "6": {f1: 770, f2: 1477},
        "7": {f1: 852, f2: 1209},
        "8": {f1: 852, f2: 1336},
        "9": {f1: 852, f2: 1477},
        "*": {f1: 941, f2: 1209},
        "0": {f1: 941, f2: 1336},
        "#": {f1: 941, f2: 1477}
    };

    this.setAudioSinkId = function(deviceId) {
        this.audioOutput.setSinkId(deviceId);
    };

    this.start = function (freq1, freq2) {
        if (this.status === 1) return;
        this.audioOutput.play();
        this.osc1 = this.context.createOscillator();
        this.osc2 = this.context.createOscillator();
        this.gainNode = this.context.createGain();
        this.gainNode.gain.value = 0.25;
        this.filter = this.context.createBiquadFilter();
        this.filter.type = "lowpass";
        this.filter.frequency.value = 8000;
        this.osc1.connect(this.gainNode);
        this.osc2.connect(this.gainNode);
        this.gainNode.connect(this.filter);
        this.filter.connect(this.destination);
        this.osc1.frequency.value = freq1;
        this.osc2.frequency.value = freq2;
        this.osc1.start(0);
        this.osc2.start(0);
        this.status = 1;
    };

    this.stop = function () {
        this.osc1.stop(0);
        this.osc2.stop(0);
        this.status = 0;
        this.audioOutput.pause();
    };

    this.startDTMF = function (value) {
        if (this.ringing === 1) return;
        this.start(dtmfFrequencies[value].f1, dtmfFrequencies[value].f2);
    };

    this.stopDTMF = function () {
        if (this.ringing === 1) return;
        this.stop();
    };

    this.createRingerLFO = function () {
        // Create an empty 3 second mono buffer at the
        // sample rate of the AudioContext
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

    this.startRinging = function () {
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

    this.stopRinging = function () {
        if (this.ringing === 1) {
            this.ringerLFOSource.stop(0);
            this.ringerLFOSource.disconnect(0);
            this.stop();
            this.ringing = 0;
        }
    };

    this.boopBoop = function () {
        let tone = this;
        // wait for ringing to stop 1st
        if (this.ringing === 1) {
            this.stopRinging();
            setTimeout(function () {
                tone.boopBoop();
            }, 50);
            return;
        }
        tone.start(400, 400);
        setTimeout(function () {
            tone.stop();
            setTimeout(function () {
                tone.start(400, 400);
                setTimeout(function () {
                    tone.stop();
                }, 250);
            }, 200);
        }, 250);
    };

    this.beep = function () {
        this.start(1046, 1046);
        let tone = this;
        setTimeout(function () {
            tone.stop();
        }, 200);
    };

}

window.chromePhone = new ChromePhone();
// if a chrome extension
if ("chrome" in window && chrome.extension) {
    if (chrome.storage) {
        chrome.storage.local.get(local_opts, function (local_items) {
            chrome.storage.sync.get(sync_opts, function (sync_items) {
                window.chromePhone.init(sync_items, local_items);
            });
        });
    }
}
