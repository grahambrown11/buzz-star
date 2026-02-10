// need to check permission for mic
(async () => {
    const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
    console.log('mic perm:', permissionStatus);
    if (permissionStatus.state === 'granted') {
        chrome.runtime.sendMessage({action: 'check-mic'}).then(() => {
            window.close();
        });
    } else if (permissionStatus.state === 'denied') {
        document.getElementById('ask').style.display = 'none';
        document.getElementById('declined').style.display = '';
        document.querySelector('header').style.marginTop = '';
        const settingsUrl = `chrome://settings/content/siteDetails?site=${chrome.runtime.getURL('')}`;
        console.log('settingsUrl', settingsUrl);
        document.querySelector('#declined a').addEventListener('click', (e) => {
            chrome.tabs.create({ url: settingsUrl });
            window.close();
            e.preventDefault();
            return false;
        });
    } else {
        navigator.getUserMedia({audio: true}, function(stream) {
            console.log('got access to mic');
            stream.getAudioTracks()[0].stop();
            chrome.runtime.sendMessage({action: 'check-mic'}).then(() => {
                window.close();
            });
        }, function(err) {
            console.log('error: '+ err.name);
        });
    }
})();
