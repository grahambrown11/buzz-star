// Buzz* Content Script

(function () {

    let api_allowed = false;
    let tel_links = false;
    let port = undefined;

    chrome.runtime.sendMessage({action: 'inject'}, function(response) {
        if (response.api_allowed) {
            console.log('Allow External BuzzAPI');
            api_allowed = true;
            if (!window.buzzApi) {
                var s = document.createElement('script');
                s.type = 'text/javascript';
                s.src = chrome.runtime.getURL('buzz-api.js');
                console.log('Inject Buzz API Script - ' + s.src);
                (document.head || document.documentElement).appendChild(s);
            }
        }
        if (response.tel_links) {
            tel_links = true;
        }
    });

    function connect() {
        try {
            port = chrome.runtime.connect();
            port.onMessage.addListener(function (msg) {
                console.log('Content script received (port): ', msg);
                window.postMessage({type: 'FROM_EXTENSION', data: msg}, '*');
            });
            port.onDisconnect.addListener(function (msg) {
                console.log('Content script port disconnected', msg);
                port = undefined;
            });
        } catch (err) {
            console.error('Cannot connect to Buzz* - ' + err);
            window.postMessage({type: 'FROM_EXTENSION', data: {
                error: 'Cannot connect to Buzz*, try refresh', cause: err}}, '*');
            port = undefined;
        }
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        console.log('Content script received (window): ', event);
        if (event.data.type && event.data.type === 'FROM_PAGE') {
            console.log('from page...');
            if (api_allowed && !port) {
                connect();
            }
            if (port && event.data.data && event.data.data.action) {
                try {
                    port.postMessage(event.data.data);
                } catch (err) {
                    console.error('Cannot connect to Buzz* - ' + err);
                    window.postMessage({type: 'FROM_EXTENSION', data: {
                        error: 'Cannot connect to Buzz*, try refresh', cause: err}}, '*');
                    port = undefined;
                }
            }
        }
    }, false);

    document.addEventListener('DOMContentLoaded', function () {
        if (tel_links) {
            document.querySelectorAll('a[href^="tel:"]').forEach(function (e) {
                e.addEventListener('click', function (t) {
                    let phoneNumber = this.href.substr(4).replace(/\D/g, '');
                    if (phoneNumber.length > 0) {
                        chrome.runtime.sendMessage({
                            action: 'call',
                            phoneNumber: phoneNumber
                        });
                        console.log('Sent Number to Buzz*');
                        t.preventDefault();
                        return false;
                    }
                });
            });
        }
    });

})();
