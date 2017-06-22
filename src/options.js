// Save/Restore options to chrome.storage.sync.
var opts = {
    sip_server: '',
    sip_extension: '',
    sip_password: '',
    sip_ice: ''
};

function save_options_ui() {
    opts.sip_server = document.getElementById('sip_server').value;
    opts.sip_extension = document.getElementById('sip_extension').value;
    opts.sip_password = document.getElementById('sip_password').value;
    opts.sip_ice = document.getElementById('sip_ice').value;
    chrome.storage.sync.set(opts, function() {
        // Update status to let user know options were saved.
        var status = document.getElementById('status');
        status.textContent = 'Options saved.';
        var bg = chrome.extension.getBackgroundPage();
        var chromePhone = bg.chromePhone;
        chromePhone.init(opts);
        setTimeout(function() {
            status.textContent = '';
        }, 1500);
    });
}

function restore_options_ui() {
    // is the options page
    if (document.getElementById('options')) {
        chrome.storage.sync.get(opts, function(items) {
            opts = items;
            document.getElementById('sip_server').value = opts.sip_server;
            document.getElementById('sip_extension').value = opts.sip_extension;
            document.getElementById('sip_password').value = opts.sip_password;
            document.getElementById('sip_ice').value = opts.sip_ice;
        });
        document.getElementById('save').addEventListener('click', save_options_ui);
    }
}

document.addEventListener('DOMContentLoaded', restore_options_ui);
