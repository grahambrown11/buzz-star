function uiOnDial(e) {
    e.style.display = 'none';
    document.getElementById('oncall').style.display = '';
    var top = document.querySelector('.chrome-phone');
    var className = top.className;
    className = className.replace(/w3-border-(green|black)/, 'w3-border-red');
    top.className = className;
}

function uiOnHangup() {
    document.getElementById('oncall').style.display = 'none';
    document.getElementById('dial').style.display = '';
    document.getElementById('number').value = '';
    var top = document.querySelector('.chrome-phone');
    var className = top.className;
    className = className.replace(/w3-border-(red|black)/, 'w3-border-green');
    top.className = className;
    document.getElementById('dial').innerHTML = 'Dial';
}

function uiUpdateStatus() {
    var top = document.querySelector('.chrome-phone');
    var className = top.className;
    if (chromePhone.getStatus() === 'offhook') {
        uiOnDial(document.getElementById('dial'));
        className = className.replace(/w3-border-(black|green)/, 'w3-border-red');
        document.querySelector('.chrome-phone').className = className;
        updateMute();
        updateHold();
    } else if (chromePhone.getStatus() === 'onhook') {
        className = className.replace(/w3-border-(black|red)/, 'w3-border-green');
        document.querySelector('.chrome-phone').className = className;
        uiOnHangup();
    } else if (chromePhone.getStatus() === 'ringing') {
        className = className.replace(/w3-border-(black|green)/, 'w3-border-red');
        document.querySelector('.chrome-phone').className = className;
        document.getElementById('dial').innerHTML = 'Answer';
    } else {
        className = className.replace(/w3-border-(red|green)/, 'w3-border-black');
        document.querySelector('.chrome-phone').className = className;
    }
    if (chromePhone.isLoggedIn()) {
        document.getElementById('login').style.display = 'none';
        document.getElementById('logout').style.display = '';
        document.getElementById('dial-pad').style.display = '';
        document.getElementById('number').value = chromePhone.getPhoneNumber();
    } else {
        document.getElementById('login').style.display = 'none';
        if (chromePhone.canLoggedIn()) {
            document.getElementById('login').style.display = '';
        }
        document.getElementById('logout').style.display = 'none';
        document.getElementById('dial-pad').style.display = 'none';
    }
    updateMessages();
}

function updateMute() {
    var mute = document.getElementById('mute');
    if (chromePhone.isMuted()) {
        mute.title = 'Unmute';
        mute.querySelector('i').className = 'fa fa-microphone-slash';
    } else {
        mute.title = 'Mute';
        mute.querySelector('i').className = 'fa fa-microphone';
    }
}

function updateHold() {
    var hold = document.getElementById('hold');
    if (chromePhone.isOnHold()) {
        hold.title = 'Resume';
        hold.querySelector('i').className = 'fa fa-play';
    } else {
        hold.title = 'Hold';
        hold.querySelector('i').className = 'fa fa-pause';
    }
}

function updateMessages() {
    if (chromePhone.getErrorMessage()) {
        var err = document.getElementById('error');
        err.innerHTML = chromePhone.getErrorMessage();
        err.style.display = '';
    } else {
        document.getElementById('error').style.display = 'none';
    }
    if (chromePhone.getInfoMessage()) {
        var inf = document.getElementById('info');
        inf.innerHTML = chromePhone.getInfoMessage();
        inf.style.display = '';
    } else {
        document.getElementById('info').style.display = 'none';
    }
}

function updateFromBackground() {
    uiUpdateStatus();
}

document.addEventListener('DOMContentLoaded', function() {

    // check we're running as an extension
    if ('chrome' in window && chrome.extension) {
        var bg = chrome.extension.getBackgroundPage();
        window.chromePhone = bg.chromePhone;
        if (!window.chromePhone.hasMicAccess()) {
            var mic = document.getElementById('mic-access');
            mic.style.display = '';
            mic.href = chrome.extension.getURL('microphone.html');
        }
        uiUpdateStatus();
    } else {
        // not an extension add scripts
        var s2 = document.getElementsByTagName('script')[0];
        var s1 = document.createElement('script');
        s1.src = 'chrome-phone.js';
        s2.parentNode.insertBefore(s1, s2);
        setTimeout(function() {
            uiUpdateStatus();
        }, 250);
    }

    var keys = document.querySelectorAll('.dial-pad .key');
    for (var i=0; i < keys.length; i++) {
        keys[i].addEventListener('mousedown', function() {
            chromePhone.startDTMF(this.dataset.value);
        });
        keys[i].addEventListener('mouseup', function() {
            chromePhone.stopDTMF();
            if (chromePhone.isOnCall()) {
                chromePhone.sendDTMF(this.dataset.value);
            } else {
                var e = document.getElementById('number');
                e.value += this.dataset.value;
                chromePhone.setPhoneNumber(e.value);
            }
        });
    }

    document.getElementById('number').addEventListener('keyup', function(e) {
        chromePhone.setPhoneNumber(this.value);
    });

    document.getElementById('number').addEventListener('paste', function() {
        chromePhone.setPhoneNumber(this.value);
    });

    document.getElementById('number-clear').addEventListener('click', function() {
        document.getElementById('number').value = '';
        chromePhone.setPhoneNumber('');
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
            this.dataset.action = 'go';
            this.querySelector('i').className = 'fa fa-long-arrow-right';
        } else {
            this.dataset.action = 'tx';
            this.querySelector('i').className = 'fa fa-exchange';
        }
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
