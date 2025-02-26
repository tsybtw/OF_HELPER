var path = require('path');
var {fileURLToPath} = require('url');
var execa = require('execa');
var arch = require('arch');

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

const binarySuffix = arch() === 'x64' ? 'x86_64' : 'i686';

// Binaries from: https://github.com/sindresorhus/win-clipboard
const windowBinaryPath = path.join(__dirname, `../fallbacks/windows/clipboard_${binarySuffix}.exe`);

const clipboard = {
	copy: async options => execa(windowBinaryPath, ['--copy'], options),
	paste: async options => {
		const {stdout} = await execa(windowBinaryPath, ['--paste'], options);
		return stdout;
	},
	copySync: options => execa.sync(windowBinaryPath, ['--copy'], options),
	pasteSync: options => execa.sync(windowBinaryPath, ['--paste'], options).stdout,
};

module.exports = clipboard;
