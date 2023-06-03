'use strict';

function showStatus(statusText) {
    console.log(statusText);
    let status = document.getElementById('status');
    status.textContent = statusText;
    setTimeout(function() {
        status.textContent = '';
    }, 5000);
}

function save_options_ui() {
    chrome.runtime.sendMessage({action: 'check-on-call'}, (res) => {
        if (res) {
            showStatus('Cannot save while on a call');
        } else {
            const data = {
                sync_opts: {
                    sip_1: {
                        host: document.getElementById('sip_1_host').value,
                        port: document.getElementById('sip_1_port').value,
                        path: document.getElementById('sip_1_path').value,
                        extension: document.getElementById('sip_1_extension').value,
                        password: document.getElementById('sip_1_password').value,
                        ice: document.getElementById('sip_1_ice').value,
                    },
                    sip_2: {
                        host: document.getElementById('sip_2_host').value,
                        port: document.getElementById('sip_2_port').value,
                        path: document.getElementById('sip_2_path').value,
                        extension: document.getElementById('sip_2_extension').value,
                        password: document.getElementById('sip_2_password').value,
                        ice: document.getElementById('sip_2_ice').value,
                    },
                    external_api: document.getElementById('external_api').value,
                    auto_login: document.getElementById('auto_login').checked,
                    hijack_links: document.getElementById('hijack_links').checked,
                    auto_answer: document.getElementById('auto_answer').checked,
                    start_popout: document.getElementById('start_popout').checked,
                },
                local_opts: {
                    media_input: document.getElementById('media_input').value,
                    media_output: document.getElementById('media_output').value,
                    ring_output: document.getElementById('ring_output').value,
                    ring_tone: document.getElementById('ring_tone').value,
                }
            };
            chrome.runtime.sendMessage({
                action: 'store-options',
                data: data
            }, () => {
                showStatus('Options saved.');
                if (data.sync_opts.auto_answer) {
                    chrome.permissions.request({permissions: ['idle']}, function(granted) {
                        console.log('Idle permission granted: ' + granted);
                    });
                }
            });
        }
    });
}

chrome.runtime.onMessage.addListener((request, sender) => {
    if (typeof request.action !== 'undefined') {
        switch (request.action) {
            case 'external-api-change':
                if (request.data) {
                    document.getElementById('load').style.display = '';
                } else {
                    document.getElementById('load').style.display = 'none';
                }
                break;
            case 'update-media':
                populateMediaSelects(request.data);
                break;
            case 'populate-options':
                setServer(1, request.data.sip_1 ? request.data.sip_1 : {});
                setServer(2, request.data.sip_2 ? request.data.sip_2 : {});
                break;
        }
    }
});

function populateSelect(select, items, value) {
    let selected = 0;
    select.innerHTML = '';
    for (let i = 0; i < items.length; i++) {
        let option = document.createElement('option');
        option.value = items[i].id;
        option.text = items[i].name;
        select.appendChild(option);
        if (items[i].id === value)
            selected = i;
    }
    setTimeout(function() {
        select.options.selectedIndex = selected;
    }, 100);
}

function populateMediaSelects(data) {
    let mediaInputSelect = document.getElementById('media_input');
    populateSelect(mediaInputSelect, data.audioInputs, data.currentAudioInputId);
    let mediaOutputSelect = document.getElementById('media_output');
    populateSelect(mediaOutputSelect, data.audioOutputs, data.currentAudioOutputId);
    let ringOutputSelect = document.getElementById('ring_output');
    populateSelect(ringOutputSelect, data.audioOutputs, data.currentRingOutputId);
    document.querySelectorAll('.option.media').forEach((e) => e.style.display = '');
}

function setServer(idx, data) {
    document.getElementById('sip_' + idx + '_host').value = data.host ? data.host : '';
    document.getElementById('sip_' + idx + '_port').value = data.port ? data.port : '';
    document.getElementById('sip_' + idx + '_path').value = data.path ? data.path : '';
    document.getElementById('sip_' + idx + '_extension').value = data.extension ? data.extension : '';
    document.getElementById('sip_' + idx + '_password').value = data.password ? data.password : '';
    document.getElementById('sip_' + idx + '_ice').value = data.ice ? data.ice : '';
}


function restore_options_ui() {
    chrome.runtime.sendMessage({action: 'get-options'}, (data) => {
        console.log('options:', data);
        setServer(1, data.sync_opts.sip_1 ? data.sync_opts.sip_1 : {});
        setServer(2, data.sync_opts.sip_2 ? data.sync_opts.sip_2 : {});
        document.getElementById('external_api').value = data.sync_opts.external_api;
        document.getElementById('auto_login').checked = data.sync_opts.auto_login;
        document.getElementById('hijack_links').checked = data.sync_opts.hijack_links;
        document.getElementById('auto_answer').checked = data.sync_opts.auto_answer;
        document.getElementById('start_popout').checked = data.sync_opts.start_popout;
        chrome.runtime.sendMessage({action: 'get-media'}, (media) => {
            populateMediaSelects(media);
            let ringToneSelect = document.getElementById('ring_tone');
            populateSelect(ringToneSelect, media.ringTones, data.local_opts.ring_tone);
        });
        chrome.runtime.sendMessage({action: 'get-status'}, (status) => {
            if (status.externalAPI) {
                document.getElementById('load').style.display = '';
            }
        });
    });
    document.getElementById('save').addEventListener('click', save_options_ui);
    document.getElementById('load').addEventListener('click', function () {
        chrome.runtime.sendMessage({action: 'load-options-from-api'}).then();
    });
    let playTest = function(elem, ringtone, other) {
        if (elem.innerText === 'Test') {
            chrome.runtime.sendMessage({
                action: 'test-media',
                data: {
                    action: 'play',
                    ringtone: ringtone ? document.getElementById('ring_tone').value : -1,
                    audioDeviceId: document.getElementById('media_output').value,
                    ringDeviceId: document.getElementById('ring_output').value,
                }
            }, () => {
                elem.innerText = 'Stop';
                other.style.display = 'none';
            });
        } else {
            chrome.runtime.sendMessage({
                action: 'test-media',
                data: {
                    action: 'stop',
                }
            }, () => {
                elem.innerText = 'Test';
                other.style.display = '';
            });
        }
    }
    document.getElementById('media_output_test').addEventListener('click', function() {
        console.log('test media output')
        playTest(this, false, document.getElementById('ring_output_test'));
    });
    document.getElementById('ring_output_test').addEventListener('click', function() {
        console.log('test ring output')
        playTest(this, true, document.getElementById('media_output_test'));
    });
}

document.addEventListener('DOMContentLoaded', restore_options_ui);
document.addEventListener('unload', () => {
    chrome.runtime.sendMessage({
        action: 'test-media',
        data: {
            action: 'stop',
        }
    }).then();
});
