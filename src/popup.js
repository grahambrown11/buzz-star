function uiOnDial(e) {
    e.style.display = 'none';
    document.getElementById('oncall').style.display = '';
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
    document.getElementById('number').value = '';
    document.getElementById('tx').dataset.action = 'tx';
    document.getElementById('tx').title = 'Transfer';
    let top = document.querySelector('.buzz-inner');
    let className = top.className;
    className = className.replace(/w3-border-(red|black)/, 'w3-border-green');
    top.className = className;
    document.getElementById('dial').innerHTML = 'Dial';
}

function uiUpdateStatus() {
    function updateIcon(color) {
        let icon = document.querySelector("link[rel~='icon']");
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
        document.getElementById('dial').innerHTML = 'Answer';
        updateIcon('red');
    } else {
        className = className.replace(/w3-border-(red|green)/, 'w3-border-black');
        document.querySelector('.buzz-inner').className = className;
        updateIcon('blue');
    }
    if (chromePhone.isLoggedIn()) {
        document.getElementById('login').style.display = 'none';
        document.getElementById('logout').style.display = '';
        document.getElementById('dial-pad').style.display = '';
        document.getElementById('number').value = chromePhone.getPhoneNumber();
        document.getElementById('number').focus();
    } else {
        document.getElementById('login').style.display = 'none';
        if (chromePhone.canLoggedIn()) {
            document.getElementById('login').style.display = '';
        }
        document.getElementById('logout').style.display = 'none';
        document.getElementById('dial-pad').style.display = 'none';
    }
    uiUpdateMessages();
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

document.addEventListener('DOMContentLoaded', function() {

    console.log('Popup loaded, url=' + window.location.href);

    if (window.location.href.indexOf('type=popout') !== -1) {
        document.getElementById('popout').style.display = 'none';
    } else {
        document.getElementById('popout').addEventListener('click', function() {
            chromePhone.popoutWindow();
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
                } else if (e.data.action === 'updateStatus') {
                    uiUpdateStatus();
                } else if (e.data.action === 'updateMute') {
                    uiUpdateMute();
                } else if (e.data.action === 'updateHold') {
                    uiUpdateHold();
                } else if (e.data.action === 'setPhoneNumber') {
                    document.getElementById('number').value = chromePhone.getPhoneNumber();
                }
            }
        };
        let bg = chrome.extension.getBackgroundPage();
        window.chromePhone = bg.chromePhone;
        if (!window.chromePhone.hasMicAccess()) {
            let mic = document.getElementById('mic-access');
            mic.style.display = '';
            mic.href = chrome.extension.getURL('microphone.html');
        }
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

    let keys = document.querySelectorAll('.dial-pad .key');
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

    document.getElementById('mute').addEventListener('click', function() {
        this.querySelector('i').className = '';
        chromePhone.mute();
    });

    document.getElementById('hold').addEventListener('click', function() {
        this.querySelector('i').className = '';
        chromePhone.hold();
    });

    document.getElementById('tx').addEventListener('click', function() {
        if (this.dataset.action === 'tx') {
            this.dataset.action = 'cancel';
            this.title = 'Cancel Transfer';
            chromePhone.hold();
            document.getElementById('number').value = '';
            document.getElementById('hangup').style.display = 'none';
            document.getElementById('transfer').style.display = '';
        } else {
            this.title = 'Transfer';
            chromePhone.hold();
            document.getElementById('hangup').style.display = '';
            document.getElementById('transfer').style.display = 'none';
            document.getElementById('number').value = chromePhone.getPhoneNumber();
            this.dataset.action = 'tx';
        }
    });

    document.getElementById('transfer').addEventListener('click', function() {
        chromePhone.transfer(document.getElementById('number').value);
        document.getElementById('hangup').style.display = '';
        document.getElementById('transfer').style.display = 'none';
        document.getElementById('tx').dataset.action = 'tx';
        document.getElementById('tx').title = 'Transfer';
    });

    document.getElementById('settings').addEventListener('click', function() {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('login').addEventListener('click', function() {
        this.style.display = 'none';
        chromePhone.login(false);
    });

    document.getElementById('logout').addEventListener('click', function() {
        this.style.display = 'none';
        chromePhone.logout();
    });

    document.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            call(document.getElementById('dial'));
        }
    });

    function call(btn) {
        if (chromePhone.getStatus() === 'ringing') {
            chromePhone.answer();
        } else {
            if (!document.getElementById('number').value) return;
            uiOnDial(btn);
            chromePhone.call(false);
        }
    }

});
