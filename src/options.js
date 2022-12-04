// Save/Restore options to chrome.storage.sync.
let sync_opts = {
    sip_1: {
        host: '',
        port: '',
        path: '',
        extension: '',
        password: '',
        ice: '',
    },
    sip_2: {
        host: '',
        port: '',
        path: '',
        extension: '',
        password: '',
        ice: '',
    },
    auto_login: true,
    external_api: '',
    hijack_links: false,
    auto_answer: false,
    start_popout: false
};

let local_opts = {
    media_input: '',
    media_output: '',
    ring_output: '',
    ring_tone: '0'
};

let chromePhone = chrome.extension.getBackgroundPage().chromePhone;

function showStatus(statusText) {
    let status = document.getElementById('status');
    status.textContent = statusText;
    setTimeout(function() {
        status.textContent = '';
    }, 5000);
}

function save_options_ui() {
    if (chromePhone.isOnCall()) {
        showStatus('Cannot save while on a call');
        return;
    }
    sync_opts.sip_1.host = document.getElementById('sip_1_host').value;
    sync_opts.sip_1.port = document.getElementById('sip_1_port').value;
    sync_opts.sip_1.path = document.getElementById('sip_1_path').value;
    sync_opts.sip_1.extension = document.getElementById('sip_1_extension').value;
    sync_opts.sip_1.password = document.getElementById('sip_1_password').value;
    sync_opts.sip_1.ice = document.getElementById('sip_1_ice').value;
    sync_opts.sip_2.host = document.getElementById('sip_2_host').value;
    sync_opts.sip_2.port = document.getElementById('sip_2_port').value;
    sync_opts.sip_2.path = document.getElementById('sip_2_path').value;
    sync_opts.sip_2.extension = document.getElementById('sip_2_extension').value;
    sync_opts.sip_2.password = document.getElementById('sip_2_password').value;
    sync_opts.sip_2.ice = document.getElementById('sip_2_ice').value;
    sync_opts.external_api = document.getElementById('external_api').value;
    sync_opts.auto_login = document.getElementById('auto_login').checked;
    sync_opts.hijack_links = document.getElementById('hijack_links').checked;
    sync_opts.auto_answer = document.getElementById('auto_answer').checked;
    sync_opts.start_popout = document.getElementById('start_popout').checked;
    local_opts.media_input = document.getElementById('media_input').value;
    local_opts.media_output = document.getElementById('media_output').value;
    local_opts.ring_output = document.getElementById('ring_output').value;
    local_opts.ring_tone = document.getElementById('ring_tone').value;
    chrome.storage.local.set(local_opts, function() {
        console.log('saved local_opts', local_opts);
        chrome.storage.sync.set(sync_opts, function() {
            console.log('saved sync_opts', sync_opts);
            // Update status to let user know options were saved.
            showStatus('Options saved.');
            chromePhone.updateOptions(sync_opts, local_opts);
        });
    });
    if (sync_opts.auto_answer) {
        chrome.permissions.request({permissions: ['idle']}, function(granted) {
            console.log('Idle permission granted: ' + granted);
        });
    }
}

function restore_options_ui() {
    // is the options page
    if (document.getElementById('options')) {

        let broadcast = new BroadcastChannel('buzz_bus');
        broadcast.onmessage = function(e) {
            console.log('buzz_bus message received', e.data);
            if (e.source !== window && e.data && e.data.action) {
                if (e.data.action === 'updateMediaDevices') {
                    populateMediaSelects();
                } else if (e.data.action === 'externalAPIChange') {
                    checkExternalAPI();
                }
            }
        }

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

        function populateMediaSelects() {
            if (chromePhone.hasMicAccess()) {
                let mediaInputSelect = document.getElementById('media_input');
                populateSelect(mediaInputSelect, chromePhone.getAudioInputs(), local_opts.media_input);
                let mediaOutputSelect = document.getElementById('media_output');
                populateSelect(mediaOutputSelect, chromePhone.getAudioOutputs(), local_opts.media_output);
                let ringOutputSelect = document.getElementById('ring_output');
                populateSelect(ringOutputSelect, chromePhone.getAudioOutputs(), local_opts.ring_output);
                let ringToneSelect = document.getElementById('ring_tone');
                populateSelect(ringToneSelect, chromePhone.getRingTones(), local_opts.ring_tone);
                document.querySelectorAll('.option.media').forEach(function(e) {e.style.display = '';})
            }
        }

        function checkExternalAPI() {
            if (chromePhone.connectedToExternalAPI()) {
                document.getElementById('load').style.display = '';
            } else {
                document.getElementById('load').style.display = 'none';
            }
        }

        chrome.storage.local.get(local_opts, function(local_items) {
            console.log('local_items', local_items);
            local_opts = local_items;

            populateMediaSelects();

            chrome.storage.sync.get(sync_opts, function(sync_items) {
                console.log('sync_items', sync_items);
                document.getElementById('sip_1_host').value = sync_items.sip_1.host;
                document.getElementById('sip_1_port').value = sync_items.sip_1.port;
                document.getElementById('sip_1_path').value = sync_items.sip_1.path;
                document.getElementById('sip_1_extension').value = sync_items.sip_1.extension;
                document.getElementById('sip_1_password').value = sync_items.sip_1.password;
                document.getElementById('sip_1_ice').value = sync_items.sip_1.ice;
                document.getElementById('sip_2_host').value = sync_items.sip_2.host;
                document.getElementById('sip_2_port').value = sync_items.sip_2.port;
                document.getElementById('sip_2_path').value = sync_items.sip_2.path;
                document.getElementById('sip_2_extension').value = sync_items.sip_2.extension;
                document.getElementById('sip_2_password').value = sync_items.sip_2.password;
                document.getElementById('sip_2_ice').value = sync_items.sip_2.ice;
                document.getElementById('external_api').value = sync_items.external_api;
                document.getElementById('auto_login').checked = sync_items.auto_login;
                document.getElementById('hijack_links').checked = sync_items.hijack_links;
                document.getElementById('auto_answer').checked = sync_items.auto_answer;
                document.getElementById('start_popout').checked = sync_items.start_popout;
                checkExternalAPI();
            });

        });

        document.getElementById('save').addEventListener('click', save_options_ui);
        document.getElementById('load').addEventListener('click', function () {
            chromePhone.loadSettingsFromExternalAPI(document);
        });
        let playTest = function(elem, ringtone) {
            if (elem.innerText === 'Test') {
                chromePhone.startPlaybackTest(
                    ringtone,
                    document.getElementById('media_output').value,
                    document.getElementById('ring_output').value
                );
                elem.innerText = 'Stop';
            } else {
                chromePhone.stopPlaybackTest(ringtone);
                elem.innerText = 'Test';
            }
        }
        document.getElementById('media_output_test').addEventListener('click', function() {
            console.log('test media output')
            playTest(this, false);
        });
        document.getElementById('ring_output_test').addEventListener('click', function() {
            console.log('test ring output')
            playTest(this, true);
        });
        document.getElementById('ring_tone').addEventListener('change', function(e) {
            console.log('ring tone change to %s', e.target.value)
            chromePhone.setRingTone(e.target.value, true);
        });
    }
}

document.addEventListener('DOMContentLoaded', restore_options_ui);
