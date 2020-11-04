// need to ask permission for mic
navigator.getUserMedia({audio: true}, function(stream) {
    console.log('got access to mic');
    stream.getAudioTracks()[0].stop();
    if (chrome && chrome.runtime) {
        chrome.runtime.sendMessage({action: 'check-mic'});
    }
    window.close();
}, function(err) {
    console.log('error: '+ err.name);
});
