'use strict';

import Logger from './Logger.js';
import DTMF from "./DTMF";

const logger = new Logger("BuzzPopup");
const dtmf = new DTMF();
let messageTimeout = undefined;
let status = undefined;
let isOnHold = false;

chrome.runtime.onMessage.addListener((request, sender) => {
    if (request.action) {
        switch (request.action) {
            case 'update-status':
                uiUpdateStatus(request.data);
                break;
            case 'update-message':
                uiUpdateMessage(request.data);
                break;
            case 'update-media':
                uiUpdateMedia(request.data);
                break;
            case 'add-log':
                uiRenderBuzzLog();
                break;
            case 'external-api-change':
                logger.debug('external-api-change - connected: %o', request.data);
                if (request.data) {
                    document.getElementById('external-api').style.display = '';
                } else {
                    document.getElementById('external-api').style.display = 'none';
                }
                break;
            case 'set-number':
                logger.debug('set number - %o', request.data);
                document.getElementById('number').value = request.data;
                break;
        }
    }
});

function uiOnDial(e) {
    e.style.display = 'none';
    document.getElementById('oncall').style.display = '';
    document.getElementById('hangup').style.display = '';
    document.getElementById('silence').style.display = 'none';
    let top = document.querySelector('.buzz-inner');
    let className = top.className;
    className = className.replace(/w3-border-(green|black)/, 'w3-border-red');
    top.className = className;
}

function uiOnHangup() {
    document.getElementById('hangup').style.display = '';
    document.getElementById('transfer').style.display = 'none';
    document.getElementById('oncall').style.display = 'none';
    document.getElementById('dial').style.display = '';
    document.getElementById('dial').title = 'Dial';
    document.getElementById('hangup').style.display = 'none';
    document.getElementById('silence').style.display = 'none';
    document.getElementById('transfer').style.display = 'none';
    document.getElementById('number').value = '';
    document.getElementById('tx').dataset.action = 'tx';
    document.getElementById('tx').title = 'Transfer';
    let top = document.querySelector('.buzz-inner');
    let className = top.className;
    className = className.replace(/w3-border-(red|black)/, 'w3-border-green');
    top.className = className;
}

function uiUpdateStatus(data) {
    logger.debug('update status: %o', data);
    status = data.status;
    uiUpdateMute(data.isOnMute);
    uiUpdateHold(data.isOnHold);
    function updateIcon(color) {
        let icon = document.querySelector('link[rel~="icon"]');
        if (icon) {
            icon.href = 'img/icon-' + color + '-32.png';
        }
    }
    let top = document.querySelector('.buzz-inner');
    let className = top.className;
    document.getElementById('dial').style.display = '';
    if (data.status === 'offhook') {
        uiOnDial(document.getElementById('dial'));
        uiSetTransfer(data.transferring);
        updateIcon('red');
    } else if (data.status === 'onhook') {
        className = className.replace(/w3-border-(black|red)/, 'w3-border-green');
        document.querySelector('.buzz-inner').className = className;
        uiOnHangup();
        updateIcon('green');
    } else if (data.status === 'ringing') {
        className = className.replace(/w3-border-(black|green)/, 'w3-border-red');
        document.querySelector('.buzz-inner').className = className;
        document.getElementById('dial').title = 'Answer';
        document.getElementById('hangup').style.display = '';
        document.getElementById('silence').style.display = '';
        updateIcon('red');
    } else {
        className = className.replace(/w3-border-(red|green)/, 'w3-border-black');
        document.querySelector('.buzz-inner').className = className;
        updateIcon('blue');
    }
    if (data.isLoggedIn) {
        document.getElementById('login1').style.display = 'none';
        document.getElementById('login2').style.display = 'none';
        document.getElementById('not-connected').style.display = 'none';
        document.getElementById('logout').style.display = '';
        document.getElementById('dial-pad').style.display = '';
        if (data.phoneNumber) {
            document.getElementById('number').value = data.phoneNumber;
        }
        document.getElementById('number').focus();
    } else {
        if (data.canLogin) {
            document.getElementById('login1').style.display = '';
            document.getElementById('login2').style.display = '';
        } else {
            document.getElementById('login1').style.display = 'none';
            document.getElementById('login2').style.display = 'none';
        }
        document.getElementById('not-connected').style.display = '';
        document.getElementById('logout').style.display = 'none';
        document.getElementById('dial-pad').style.display = 'none';
    }
    if (data.servers.length > 0) {
        updateServerStatus('svr1', data.servers[0]);
        if (data.servers.length > 1) {
            updateServerStatus('svr2', data.servers[1]);
        } else {
            updateServerStatus('svr2', {connection: 'not configured'});
        }
    } else {
        updateServerStatus('svr1', {connection: 'not configured'});
        updateServerStatus('svr2', {connection: 'not configured'});
    }
    if (data.infoMessage) {
        uiUpdateMessage({
            message: data.infoMessage,
            error: false,
            timeout: 0
        });
    }
    if (data.externalAPI) {
        document.getElementById('external-api').style.display = '';
    } else {
        document.getElementById('external-api').style.display = 'none';
    }
    uiRenderCallLog();
}

