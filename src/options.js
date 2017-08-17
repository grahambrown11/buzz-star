// Save/Restore options to chrome.storage.sync.
let sync_opts = {
    sip_server: '',
    sip_extension: '',
    sip_password: '',
    sip_ice: '',
    sip_server_2: '',
    sip_extension_2: '',
    sip_password_2: '',
    sip_ice_2: '',
    auto_login: true
};

let local_opts = {
    media_input: '',
    media_output: ''
};

function save_options_ui() {
    sync_opts.sip_server = document.getElementById('sip_server').value;
    sync_opts.sip_extension = document.getElementById('sip_extension').value;
    sync_opts.sip_password = document.getElementById('sip_password').value;
    sync_opts.sip_ice = document.getElementById('sip_ice').value;
    sync_opts.sip_server_2 = document.getElementById('sip_server_2').value;
    sync_opts.sip_extension_2 = document.getElementById('sip_extension_2').value;
    sync_opts.sip_password_2 = document.getElementById('sip_password_2').value;
    sync_opts.sip_ice_2 = document.getElementById('sip_ice_2').value;
    sync_opts.auto_login = document.getElementById('auto_login').checked;
    local_opts.media_input = document.getElementById('media_input').value;
    local_opts.media_output = document.getElementById('media_output').value;
    chrome.storage.local.set(local_opts, function() {
        chrome.storage.sync.set(sync_opts, function() {
            // Update status to let user know options were saved.
            let status = document.getElementById('status');
            status.textContent = 'Options saved.';
            let bg = chrome.extension.getBackgroundPage();
            bg.chromePhone.init(sync_opts, local_opts);
            setTimeout(function() {
                status.textContent = '';
            }, 1500);
        });
    });
}

function restore_options_ui() {
    // is the options page
    if (document.getElementById('options')) {

        chrome.storage.local.get(local_opts, function(local_items) {

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
                setTimeout(function() {
                    select.options.selectedIndex = selected;
                }, 100);
            }

            let bg = chrome.extension.getBackgroundPage();
            let mediaInputSelect = document.getElementById('media_input');
            populateSelect(mediaInputSelect, bg.chromePhone.getAudioInputs(), local_items.media_input);
            let mediaOutputSelect = document.getElementById('media_output');
            populateSelect(mediaOutputSelect, bg.chromePhone.getAudioOutputs(), local_items.media_output);

            chrome.storage.sync.get(sync_opts, function(sync_items) {
                document.getElementById('sip_server').value = sync_items.sip_server;
                document.getElementById('sip_extension').value = sync_items.sip_extension;
                document.getElementById('sip_password').value = sync_items.sip_password;
                document.getElementById('sip_ice').value = sync_items.sip_ice;
                document.getElementById('sip_server_2').value = sync_items.sip_server_2;
                document.getElementById('sip_extension_2').value = sync_items.sip_extension_2;
                document.getElementById('sip_password_2').value = sync_items.sip_password_2;
                document.getElementById('sip_ice_2').value = sync_items.sip_ice_2;
                document.getElementById('auto_login').checked = sync_items.auto_login;
            });

        });

        document.getElementById('save').addEventListener('click', save_options_ui);
    }
}

document.addEventListener('DOMContentLoaded', restore_options_ui);
