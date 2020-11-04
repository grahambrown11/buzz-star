function BuzzApi() {

    let callback = undefined;

    function init() {
        window.addEventListener('message', function(event) {
            if (event.source !== window)
                return;
            if (event.data.type && (event.data.type === 'FROM_EXTENSION')) {
                console.log('API received from content script: ', event);
                if (callback) {
                    callback(event.data.data);
                }
            }
        }, false);
    }

    /**
     * Set a function to receive messages from Buzz*
     * @param cb the function to call
     */
    this.setCallback = function(cb) {
        callback = cb;
    };

    /**
     * Post an action to Buzz*
     */
    this.sendAction = function(action) {
        window.postMessage({type: 'FROM_PAGE', data: action});
    }

    /**
     * Ping Buzz*, should get a pong via the callback
     */
    this.ping = function() {
        this.sendAction({action: 'ping'});
    }

    /**
     * Send the Answer action
     */
    this.login = function() {
        this.sendAction({action: 'login'});
    }

    /**
     * Send a action to phone
     * @param phoneNumber the number to dial
     */
    this.dial = function(phoneNumber) {
        this.sendAction({
            action: 'call',
            phoneNumber: phoneNumber
        });
    };

    /**
     * Send the Answer action
     */
    this.answer = function() {
        this.sendAction({action: 'answer'});
    }

    /**
     * Send the settings to Buzz*
     * @param settings the settings to send
     */
    this.sendSettings = function(settings) {
        this.sendAction({
            action: ' set-settings',
            settings: settings
        });
    }

    init();

}

(function() {
    if (!window.buzzApi) {
        window.buzzApi = new BuzzApi();
    }
})();
