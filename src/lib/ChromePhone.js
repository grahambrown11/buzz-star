'use strict';

import Logger from './Logger.js';
import JsSIP from 'jssip';
window.localStorage.setItem('debug', '*');
JsSIP.debug.enable('JsSIP:*');

function Tone(context) {

    /**
     * AudioContext
     */
    this.context = context;

    this.status = 0;
    this.ringing = 0;

    var dtmfFrequencies = {
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

    this.start = function (freq1, freq2) {
        if (this.status === 1) return;
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
        this.filter.connect(this.context.destination);
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
        var channels = 1;
        var sampleRate = this.context.sampleRate;
        var frameCount = sampleRate * 3;
        var arrayBuffer = this.context.createBuffer(channels, frameCount, sampleRate);

        // getChannelData allows us to access and edit the buffer data and change.
        var bufferData = arrayBuffer.getChannelData(0);
        for (var i = 0; i < frameCount; i++) {
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
            this.stop();
            this.ringing = 0;
            this.ringerLFOSource.stop(0);
        }
    };

    this.boopBoop = function () {
        this.start(400, 400);
        var tone = this;
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
        var tone = this;
        setTimeout(function () {
            tone.stop();
        }, 200);
    };

}

function ChromePhone() {

    let logger = new Logger();
    logger.debug('ChromePhone created');

    let state = {
        loggedIn: false,
        phoneNumber: '',
        dialedNumber: undefined,
        status: 'offline',
        audioContext: new AudioContext(),
        audioOutput: new Audio(),
        notificationId: '',
        sip_server: '',
        sip_extension: '',
        sip_password: '',
        call: undefined,
        microphone: undefined,
        mute: false,
        hold: false,
        sidebarPort: undefined,
        errorMessage: undefined,
        errorTimeout: undefined,
        infoMessage: undefined,
        fromExternal: false,
        pcConfig: {
            rtcpMuxPolicy : 'negotiate',
            iceServers: []
        }
    };
    let tone = new Tone(state.audioContext);
    let jssip = undefined;
    let socket = undefined;

    function checkMicError(err) {
        if ('chrome' in window && chrome.extension && err.name === 'MediaDeviceFailedDueToShutdown') {
            chrome.tabs.create({url: chrome.extension.getURL('microphone.html')});
        }
    }

    if ('chrome' in window && chrome.extension) {
        chrome.browserAction.setIcon({path: 'img/phone-blank.png'});

        // check we have access to the microphone
        navigator.getUserMedia({audio: true}, function(stream) {
            logger.debug('got access to mic');
            stream.getAudioTracks()[0].stop();
        }, function(err) {
            checkMicError(err);
        });

        chrome.runtime.onConnectExternal.addListener(function (port) {
            console.log('onConnectExternal');
            state.sidebarPort = port; // for now the last sidebar connect wins...
            port.onMessage.addListener(function (msg) {
                console.log('onMessage (External)');
                console.log(msg);
                if (msg === 'ping') {
                    port.postMessage('pong');
                } else if (typeof msg.action !== 'undefined') {
                    if (msg.action === 'call') {
                        state.phoneNumber = msg.phoneNumber;
                        chromePhone.call(true);
                    } else if (msg.action === 'answer' && state.call) {
                        chromePhone.answer();
                    } else if (msg.action === 'login') {
                        chromePhone.login(true);
                    }
                }
            });
            port.onDisconnect.addListener(function () {
                console.log('External connection disconnected');
            });
        });

        chrome.notifications.onButtonClicked.addListener(function (id, button) {
            console.log('notification ' + id + ' button ' + button + ' clicked');
            chrome.notifications.clear(state.notificationId);
            if (button === 0) {
                chromePhone.answer();
            } else {
                chromePhone.hangup(false);
            }
        });
    }

    function incomingCall(data) {
        // Avoid if busy or other incoming
        if (state.status === 'offhook') {
            logger.debug('incoming call replied with 486 "Busy Here"');
            state.call.terminate({
                status_code   : 486,
                reason_phrase : 'Busy Here'
            });
            return;
        }

        // register session events
        state.call = data.session;

        state.call.on('failed', function(e) {
            logger.debug('failed');
            console.log(e);
            tone.boopBoop();
            onhook();
            if (state.notificationId)
                chrome.notifications.clear(state.notificationId);
            // stop ringing
            setTimeout(function() {
                tone.stopRinging();
            }, 50);
        });
        state.call.on('ended', function(e) {
            logger.debug('ended');
            state.audioOutput.pause();
            tone.boopBoop();
            onhook();
        });
        state.call.on('accepted', function(e) {
            logger.debug('accepted');
            tone.stopRinging();
            let remoteStream = this.connection.getRemoteStreams()[0];
            setOutputStream(remoteStream);
            state.infoMessage = 'On Call: ' + data.session.remote_identity.display_name;
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

        let cli = data.session.remote_identity.display_name;
        state.status = 'ringing';
        state.infoMessage = 'Ringing: ' + cli;
        updatePopupViewStatus();
        // get the sidebar to auto answer if the request was from there...
        if (state.sidebarPort) {
            state.sidebarPort.postMessage({action: 'incoming-call', cli: cli});
            setTimeout(function() {
                if (!state.call.isEnded() && !state.call.isEstablished()) {
                    showNotification("Incoming Call", cli, true);
                    tone.startRinging();
                }
            }, 100);
        } else {
            showNotification("Incoming Call", cli, true);
            tone.startRinging();
        }

    }

    function setOutputStream(stream) {
        if (stream) {
            logger.debug('setOutputStream(%o)', stream);
            state.audioOutput.srcObject = stream;
            state.audioOutput.play();
            // let mediaStreamSource = state.audioContext.createMediaStreamSource(event.stream);
            // mediaStreamSource.connect(state.audioContext.destination);
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
                message: message,
                iconUrl: 'img/phone-blank.png',
                buttons: showAnswerButtons ? [{title: 'Answer'}, {title: 'Reject'}] : [],
                requireInteraction: showAnswerButtons
            }, function (id) {
                state.notificationId = id;
            });
        }
    }

    function onhook() {
        if ('chrome' in window && chrome.browserAction) {
            chrome.browserAction.setIcon({path: 'img/phone-green.png'});
        }
        state.status = 'onhook';
        state.infoMessage = undefined;
        state.hold = false;
        state.mute = false;
        state.phoneNumber = '';
        state.dialedNumber = '';
        state.fromExternal = false;
        if (state.microphone) {
            state.microphone.getAudioTracks()[0].stop();
            state.microphone = undefined;
        }
        updatePopupViewStatus();
        if (state.notificationId)
            chrome.notifications.clear(state.notificationId);
    }

    function offhook() {
        if ('chrome' in window && chrome.browserAction) {
            chrome.browserAction.setIcon({path: 'img/phone-red.png'});
        }
        state.status = 'offhook';
        updatePopupViewStatus();
        if (state.notificationId)
            chrome.notifications.clear(state.notificationId);
    }

    function notifyExternalOfError() {
        notifyExternal({error: state.errorMessage});
    }

    function notifyExternal(msg) {
        if (state.fromExternal && state.sidebarPort) {
            state.sidebarPort.postMessage(msg);
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

    this.init = function (opts) {
        logger.debug('init(opts:%o)', opts);
        if (jssip) {
            logger.debug('already had a jssip, stopping 1st...');
            jssip.stop();
        }
        state.errorMessage = undefined;
        state.sip_server = opts.sip_server;
        state.sip_extension = opts.sip_extension;
        state.sip_password = opts.sip_password;
        state.pcConfig.iceServers = [];
        if (opts.sip_ice) {
            let servers = opts.sip_ice.split(',');
            for (let i=0; i < servers.length; i++) {
                state.pcConfig.iceServers.push({urls: [servers[i]]});
            }
        }
        if (!state.sip_server || !state.sip_extension) {
            state.errorMessage = 'Missing settings';
            logger.error('Missing settings');
            return;
        }
        socket = new JsSIP.WebSocketInterface('wss://' + state.sip_server + ':8089/ws');
        let configuration = {
            sockets: [socket],
            uri: 'sip:' + state.sip_extension + '@' + state.sip_server,
            authorization_user: state.sip_extension,
            password: state.sip_password,
            register: true,
            registrar_server: 'sip:' + state.sip_server,
            session_timers: true
        };
        logger.debug('JsSIP config: %o', configuration);

        jssip = new JsSIP.UA(configuration);
        jssip.on('connecting', function() {
            logger.debug('connecting');
            state.errorMessage = undefined;
            state.infoMessage = 'Connecting to server ...';
            updatePopupViewStatus();
        });
        jssip.on('connected', function() {
            logger.debug('connected');
            state.errorMessage = undefined;
            state.infoMessage = 'Connected to server';
            updatePopupViewStatus();
            setTimeout(function() {
                state.infoMessage = undefined;
                updatePopupViewStatus();
            }, 3000);
        });
        jssip.on('disconnected', function() {
            logger.debug('disconnected');
            state.infoMessage = undefined;
            // not using showError as this must persist
            state.errorMessage = 'Disconnected from server';
            state.status = 'offline';
            state.loggedIn = false;
            if ('chrome' in window && chrome.browserAction) {
                chrome.browserAction.setIcon({path: 'img/phone-blank.png'});
            }
            updatePopupViewStatus();
        });
        jssip.on('registered', function() {
            logger.debug('registered');
            state.loggedIn = true;
            state.status = 'onhook';
            if ('chrome' in window && chrome.browserAction) {
                chrome.browserAction.setIcon({path: 'img/phone-green.png'});
            }
            updatePopupViewStatus();
        });
        jssip.on('unregistered', function() {
            logger.debug('unregistered');
            state.errorMessage = 'No longer registered - incoming calls will fail';
            updatePopupViewStatus();
        });
        jssip.on('registrationFailed', function(e) {
            logger.debug('registrationFailed');
            showError('Registration Failed: ' + e.cause);
            updatePopupViewStatus();
        });
        jssip.on('newRTCSession', function(data) {
            logger.debug('newRTCSession');
            // ignore our sessions (outgoing calls)
            if (data.originator === 'local')
                return;
            incomingCall(data);
        });
        jssip.on('newMessage', function() {
            logger.debug('newMessage');
        });
        // NOTE: skipping registrationExpiring event so JsSIP handles re-register
        logger.debug('jssip created');
        // TODO timer to check socket still connected ...
        // TODO maybe add chrome idle ... auto logout if idle too long...
    };

    this.login = function(external) {
        logger.debug('login(external:%s)', external);
        if (jssip && jssip.isConnected()) {
            logger.debug('jssip already connected, stopping 1st ...');
            jssip.stop();
        }
        state.fromExternal = external;
        state.errorMessage = undefined;
        state.infoMessage = undefined;
        jssip.start();
    };

    this.logout = function() {
        logger.debug('logout()');
        if (jssip) {
            jssip.stop();
        } else {
            state.loggedIn = false;
            state.status = 'offline';
        }
    };

    this.call = function(external) {
        state.fromExternal = external;
        if (!state.phoneNumber) {
            showError("No Phone Number");
            return;
        }
        if (external && !state.loggedIn) {
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
                onhook();
                notifyExternalOfError();
            },
            ended: function() {
                logger.debug('call ended');
                state.audioOutput.pause();
                tone.boopBoop();
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
                onhook();
                checkMicError(e);
            }

        };
        state.errorMessage = undefined;
        state.dialedNumber = state.phoneNumber;
        state.infoMessage = 'Calling ' + state.dialedNumber + ' ...';
        offhook();
        state.call = jssip.call('sip:' + state.dialedNumber + '@' + state.sip_server, {
            eventHandlers: eventHandlers,
            mediaConstraints: { 'audio': true, 'video': false },
            rtcOfferConstraints: {
                offerToReceiveAudio : 1,
                offerToReceiveVideo : 0
            },
            pcConfig: state.pcConfig
        });
    };

    this.answer = function() {
        if (state.call) {
            state.call.answer({
                pcConfig: state.pcConfig
            });
            offhook();
        }
    };

    this.hangup = function(external) {
        state.fromExternal = external;
        onhook();
        state.phoneNumber = '';
        if (state.call) {
            state.call.terminate();
            state.call.close();
            state.call = undefined;
        }
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
        return state.status;
    };

    this.isMuted = function() {
        return state.mute;
    };

    this.isOnHold = function() {
        return state.hold;
    };

    this.isLoggedIn = function() {
        return state.loggedIn;
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
        return state.status === 'offhook' && state.call;
    };

}

window.chromePhone = new ChromePhone();
// if a chrome extension
if ("chrome" in window && chrome.extension) {
    if (chrome.storage) {
        chrome.storage.sync.get(opts, function (items) {
            window.chromePhone.init(items);
        });
    }
}
