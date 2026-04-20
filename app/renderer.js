"use strict";

const Sentry = require("@sentry/electron/renderer");
const Gettings = require("./helpers/settings.js");
const { version: appVersion, vars: pkgVars } = require("../package.json");

// Use var instead of const to avoid conflicts with app.js
const fsRenderer = require("fs");
const pathRenderer = require("path");

const env = process.env;
let featToggle = {};

// Capture console errors and write to log file
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function writeToLogFile(message) {
	try {
		const logFilePath = pathRenderer.join(__dirname, '..', 'udeler.log');
		const timestamp = new Date().toLocaleString();
		const logLine = `[${timestamp}] CONSOLE: ${message}\n`;
		fsRenderer.appendFileSync(logFilePath, logLine, 'utf8');
	} catch (err) {
		// Silently fail if can't write to log
	}
}

console.error = function(...args) {
	const message = args.map(arg => {
		if (arg instanceof Error) {
			return `${arg.message}\n${arg.stack}`;
		}
		return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
	}).join(' ');
	writeToLogFile(`ERROR: ${message}`);
	originalConsoleError.apply(console, args);
};

console.warn = function(...args) {
	const message = args.map(arg =>
		typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
	).join(' ');
	writeToLogFile(`WARN: ${message}`);
	originalConsoleWarn.apply(console, args);
};

// Capture unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
	writeToLogFile(`UNHANDLED_PROMISE_REJECTION: ${event.reason}`);
	console.error('Unhandled Promise Rejection:', event.reason);
});

// Capture global errors
window.addEventListener('error', (event) => {
	writeToLogFile(`GLOBAL_ERROR: ${event.message}\n${event.filename}:${event.lineno}:${event.colno}`);
	console.error('Global Error:', event.error);
});

if (!env.DEBUG_MODE) {
	fetch(pkgVars.urlToggles)
		.then((resp) => resp.json())
		.then((json) => {
			featToggle = json;
			Sentry.init({ dsn: featToggle.enableSentry ? (env.SENTRY_DSN || "") : "" });
			console.log(featToggle.enableSentry ? "Sentry is enabled" : "Sentry is disabled");
		})
		.catch(() => { /* toggle fetch failed, continue without Sentry */ });
}

const localeMeta = require("./locale/meta.json");
let localeJson;

function translate(text) {
	const language = Gettings.language;

	if (language == "English" || !language) {
		return text;
	} else {
		try {
			if (!localeJson) {
				const localeFile = localeMeta[language];
				if (!localeFile) {
					console.warn(`Locale file not found for language: ${language}`);
					return text;
				}
				localeJson = require(`./locale/${localeFile}`);
			}

			return localeJson[text] || text;
		} catch (e) {
			console.error(e);
			return text;
		}
	}
}

function translateWrite(text) {
	document.write(translate(text));
}

function urlDonate() {
	return `${pkgVars.urlDonate}&item_name=${translate("Udeler is free and without any ads. If you appreciate that, please consider donating to the Developer.").replace(" ", "+")}`;
}
