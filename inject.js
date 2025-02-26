(function() {
    const OriginalDate = Date;
    const offset = -10 * 60 * 1000;
  
    function FakeDate(...args) {
      if (args.length === 0) {
        return new OriginalDate(OriginalDate.now() + offset);
      }
      return new OriginalDate(...args);
    }
    FakeDate.now = function() {
      return OriginalDate.now() + offset;
    };
    FakeDate.parse = OriginalDate.parse;
    FakeDate.UTC = OriginalDate.UTC;
    FakeDate.prototype = OriginalDate.prototype;
  
    function checkDOMAndSwitch() {
      const calendar = document.querySelector('.vdatetime-popup__title');
      const dropzone = document.querySelector('.b-post-piece.b-dropzone__preview');
      
      if (calendar) {
        if (window.Date !== OriginalDate) {
          window.Date = OriginalDate;
        }
      } 
      else if (!dropzone) {
        if (window.Date !== FakeDate) {
          window.Date = FakeDate;
        }
      }
    }
  
    function startObserving() {
      let debounceTimer = null;
      const observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          checkDOMAndSwitch();
        }, 50);
      });
  
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  
    console.log('Initial time offset enabled');
    window.Date = FakeDate;
    startObserving();
  })();
  