function uiUpdateMute(isMuted) {
    logger.debug('uiUpdateMute - %o', isMuted);
    let mute = document.getElementById('mute');
    if (isMuted) {
        mute.title = 'Unmute';
        mute.querySelector('i').className = 'fa fa-microphone-slash';
    } else {
        mute.title = 'Mute';
        mute.querySelector('i').className = 'fa fa-microphone';
    }
}

function uiUpdateHold(onHold) {
    logger.debug('uiUpdateHold - %o', onHold);
    isOnHold = onHold;
    let hold = document.getElementById('hold');
    if (onHold) {
        hold.title = 'Resume';
        hold.querySelector('i').className = 'fa fa-play';
    } else {
        hold.title = 'Hold';
        hold.querySelector('i').className = 'fa fa-pause';
        uiSetTransfer(false);
    }
}

function uiUpdateMedia(data) {
    logger.debug('update media: %o', data);
    let mic = document.getElementById('mic-access');
    if (data.hasMicAccess) {
        mic.style.display = 'none';
    } else {
        mic.style.display = '';
    }
    renderSliders(data);
}

function uiSetTransfer(transferring) {
    let tx = document.getElementById('tx');
    if (transferring) {
        tx.dataset.action = 'cancel';
        tx.title = 'Cancel Transfer';
        document.getElementById('number').value = '';
        document.getElementById('hangup').style.display = 'none';
        document.getElementById('transfer').style.display = '';
    } else {
        tx.dataset.action = 'tx';
        tx.title = 'Transfer';
        document.getElementById('hangup').style.display = '';
        document.getElementById('transfer').style.display = 'none';
    }
}

function uiToggleTransfer() {
    let tx = document.getElementById('tx');
    uiSetTransfer(tx.dataset.action === 'tx');
    chrome.runtime.sendMessage({
        action: 'transferring',
        data: tx.dataset.action === 'cancel'
    }).then();
}

