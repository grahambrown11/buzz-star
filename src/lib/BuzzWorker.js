'use strict';

import Logger from './Logger.js';

const logger = new Logger("BuzzWorker");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (typeof request.action !== 'undefined') {
        let sendAsyncRes = true;
        (async () => {
            let api_allowed = false;
            switch (request.action) {
                case 'get-options':
                    logger.debug('onMessage, request: %o', request);
                    await loadSyncOptions();
                    await loadLocalOptions();
                    const opts = {
                        sync_opts: cache.sync_opts,
                        local_opts: cache.local_opts
                    }
                    logger.debug('opts: %o', opts);
                    sendResponse(opts);
                    break;
                case 'store-options':
                    logger.debug('onMessage, request: %o', request);
                    await chrome.storage.local.set(request.data.local_opts);
                    cache.local_opts = request.data.local_opts;
                    await chrome.storage.sync.set(request.data.sync_opts);
                    cache.sync_opts = request.data.sync_opts;
                    sendResponse(true);
                    break;
                case 'add-log':
                    logger.debug('onMessage, request: %o', request);
                    sendAsyncRes = false;
                    await addLog(request.data);
                    break;
                case 'get-log':
                    logger.debug('onMessage, request: %o', request);
                    await loadLog();
                    sendResponse(cache.buzzLog);
                    break;
                case 'inject':
                    logger.debug('onMessage, request: %o', request);
                    await loadSyncOptions();
                    if (sender && sender.tab && cache.external_api_url_regex && cache.external_api_url_regex.test(sender.tab.url)) {
                        api_allowed = true;
                    }
                    logger.debug('send response api_allowed: %o, tel_links: %o', api_allowed, cache.sync_opts.hijack_links);
                    sendResponse({
                        api_allowed: api_allowed,
                        tel_links: cache.sync_opts.hijack_links
                    });
                    break;
                case 'check-external-api':
                    logger.debug('onMessage, request: %o', request);
                    await loadSyncOptions();
                    if (cache.external_api_url_regex && cache.external_api_url_regex.test(request.data)) {
                        api_allowed = true;
                    }
                    logger.debug('onMessage, request: %o', request);
                    sendResponse({
                        api_allowed: api_allowed
                    });
                    break;
                case 'popout-window':
                    logger.debug('onMessage, request: %o', request);
                    await popoutWindow();
                    break;
                case 'update-status':
                    logger.debug('onMessage, request: %o', request);
                    sendAsyncRes = false;
                    await updateStatus(request.data.status);
                    break;
                case 'add-call-log':
                    logger.debug('onMessage, request: %o', request);
                    sendAsyncRes = false;
                    await addCallLog(request.data);
                    break;
                case 'get-call-log':
                    logger.debug('onMessage, request: %o', request);
                    await loadCallLog();
                    sendResponse(cache.callLog);
                    break;
                case 'get-last-dialed-number':
                    logger.debug('onMessage, request: %o', request);
                    await loadLastDialedNumber();
                    sendResponse(cache.lastDialedNumber);
                    break;
                case 'is-idle':
                    logger.debug('onMessage, request: %o', request);
                    const idle = await isIdle();
                    sendResponse(idle);
                    break;
                case 'open-mic-permission':
                    logger.debug('onMessage, request: %o', request);
                    sendAsyncRes = false;
                    await openMicPermissionPopout();
                    break;
                case 'show-notification':
                    logger.debug('onMessage, request: %o', request);
                    await showNotification(request.data);
                    break;
                default:
                    sendAsyncRes = false;
            }
        })();
        return sendAsyncRes;
    } else {
        logger.warn('missing action');
    }
});

chrome.notifications.onButtonClicked.addListener(function (id, button) {
    logger.debug('notification ' + id + ' button ' + button + ' clicked');
    if (button === 0) {
        chrome.runtime.sendMessage({action: 'answer'}).then();
    } else {
        chrome.runtime.sendMessage({action: 'hangup'}).then();
    }
});

chrome.notifications.onClicked.addListener(async function () {
    await popoutWindow();
});

chrome.notifications.onClosed.addListener(async function () {
    await chrome.storage.session.remove('notification_id');
});

