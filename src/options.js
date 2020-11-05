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
    hijack_links: false
};

let local_opts = {
    media_input: '',
    media_output: ''
};

function save_options_ui() {
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
    local_opts.media_input = document.getElementById('media_input').value;
    local_opts.media_output = document.getElementById('media_output').value;
    chrome.storage.local.set(local_opts, function() {
        chrome.storage.sync.set(sync_opts, function() {
            // Update status to let user know options were saved.
            let status = document.getElementById('status');
            status.textContent = 'Options saved.';
            setTimeout(function() {
                status.textContent = '';
            }, 5000);
            chrome.extension.getBackgroundPage().chromePhone.updateOptions(sync_opts, local_opts);
        });
    });
}

function restore_options_ui() {
    // is the options page
    if (document.getElementById('options')) {

        if (chrome.extension.getBackgroundPage().chromePhone.connectedToExternalAPI()) {
            document.getElementById('load').style.display = '';
        }

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
            if (bg.chromePhone.hasMicAccess()) {
                let mediaInputSelect = document.getElementById('media_input');
                populateSelect(mediaInputSelect, bg.chromePhone.getAudioInputs(), local_items.media_input);
                let mediaOutputSelect = document.getElementById('media_output');
                populateSelect(mediaOutputSelect, bg.chromePhone.getAudioOutputs(), local_items.media_output);
                document.querySelectorAll('.option.media').forEach(function(e) {e.style.display = '';})
            }

            chrome.storage.sync.get(sync_opts, function(sync_items) {
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
            });

        });

        document.getElementById('save').addEventListener('click', save_options_ui);
        document.getElementById('load').addEventListener('click', function () {
            chrome.extension.getBackgroundPage().chromePhone.loadSettingsFromExternalAPI(document);
        });
    }
}

document.addEventListener('DOMContentLoaded', restore_options_ui);
