// Buzz* Content Script

console.log("Buzz Content Script Loaded");

(function () {

    let auto = false;
    let port = undefined;

    chrome.runtime.sendMessage({action: 'auto'}, function(response) {
        console.log('reponse from extension: ', response);
        if (response.allowed) {
            auto = true;
        }
    });

    function connect() {
        port = chrome.runtime.connect();
        port.onMessage.addListener(function(msg) {
            console.log("Content script received (port): ", msg);
            window.postMessage({type: 'FROM_EXTENSION', data: msg});
        });
    }

    window.addEventListener("message", function (event) {
        if (event.source !== window) return;
        console.log("Content script received (window): ", event);
        if (event.data.type && event.data.type === 'FROM_PAGE') {
            console.log("from page...");
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

    if (!window.buzzApi) {
        var s = document.createElement("script");
        s.type = "text/javascript";
        s.src = chrome.runtime.getURL("buzz-api.js");
        console.log("Inject Buzz API Script - " + s.src);
        (document.head || document.documentElement).appendChild(s);
    }
})();
