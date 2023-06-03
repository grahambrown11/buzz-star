// need to ask permission for mic
navigator.getUserMedia({audio: true}, function(stream) {
    console.log('got access to mic');
    stream.getAudioTracks()[0].stop();
    chrome.runtime.sendMessage({action: 'check-mic'}).then(() => {
        window.close();
    });
}, function(err) {
    console.log('error: '+ err.name);
});
