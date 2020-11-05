// Buzz* Content Script

(function () {

    let auto = false;
    let port = undefined;

    chrome.runtime.sendMessage({action: 'auto'}, function(response) {
        if (response.allowed) {
            console.log('Allow External BuzzAPI');
            auto = true;
            if (!window.buzzApi) {
                var s = document.createElement('script');
                s.type = 'text/javascript';
                s.src = chrome.runtime.getURL('buzz-api.js');
                console.log('Inject Buzz API Script - ' + s.src);
                (document.head || document.documentElement).appendChild(s);
            }
        }
    });

    function connect() {
        port = chrome.runtime.connect();
        port.onMessage.addListener(function(msg) {
            console.log('Content script received (port): ', msg);
            window.postMessage({type: 'FROM_EXTENSION', data: msg});
        });
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        console.log('Content script received (window): ', event);
        if (event.data.type && event.data.type === 'FROM_PAGE') {
            console.log('from page...');
            if (auto && !port) {
                connect();
            }
            if (event.data.data && event.data.data.action) {
                if (port) {
                    port.postMessage(event.data.data);
                } else {
                    chrome.runtime.sendMessage(event.data.data);
                }
            }
        }
    }, false);

    document.addEventListener('DOMContentLoaded', function () {
        chrome.runtime.sendMessage({action: 'tel-links'}, function(response) {
            if (response.allowed) {
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
    });

})();
