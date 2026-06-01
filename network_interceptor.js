(function() {
    const originalFetch = window.fetch;
    const originalXHR = window.XMLHttpRequest;

    function handleResponse(url, data) {
        if (!url) return;
        try {
            if (url.includes('/api2/v2/campaigns/chart') ||
                url.includes('/api2/v2/users/me/stats/overview') ||
                url.includes('/api2/v2/subscriptions/subscribers/chart') ||
                url.includes('/api2/v2/campaigns')) {
                
                window.postMessage({
                    type: 'OF_NETWORK_INTERCEPT',
                    url: url,
                    data: typeof data === 'string' ? JSON.parse(data) : data
                }, '*');
            }
        } catch (e) {
        }
    }

    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const url = args[0] instanceof Request ? args[0].url : args[0];
        
        if (typeof url === 'string' && (
            url.includes('/api2/v2/campaigns/chart') ||
            url.includes('/api2/v2/users/me/stats/overview') ||
            url.includes('/api2/v2/subscriptions/subscribers/chart') ||
            url.includes('/api2/v2/campaigns')
        )) {
            const clone = response.clone();
            clone.json().then(data => {
                handleResponse(url, data);
            }).catch(e => {
            });
        }
        return response;
    };

    const XHR_OPEN = originalXHR.prototype.open;
    const XHR_SEND = originalXHR.prototype.send;

    originalXHR.prototype.open = function(method, url, async, user, password) {
        this._interceptUrl = url;
        return XHR_OPEN.apply(this, arguments);
    };

    originalXHR.prototype.send = function(data) {
        this.addEventListener('load', function() {
            if (this.responseType === '' || this.responseType === 'text' || this.responseType === 'json') {
                const responseData = this.responseType === 'json' ? this.response : this.responseText;
                handleResponse(this._interceptUrl, responseData);
            }
        });
        return XHR_SEND.apply(this, arguments);
    };
})();
