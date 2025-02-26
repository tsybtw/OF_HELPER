var ncp = require('./index.js');

var text = 'copy paste me!!!';

ncp.writeSync(text);

if (ncp.readSync() === text) console.log('Test 1: OK');
else console.log('Test 2: Error');