const default_sync_opts = {
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

const default_local_opts = {
    media_input: '',
    media_output: '',
    ring_output: '',
    ring_tone: '0'
};

const cache = {
    sync_opts: undefined,
    local_opts: undefined,
    external_api_url_regex: undefined,
    popoutWindowId: undefined,
    buzzLog: undefined,
    callLog: undefined,
    lastDialedNumber: undefined
};

const chromeIdleQueryState = (detectionInterval) =>
    new Promise((resolve) => {
        chrome.idle.queryState(detectionInterval, (result) => {
            resolve(result);
        });
    });

async function createOffscreen() {
    if (await chrome.offscreen.hasDocument()) {
        logger.debug('BuzzWorker created');
        return;
    }
    logger.debug("Create offscreen document");
    await chrome.offscreen.createDocument({
        url: "offscreen.html",
        // only a single reason supported, but need these: "AUDIO_PLAYBACK", "USER_MEDIA", "WEB_RTC"
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: "Need microphone & speaker access",
    });
}

async function loadSyncOptions() {
    if (!cache.sync_opts) {
        cache.sync_opts = await chrome.storage.sync.get(default_sync_opts);
        if (cache.sync_opts.external_api) {
            cache.external_api_url_regex = new RegExp(cache.sync_opts.external_api);
        }
    }
}

async function loadLocalOptions() {
    if (!cache.local_opts) {
        cache.local_opts = await chrome.storage.local.get(default_local_opts);
    }
}

async function openMicPermissionPopout() {
    await chrome.windows.create({
        focused: true,
        width: 500,
        height: 300,
        top: 0,
        left: 0,
        type: 'popup',
        url: chrome.runtime.getURL('microphone.html')
    });
}

async function loadLog() {
    if (typeof cache.buzzLog === 'undefined') {
        const storage = await chrome.storage.local.get('buzz_log');
        if (typeof storage.buzz_log === 'undefined' || !Array.isArray(storage.buzz_log)) {
            cache.buzzLog = [];
        } else {
            cache.buzzLog = storage.buzz_log;
        }
    }
}

async function addLog(message) {
    await loadLog();
    cache.buzzLog.unshift({time: new Date().getTime(), message: message});
    // limiting the list to 50
    if (cache.buzzLog.length > 50) {
        cache.buzzLog.pop();
    }
    await chrome.storage.local.set({buzz_log: cache.buzzLog});
}

async function popoutWindow() {
    let ses = await chrome.storage.session.get('popout_window_id');
    logger.debug('popoutWindow %o', ses);
    let popoutWindowId = undefined;
    if (ses.popout_window_id) {
        popoutWindowId = parseInt(ses.popout_window_id);
    }
    let info = {
        focused: true,
        width: 220,
        height: 600,
        top: 0,
        left: 0
    };
    let currentWin = await chrome.windows.getCurrent();
    if (currentWin.width > info.width) {
        info.left = Math.round((currentWin.width / 2) - (info.width / 2));
    }
    if (currentWin.height > info.height) {
        info.top = Math.round((currentWin.height / 2) - (info.height / 2));
    }
    if (popoutWindowId) {
        logger.debug('updating existing window...');
        await chrome.windows.update(popoutWindowId, info);
    } else {
        logger.debug('creating new window...');
        info.url = chrome.runtime.getURL('popup.html') + '?type=popout';
        info.type = 'popup';
        chrome.windows.create(info, async function (win) {
            if (win) {
                logger.debug('popout created %d', win.id);
                await chrome.storage.session.set({popout_window_id: win.id});
            }
        });
    }
}

chrome.windows.onRemoved.addListener(async (windowId) => {
    logger.debug('window closed %d', windowId);
    let ses = await chrome.storage.session.get('popout_window_id');
    let popoutWindowId = undefined;
    if (ses.popout_window_id) {
        popoutWindowId = parseInt(ses.popout_window_id);
    }
    if (popoutWindowId === windowId) {
        await chrome.storage.session.remove('popout_window_id');
    }
});


function getIcons(color) {
    return {
        '16': 'img/icon-' + color + '-16.png',
        '32': 'img/icon-' + color + '-32.png',
        '48': 'img/icon-' + color + '-48.png',
        '128': 'img/icon-' + color + '-128.png'
    };
}

async function updateStatus(status) {
    let icons = getIcons('blue');
    if (status === 'offhook' || status === 'ringing') {
        icons = getIcons('red');
    } else if (status === 'onhook') {
        icons = getIcons('green');
    }
    logger.debug('set icon: %o', icons);
    await chrome.action.setIcon({path: icons});
    if (status !== 'ringing') {
        await clearNotification();
    }
}

async function loadCallLog() {
    if (typeof cache.callLog === 'undefined') {
        const storage = await chrome.storage.local.get('call_log');
        if (typeof storage.call_log === 'undefined' || !Array.isArray(storage.call_log)) {
            cache.callLog = [];
        } else {
            cache.callLog = storage.call_log;
        }
    }
}

async function addCallLog(data) {
    await loadCallLog();
    cache.callLog.unshift(data);
    // limiting the list to 20
    if (cache.callLog.length > 20) {
        cache.callLog.pop();
    }
    await chrome.storage.local.set({call_log: cache.callLog});
    if (data.type === 'Outgoing') {
        cache.lastDialedNumber = data.number;
        await chrome.storage.local.set({last_dialed_number: data.lastDialedNumber});
    }
}

async function loadLastDialedNumber() {
    if (typeof cache.lastDialedNumber === 'undefined') {
        const storage = await chrome.storage.local.get('last_dialed_number');
        if (typeof storage.last_dialed_number === 'undefined') {
            cache.lastDialedNumber = '';
        } else {
            cache.lastDialedNumber = storage.last_dialed_number;
        }
    }
}

async function isIdle() {
    const hasIdleAccess = await chrome.permissions.contains({permissions: ['idle']});
    logger.debug('IdleState Permission: %o', hasIdleAccess);
    if (hasIdleAccess) {
        // if idle for more than 15 minutes
        const idleState = await chromeIdleQueryState((15 * 60));
        logger.debug('IdleState: %o', idleState);
        return idleState !== 'active';
    }
    // return false if no permissions...
    return true;
}

async function showNotification(data) {
    let stored = await chrome.storage.session.get('notification_id');
    await chrome.notifications.create(stored.notification_id, data, async function (id) {
        await chrome.storage.session.set({notification_id: id});
    });
}

async function clearNotification() {
    let stored = await chrome.storage.session.get('notification_id');
    if (stored.notification_id) {
        await chrome.notifications.clear(stored.notification_id);
        await chrome.storage.session.remove('notification_id');
    }
}

(async () => {
    logger.debug("Service Worker Start");
    await createOffscreen();
})();
