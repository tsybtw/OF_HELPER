const script = document.createElement('script');
script.src = chrome.runtime.getURL('network_interceptor.js');
(document.head || document.documentElement).appendChild(script);
script.onload = function() {
    script.remove();
};

window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    if (event.data && event.data.type === 'OF_NETWORK_INTERCEPT') {
        try {
            const urlKey = event.data.url.split('?')[0];
            
            let existing = sessionStorage.getItem('OF_NETWORK_DATA') ? JSON.parse(sessionStorage.getItem('OF_NETWORK_DATA')) : {};
            existing[event.data.url] = event.data.data;
            existing[urlKey] = event.data.data;
            
            sessionStorage.setItem('OF_NETWORK_DATA', JSON.stringify(existing));
        } catch (e) {
        }
    }
});
