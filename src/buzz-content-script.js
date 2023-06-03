// Buzz* Content Script

(() => {

    let api_allowed = false;
    let tel_links = false;
    /** @type chrome.runtime.Port */
    let port = undefined;

    console.log('Buzz* Content Script');

    chrome.runtime.sendMessage({action: 'inject'}, (response) => {
        console.log('res:', response);
        if (response.api_allowed) {
            console.log('Allow External BuzzAPI');
            api_allowed = true;
            if (!window.buzzApi) {
                const s = document.createElement('script');
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
            console.log('Connecting to Buzz*');
            port = chrome.runtime.connect();
            port.onMessage.addListener((msg) => {
                console.log('Content script received (port): ', msg);
                window.postMessage({
                    type: 'FROM_EXTENSION',
                    data: msg
                }, '*');
            });
            port.onDisconnect.addListener((msg) => {
                console.log('Content script port disconnected', msg);
                port = undefined;
                window.postMessage({
                    type: 'FROM_EXTENSION',
                    data: {
                        action: 'disconnected'
                    }
                }, '*');
            });
        } catch (err) {
            console.error('Cannot connect to Buzz* - ' + err);
            window.postMessage({
                type: 'FROM_EXTENSION',
                data: {
                    action: 'error',
                    error: 'Cannot connect to Buzz*, try refresh',
                    cause: err
                }
            }, '*');
            port = undefined;
        }
    }

    window.addEventListener('message', (event) => {
        if (event.data.type && event.data.type === 'FROM_PAGE') {
            console.log('Content script received event from page: ', event);
            if (api_allowed && !port) {
                console.log('not connected yet...');
                connect();
            }
            if (port) {
                if (event.data.data && event.data.data.action) {
                    try {
                        const dataForBuzz = {
                            action: event.data.data.action
                        }
                        let err = undefined;
                        if (dataForBuzz.action === 'call') {
                            if (event.data.data.phoneNumber) {
                                dataForBuzz.phoneNumber = event.data.data.phoneNumber.replace(/[^\d\*\#]/g, '');
                            }
                            if (!dataForBuzz.phoneNumber) {
                                err = 'Missing phoneNumber';
                            }
                        } else if (dataForBuzz.action === 'set-settings') {
                            if (event.data.data.settings) {
                                dataForBuzz.settings = {}
                                if (event.data.data.settings.sip_1) {
                                    dataForBuzz.settings.sip_1 = {
                                        host: event.data.data.settings.sip_1.host,
                                        port: event.data.data.settings.sip_1.port,
                                        path: event.data.data.settings.sip_1.path,
                                        extension: event.data.data.settings.sip_1.extension,
                                        password: event.data.data.settings.sip_1.password,
                                        ice: event.data.data.settings.sip_1.ice,
                                    }
                                }
                                if (event.data.data.settings.sip_2) {
                                    dataForBuzz.settings.sip_2 = {
                                        host: event.data.data.settings.sip_2.host,
                                        port: event.data.data.settings.sip_2.port,
                                        path: event.data.data.settings.sip_2.path,
                                        extension: event.data.data.settings.sip_2.extension,
                                        password: event.data.data.settings.sip_2.password,
                                        ice: event.data.data.settings.sip_2.ice,
                                    }
                                }
                            } else {
                                err = 'Missing settings';
                            }
                        } else if (['ping', 'login', 'answer', 'hangup'].indexOf(dataForBuzz.action) === -1) {
                            err = 'Unsupported action: ' + dataForBuzz.action;
                        }
                        if (err) {
                            window.postMessage({
                                type: 'FROM_EXTENSION',
                                data: {
                                    action: 'error',
                                    error: err
                                }
                            }, '*');
                        } else {
                            console.log('sending data to Buzz*', event.data.data);
                            port.postMessage(dataForBuzz);
                        }
                    } catch (err) {
                        console.error('Cannot connect to Buzz* - ' + err);
                        window.postMessage({
                            type: 'FROM_EXTENSION',
                            data: {
                                action: 'error',
                                error: 'Cannot connect to Buzz*, try refresh',
                                cause: err
                            }
                        }, '*');
                        port = undefined;
                    }
                } else {
                    window.postMessage({
                        type: 'FROM_EXTENSION',
                        data: {
                            action: 'error',
                            error: 'Missing action'
                        }
                    }, '*');
                }
            }
        }
    }, false);

    document.addEventListener('DOMContentLoaded', () => {
        if (tel_links) {
            document.querySelectorAll('a[href^="tel:"]').forEach((elem) => {
                elem.addEventListener('click', (event) => {
                    let phoneNumber = this.href.substring(4).replace(/\D/g, '');
                    if (phoneNumber.length > 0) {
                        chrome.runtime.sendMessage({
                            action: 'call',
                            phoneNumber: phoneNumber
                        }).then(() => console.log('Sent Number to Buzz*'));
                        event.preventDefault();
                        return false;
                    }
                });
            });
        }
    });

})();
