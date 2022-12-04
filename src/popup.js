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

function uiUpdateStatus() {
    uiUpdateMessages();
    function updateIcon(color) {
        let icon = document.querySelector('link[rel~="icon"]');
        if (icon) {
            icon.href = 'img/icon-' + color + '-32.png';
        }
    }
    let top = document.querySelector('.buzz-inner');
    let className = top.className;
    if (chromePhone.getStatus() === 'offhook') {
        uiOnDial(document.getElementById('dial'));
        className = className.replace(/w3-border-(black|green)/, 'w3-border-red');
        document.querySelector('.buzz-inner').className = className;
        uiUpdateMute();
        uiUpdateHold();
        updateIcon('red');
    } else if (chromePhone.getStatus() === 'onhook') {
        className = className.replace(/w3-border-(black|red)/, 'w3-border-green');
        document.querySelector('.buzz-inner').className = className;
        uiOnHangup();
        updateIcon('green');
    } else if (chromePhone.getStatus() === 'ringing') {
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
    if (chromePhone.isLoggedIn()) {
        document.getElementById('login1').style.display = 'none';
        document.getElementById('login2').style.display = 'none';
        document.getElementById('not-connected').style.display = 'none';
        document.getElementById('logout').style.display = '';
        document.getElementById('dial-pad').style.display = '';
        document.getElementById('number').value = chromePhone.getPhoneNumber();
        document.getElementById('number').focus();
    } else {
        if (chromePhone.canLoggedIn()) {
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
    uiUpdateServers();
    uiRenderCallLog();
    uiRenderBuzzLog();
    if (chromePhone.connectedToExternalAPI()) {
        document.getElementById('external-api').style.display = '';
    } else {
        document.getElementById('external-api').style.display = 'none';
    }
}

function uiUpdateMute() {
    let mute = document.getElementById('mute');
    if (chromePhone.isMuted()) {
        mute.title = 'Unmute';
        mute.querySelector('i').className = 'fa fa-microphone-slash';
    } else {
        mute.title = 'Mute';
        mute.querySelector('i').className = 'fa fa-microphone';
    }
}

function uiUpdateHold() {
    let hold = document.getElementById('hold');
    if (chromePhone.isOnHold()) {
        hold.title = 'Resume';
        hold.querySelector('i').className = 'fa fa-play';
    } else {
        hold.title = 'Hold';
        hold.querySelector('i').className = 'fa fa-pause';
        if (document.getElementById('tx').dataset.action !== 'tx') {
            uiToggleTransfer(false);
        }
    }
}

function uiUpdateMicAccess() {
    let mic = document.getElementById('mic-access');
    if (window.chromePhone.hasMicAccess()) {
        mic.style.display = 'none';
    } else {
        mic.style.display = '';
        mic.href = chrome.extension.getURL('microphone.html');
    }
}

function uiUpdateMedia() {
    uiUpdateMicAccess();
    if (document.querySelector('.tab.show').dataset.tab === 'sliders') {
        renderSliders();
    }
}

function uiToggleTransfer(hold) {
    let tx = document.getElementById('tx');
    if (tx.dataset.action === 'tx') {
        tx.dataset.action = 'cancel';
        tx.title = 'Cancel Transfer';
        document.getElementById('number').value = '';
        document.getElementById('hangup').style.display = 'none';
        document.getElementById('transfer').style.display = '';
        if (hold && !chromePhone.isOnHold()) {
            chromePhone.hold();
        }
    } else {
        tx.dataset.action = 'tx';
        tx.title = 'Transfer';
        document.getElementById('hangup').style.display = '';
        document.getElementById('transfer').style.display = 'none';
        document.getElementById('number').value = chromePhone.getPhoneNumber();
        if (hold && chromePhone.isOnHold()) {
            chromePhone.hold();
        }
    }
}

function uiUpdateMessages() {
    if (chromePhone.getErrorMessage()) {
        let err = document.getElementById('error');
        err.innerHTML = chromePhone.getErrorMessage();
        err.style.display = '';
    } else {
        document.getElementById('error').style.display = 'none';
    }
    if (chromePhone.getInfoMessage()) {
        let inf = document.getElementById('info');
        inf.innerHTML = chromePhone.getInfoMessage();
        inf.style.display = '';
    } else {
        document.getElementById('info').style.display = 'none';
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
            if (chromePhone.getStatus() === 'onhook') {
                let e = document.getElementById('number');
                e.value = chromePhone.setPhoneNumber(this.dataset.number);
                e.dispatchEvent(new KeyboardEvent('keyup'));
                document.querySelector('.tablink[data-tab="phone"]').dispatchEvent(new MouseEvent('click'));
            }
        });
        document.getElementById('list').appendChild(record);
    }
    if (document.getElementById('list').style.display === '') {
        const callLog = chromePhone.getCallLog();
        if (callLog.length === 0) {
            document.getElementById('list').innerHTML = '<div>No call records</div>';
        } else {
            document.getElementById('list').innerHTML = '';
            for (let i = 0; i < callLog.length; i++) {
                generateRecord(callLog[i].type, callLog[i].success, callLog[i].display, callLog[i].number, callLog[i].time);
            }
        }
    }
}

function uiUpdateServers() {
    let servers = chromePhone.getServers();
    if (servers.length > 0) {
        updateServerStatus('svr1', servers[0]);
        if (servers.length > 1) {
            updateServerStatus('svr2', servers[1]);
        } else {
            updateServerStatus('svr2', {connection: 'not configured'});
        }
    } else {
        updateServerStatus('svr1', {connection: 'not configured'});
        updateServerStatus('svr2', {connection: 'not configured'});
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
    const buzzLog = chromePhone.getBuzzLog();
    let log = '';
    for (let i = 0; i < buzzLog.length; i++) {
        log += formatDate(buzzLog[i].time, false) + ' - ' + buzzLog[i].message + '\n';
    }
    document.getElementById('buzz-log').innerHTML = log;
}

function renderSliders() {
    if (document.getElementById('sliders').style.display === '') {
        const template = document.getElementById('sliders-template').content.firstElementChild.cloneNode(true);
        let mediaInputSelect = template.querySelector('#media_input');
        populateSelect(mediaInputSelect, chromePhone.getAudioInputs(), chromePhone.getCurrentAudioInputId());
        mediaInputSelect.addEventListener('change', function() {
            console.log('input change', this.value);
            chromePhone.setAudioInput(this.value);
        });
        let mediaOutputSelect = template.querySelector('#media_output');
        populateSelect(mediaOutputSelect, chromePhone.getAudioOutputs(), chromePhone.getCurrentAudioOutputId());
        mediaOutputSelect.addEventListener('change', function() {
            console.log('output change', this.value);
            chromePhone.setAudioOutput(this.value);
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
    if (chromePhone.getStatus() === 'offhook') {
        if (document.getElementById('sliders').style.display === '') {
            setMeter('input', chromePhone.getInputVolume());
            setMeter('output', chromePhone.getOutputVolume());
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

document.addEventListener('DOMContentLoaded', function() {

    let i;
    console.log('Popup loaded, url=' + window.location.href);

    if (window.location.href.indexOf('type=popout') !== -1) {
        document.getElementById('popout').style.display = 'none';
    } else {
        document.getElementById('popout').addEventListener('click', function() {
            chromePhone.popoutWindow();
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
                    renderSliders();
                }
            }
            this.className += ' w3-border-black';
        });
    }

    let broadcast = undefined;
    // check we're running as an extension
    if ('chrome' in window && chrome.extension) {
        broadcast = new BroadcastChannel('buzz_bus');
        broadcast.onmessage = function(e) {
            console.log('buzz_bus message received', e.data);
            if (e.source !== window && e.data && e.data.action) {
                if (e.data.action === 'updateMessages') {
                    uiUpdateMessages();
                } else if (e.data.action === 'updateStatus' || e.data.action === 'externalAPIChange') {
                    uiUpdateStatus();
                } else if (e.data.action === 'updateMute') {
                    uiUpdateMute();
                } else if (e.data.action === 'updateHold') {
                    uiUpdateHold();
                } else if (e.data.action === 'hideSilenceButton') {
                    document.getElementById('silence').style.display = 'none';
                } else if (e.data.action === 'setPhoneNumber') {
                    document.getElementById('number').value = chromePhone.getPhoneNumber();
                } else if (e.data.action === 'updateMediaDevices') {
                    uiUpdateMedia();
                }
            }
        };
        window.chromePhone = chrome.extension.getBackgroundPage().chromePhone;
        uiUpdateMicAccess();
        uiUpdateStatus();
    } else {
        // not an extension add scripts
        let s2 = document.getElementsByTagName('script')[0];
        let s1 = document.createElement('script');
        s1.src = 'chrome-phone.js';
        s2.parentNode.insertBefore(s1, s2);
        setTimeout(function() {
            uiUpdateStatus();
        }, 250);
    }

    let keys = document.querySelectorAll('.num-pad .key');
    for (let i=0; i < keys.length; i++) {
        keys[i].addEventListener('mousedown', function() {
            chromePhone.startDTMF(this.dataset.value);
        });
        keys[i].addEventListener('mouseup', function() {
            chromePhone.stopDTMF();
            if (chromePhone.isOnCall() && document.getElementById('tx').dataset.action === 'tx') {
                chromePhone.sendDTMF(this.dataset.value);
            } else {
                let e = document.getElementById('number');
                e.value = chromePhone.setPhoneNumber(e.value + this.dataset.value);
                if (broadcast) {
                    broadcast.postMessage({action: 'setPhoneNumber'});
                }
            }
        });
    }

    document.getElementById('number').addEventListener('keyup', function() {
        this.value = chromePhone.setPhoneNumber(this.value);
        if (broadcast) {
            broadcast.postMessage({action: 'setPhoneNumber'});
        }
    });

    document.getElementById('number').addEventListener('paste', function() {
        this.value = chromePhone.setPhoneNumber(this.value);
        if (broadcast) {
            broadcast.postMessage({action: 'setPhoneNumber'});
        }
    });

    document.getElementById('number-clear').addEventListener('click', function() {
        document.getElementById('number').value = '';
        chromePhone.setPhoneNumber('');
        if (broadcast) {
            broadcast.postMessage({action: 'setPhoneNumber'});
        }
    });

    document.getElementById('dial').addEventListener('click', function() {
        call(this);
    });

    document.getElementById('hangup').addEventListener('click', function() {
        uiOnHangup(this);
        chromePhone.hangup(false);
    });

    document.getElementById('silence').addEventListener('click', function() {
        this.style.display = 'none';
        chromePhone.silence();
    });

    document.getElementById('mute').addEventListener('click', function() {
        this.querySelector('i').className = '';
        chromePhone.mute();
    });

    document.getElementById('hold').addEventListener('click', function() {
        this.querySelector('i').className = '';
        chromePhone.hold();
    });

    document.getElementById('tx').addEventListener('click', function() {
        uiToggleTransfer(true);
    });

    document.getElementById('transfer').addEventListener('click', function() {
        transfer();
    });

    document.getElementById('settings').addEventListener('click', function() {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('login1').addEventListener('click', function() {
        this.style.display = 'none';
        chromePhone.login(false);
    });

    document.getElementById('login2').addEventListener('click', function() {
        this.style.display = 'none';
        chromePhone.login(false);
    });

    document.getElementById('logout').addEventListener('click', function() {
        this.style.display = 'none';
        chromePhone.logout();
    });

    document.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            if (chromePhone.getStatus() === 'offhook') {
                if (document.getElementById('transfer').style.display === '') {
                    transfer();
                }
            } else {
                call(document.getElementById('dial'));
            }
        }
    });

    function call(btn) {
        if (chromePhone.getStatus() === 'ringing') {
            chromePhone.answer();
        } else {
            if (!document.getElementById('number').value) {
                if (chromePhone.getLastDialedNumber()) {
                    document.getElementById('number').value =
                        chromePhone.setPhoneNumber(chromePhone.getLastDialedNumber());
                }
                return;
            }
            uiOnDial(btn);
            chromePhone.call(document.getElementById('servers').value);
        }
    }

    function transfer() {
        if (!document.getElementById('number').value) return;
        chromePhone.transfer(document.getElementById('number').value);
        if (document.getElementById('tx').dataset.action !== 'tx') {
            uiToggleTransfer(false);
        }
    }

});