function uiUpdateMessage(data) {
    logger.debug('update message: %o', data);
    if (messageTimeout) {
        clearTimeout(messageTimeout);
    }
    const inf = document.getElementById('info');
    const err = document.getElementById('error');
    inf.style.display = 'none';
    err.style.display = 'none';
    if (data.message) {
        if (data.error) {
            err.innerHTML = data.message;
            err.style.display = '';
        } else {
            inf.innerHTML = data.message;
            inf.style.display = '';
        }
        if (data.timeout) {
            messageTimeout = setTimeout(function () {
                err.style.display = 'none';
                inf.style.display = 'none';
                messageTimeout = undefined;
            }, data.timeout);
        }
    }
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(timestamp, short) {
    const date = new Date(timestamp);
    let dateDisplay;
    if (short) {
        dateDisplay = monthNames[date.getMonth()] + ', ';
    } else {
        dateDisplay = date.getFullYear() + '-';
        if (date.getMonth() < 10) {
            dateDisplay += '0';
        }
        dateDisplay += (date.getMonth() + 1);
        dateDisplay += '-';
    }
    if (date.getDate() < 10) {
        dateDisplay += '0';
    }
    dateDisplay += date.getDate() + ' ';
    if (date.getHours() < 10) {
        dateDisplay += '0';
    }
    dateDisplay += date.getHours() + ':';
    if (date.getMinutes() < 10) {
        dateDisplay += '0';
    }
    dateDisplay += date.getMinutes();
    if (!short) {
        dateDisplay += ':';
        if (date.getSeconds() < 10) {
            dateDisplay += '0';
        }
        dateDisplay += date.getSeconds();
        dateDisplay += '.';
        if (date.getMilliseconds() < 10) {
            dateDisplay += '00';
        } else if (date.getMilliseconds() < 100) {
            dateDisplay += '0';
        }
        dateDisplay += date.getMilliseconds();
    }
    return dateDisplay;
}

function uiRenderCallLog() {
    if (document.getElementById('list').style.display === '') {
        chrome.runtime.sendMessage({action: 'get-call-log'}, (callLog) => {
            logger.debug('call log: %o', callLog);
            if (callLog.length === 0) {
                document.getElementById('list').innerHTML = '<div>No call records</div>';
            } else {
                document.getElementById('list').innerHTML = '';
                function generateRecord(type, success, display, number, timestamp) {
                    const record = document.getElementById('call-record-template').content.firstElementChild.cloneNode(true);
                    record.dataset.number = number;
                    let typeClass = '', title = type;
                    if (type === 'Incoming' && !success) {
                        typeClass += ' fa-level-down missed';
                    } else if (type === 'Incoming' || type === 'Outgoing') {
                        typeClass += ' fa-long-arrow-right';
                        typeClass += ' ' + type.toLowerCase();
                    }
                    if (success) {
                        if (type === 'Incoming') {
                            typeClass += ' w3-text-green';
                        } else {
                            typeClass += ' w3-text-blue';
                        }
                        title += ' Answered';
                    } else {
                        if (type === 'Incoming') {
                            title += ' Missed';
                        } else {
                            title += ' No answer';
                        }
                        typeClass += ' w3-text-red';
                    }
                    const icon = record.querySelector('.call-type .fa');
                    icon.className += typeClass;
                    icon.title = title;
                    record.querySelector('.call-date').innerText = formatDate(timestamp, true);
                    record.querySelector('.call-display').innerText = display;
                    record.addEventListener('click', function() {
                        if (status === 'onhook') {
                            document.querySelector('.tablink[data-tab="phone"]').dispatchEvent(new MouseEvent('click'));
                            let e = document.getElementById('number');
                            e.value = this.dataset.number;
                            e.dispatchEvent(new KeyboardEvent('keyup'));
                        }
                    });
                    document.getElementById('list').appendChild(record);
                }
                for (let i = 0; i < callLog.length; i++) {
                    generateRecord(callLog[i].type, callLog[i].success, callLog[i].display, callLog[i].number, callLog[i].time);
                }
            }
        });
    }
}

function updateServerStatus(svr, server) {
    let border = 'w3-border-black';
    if (server.connection === 'online') {
        border = 'w3-border-green';
    } else if (server.connection === 'offline') {
        border = 'w3-border-red';
    }
    let elem = document.getElementById(svr);
    elem.className = elem.className.replace(/w3-border-(red|green|black)/, border);
    if (server) {
        elem.title = server.server + ' is ' + server.connection + ', ' + server.status;
    }
    let details = server.connection;
    if (typeof server.status !== 'undefined' && server.status !== 'onhook') {
        details += ' - busy';
    }
    elem.querySelector('.details').innerHTML = details;
}

function uiRenderBuzzLog() {
    chrome.runtime.sendMessage({action: 'get-log'}, (buzzLog) => {
        logger.debug('BuzzLog: %o', buzzLog);
        let log = '';
        for (let i = 0; i < buzzLog.length; i++) {
            log += formatDate(buzzLog[i].time, false) + ' - ' + buzzLog[i].message + '\n';
        }
        document.getElementById('buzz-log').innerHTML = log;
    });
}

function renderSliders(data) {
    if (document.getElementById('sliders').style.display === '') {
        function changeMedia() {
            chrome.runtime.sendMessage({
                action: 'set-media',
                audioInput: document.getElementById('media_input').value,
                audioOutput: document.getElementById('media_output').value
            }).then();
        }
        const template = document.getElementById('sliders-template').content.firstElementChild.cloneNode(true);
        let mediaInputSelect = template.querySelector('#media_input');
        populateSelect(mediaInputSelect, data.audioInputs, data.currentAudioInputId);
        mediaInputSelect.addEventListener('change', function() {
            logger.debug('input change %s', this.value);
            changeMedia();
        });
        let mediaOutputSelect = template.querySelector('#media_output');
        populateSelect(mediaOutputSelect, data.audioOutputs, data.currentAudioOutputId);
        mediaOutputSelect.addEventListener('change', function() {
            logger.debug('output change %s', this.value);
            changeMedia();
        });
        document.getElementById('sliders').appendChild(template);
        window.requestAnimationFrame(levels);
    }
}

function populateSelect(select, items, value) {
    let selected = 0;
    for (let i = 0; i < items.length; i++) {
        let option = document.createElement('option');
        option.value = items[i].id;
        option.text = items[i].name;
        select.appendChild(option);
        if (items[i].id === value)
            selected = i;
    }
    select.options.selectedIndex = selected;
}

function levels() {
    if (status === 'offhook') {
        if (document.getElementById('sliders').style.display === '') {
            chrome.runtime.sendMessage({action: 'get-levels'}, (res) => {
                setMeter('input', res.inputVolume);
                setMeter('output', res.outputVolume);
            });
            window.requestAnimationFrame(levels);
        }
    } else {
        document.querySelector('.meter.input').style.display = 'none';
        document.querySelector('.meter.output').style.display = 'none';
    }
}

function setMeter(type, volume) {
    let max = 166;
    let width = max - Math.floor(max * volume[0] / 100);
    if (width > max) {
        width = max;
    } else if (width < 0) {
        width = 0;
    }
    let overlay = document.querySelector('.meter.' + type + ' .overlay');
    if (overlay) {
        overlay.style.width = width + 'px';
    }
    let pos = Math.floor(max * volume[1] / 100);
    if (pos > max) {
        pos = max;
    } else if (pos < 0) {
        pos = 0;
    }
    let peak = document.querySelector('.meter.' + type + ' .peak');
    if (peak) {
        if (pos > 0) {
            peak.style.display = 'block';
            peak.style.left = pos + 'px';
        } else {
            peak.style.display = '';
        }
    }
}

function setPhoneNumber(value) {
    value = value ? value.replace(/[^\d\*\#]/g, '') : '';
    chrome.runtime.sendMessage({
        action: 'set-number',
        data: value
    }).then();
    return value;
}

document.addEventListener('DOMContentLoaded', function() {

    let i;
    logger.debug('Popup loaded, url=%s', window.location.href);

    if (window.location.href.indexOf('type=popout') !== -1) {
        document.getElementById('popout').style.display = 'none';
    } else {
        document.getElementById('popout').addEventListener('click', function() {
            chrome.runtime.sendMessage({action: 'popout-window'}).then();
        });
    }

    let tabLinks = document.querySelectorAll('.tablink');
    for (i=0; i < tabLinks.length; i++) {
        tabLinks[i].addEventListener('click', function() {
            let tab = document.querySelector('.tab.show');
            if (tab) {
                tab.className = tab.className.replace(' show', '');
            }
            let tabLink = document.querySelector('.tablink.w3-border-black');
            if (tabLink) {
                tabLink.className = tabLink.className.replace(' w3-border-black', '');
            }
            document.getElementById('list').innerHTML = '';
            document.getElementById('sliders').innerHTML = '';
            tab = document.getElementById(this.dataset.tab);
            if (tab) {
                tab.className += ' show';
                if (this.dataset.tab === 'list') {
                    uiRenderCallLog();
                } else if (this.dataset.tab === 'sliders') {
                    chrome.runtime.sendMessage({action: 'get-media'}, (res) => {
                        renderSliders(res);
                    });
                }
            }
            this.className += ' w3-border-black';
        });
    }
    chrome.runtime.sendMessage({action: 'get-status'}, (res) => {
        uiUpdateStatus(res);
    });
    chrome.runtime.sendMessage({action: 'get-media'}, (res) => {
        uiUpdateMedia(res);
    });
    uiRenderBuzzLog();

    let keys = document.querySelectorAll('.num-pad .key');
    for (let i=0; i < keys.length; i++) {
        keys[i].addEventListener('mousedown', function() {
            dtmf.startDTMF(this.dataset.value);
        });
        keys[i].addEventListener('mouseup', function() {
            dtmf.stopDTMF();
            if (status === 'offhook' && document.getElementById('tx').dataset.action === 'tx') {
                chrome.runtime.sendMessage({
                    action: 'send-dtmf',
                    data: this.dataset.value
                }).then();
            } else {
                let e = document.getElementById('number');
                e.value = setPhoneNumber(e.value + this.dataset.value);
            }
        });
    }

    document.getElementById('mic-access').addEventListener('click', function() {
        chrome.runtime.sendMessage({action: 'open-mic-permission'}).then();
    });

    document.getElementById('number').addEventListener('keyup', function() {
        this.value = setPhoneNumber(this.value);
    });

    document.getElementById('number').addEventListener('paste', function() {
        this.value = setPhoneNumber(this.value);
    });

    document.getElementById('number-clear').addEventListener('click', function() {
        document.getElementById('number').value = '';
        setPhoneNumber('');
    });

    document.getElementById('dial').addEventListener('click', function() {
        call(this);
    });

    document.getElementById('hangup').addEventListener('click', function() {
        chrome.runtime.sendMessage({action: 'hangup'}).then();
        uiOnHangup();
    });

    document.getElementById('silence').addEventListener('click', function() {
        this.style.display = 'none';
        chrome.runtime.sendMessage({action: 'silence'}).then();
    });

    document.getElementById('mute').addEventListener('click', function() {
        this.querySelector('i').className = '';
        chrome.runtime.sendMessage({action: 'mute'}).then();
    });

    document.getElementById('hold').addEventListener('click', function() {
        this.querySelector('i').className = '';
        chrome.runtime.sendMessage({action: 'hold'}).then();
    });

    document.getElementById('tx').addEventListener('click', function() {
        uiToggleTransfer();
    });

    document.getElementById('transfer').addEventListener('click', function() {
        transfer();
    });

    document.getElementById('settings').addEventListener('click', function() {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('login1').addEventListener('click', function() {
        this.style.display = 'none';
        chrome.runtime.sendMessage({action: 'login'}).then();
    });

    document.getElementById('login2').addEventListener('click', function() {
        this.style.display = 'none';
        chrome.runtime.sendMessage({action: 'login'}).then();
    });

    document.getElementById('logout').addEventListener('click', function() {
        this.style.display = 'none';
        chrome.runtime.sendMessage({action: 'logout'}).then();
    });

    document.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            if (status === 'offhook') {
                if (document.getElementById('transfer').style.display === '') {
                    transfer();
                }
            } else {
                call(document.getElementById('dial'));
            }
        }
    });

    function call(btn) {
        if (status === 'ringing') {
            chrome.runtime.sendMessage({action: 'answer'}).then();
        } else {
            if (!document.getElementById('number').value) {
                chrome.runtime.sendMessage({action: 'get-last-dialed-number'}, (res) => {
                    let e = document.getElementById('number');
                    e.value = res;
                    e.dispatchEvent(new KeyboardEvent('keyup'));
                });
                return;
            }
            uiOnDial(btn);
            chrome.runtime.sendMessage({
                action: 'call',
                data: document.getElementById('servers').value
            }).then();
        }
    }

    function transfer() {
        if (document.getElementById('number').value.length === 0) return;
        chrome.runtime.sendMessage({
            action: 'transfer',
            data: document.getElementById('number').value
        }).then();
    }

});

