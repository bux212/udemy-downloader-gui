/**
 * @typedef {Enumerator} DownloadTypeSetting
 * @property {number} Both
 * @property {number} OnlyLectures
 * @property {number} OnlyAttachments
 */

/**
 * @typedef {Object} DownloadSetting
 * @property {boolean} checkNewVersion
 * @property {string} defaultSubtitle
 * @property {string} path
 * @property {boolean} autoStartDownload
 * @property {boolean} continueDonwloadingEncrypted
 * @property {boolean} enableDownloadStartEnd
 * @property {number} downloadStart
 * @property {boolean} downloadEnd
 * @property {string} videoQuality
 * @property {DownloadTypeSetting} type
 * @property {boolean} skipSubtitles
 * @property {boolean} seqZeroLeft
 * @property {boolean} autoRetry
 */

/**
 * @typedef {Object} DownloadHistory
 * @property {number} id
 * @property {boolean} completed
 * @property {string} date
 * @property {number} encryptedVideos
 * @property {string} selectedSubtitle
 * @property {string} pathDownloaded
 */

/**
 * @typedef {Object} DownloadedCourses
 * @property {number} id
 * @property {string} url
 * @property {string} title
 * @property {string} image
 * @property {number} individualProgress
 * @property {number} combinedProgress
 * @property {boolean} completed
 * @property {string} progressStatus
 * @property {number} encryptedVideos
 * @property {string} selectedSubtitle
 * @property {string} pathDownloaded
 */

const Settings = (() => {
	"use strict";

	const path = require("path");
	const fs = require("fs");
	const { homedir } = require("os");

	// Use IPC to access settings through main process
	const useIPC = false; // Disable IPC - use direct file access with nodeIntegration

	/** @type {DownloadTypeSetting} */
	const DownloadType = Object.freeze({
		Both: 0,
		OnlyLectures: 1,
		OnlyAttachments: 2,
	});

	/** @type {DownloadSetting} */
	const DownloadDefaultOptions = Object.freeze({
		checkNewVersion: true,
		defaultSubtitle: undefined,
		path: path.join(homedir(), "Downloads", "Udeler"),
		autoStartDownload: false,
		continueDonwloadingEncrypted: false,
		enableVoiceTranslation: true,
		translationTargetLang: "ru",
		translationStartDelaySec: 7,
		translationMaxRetries: 3,
		enableDownloadStartEnd: false,
		downloadStart: 0,
		downloadEnd: 0,
		type: DownloadType.Both,
		skipSubtitles: false,
		autoRetry: false,
		videoQuality: "Auto",
		seqZeroLeft: false,
	});

	let _language = null;
	let _prettify = false;
	let settingsCache = {};
	let settingsFilePath = null;

	// Settings file path - use homedir directly (synchronous)
	function getSettingsFilePath() {
		if (!settingsFilePath) {
			const homePath = homedir();
			settingsFilePath = path.join(homePath, 'AppData', 'Roaming', 'Udeler', 'settings.json');
		}
		return settingsFilePath;
	}

	function readSettings() {
		try {
			const filePath = getSettingsFilePath();
			if (fs.existsSync(filePath)) {
				const data = fs.readFileSync(filePath, 'utf8');
				return JSON.parse(data);
			}
		} catch (error) {
			console.error('Error reading settings:', error);
		}
		return {};
	}

	function writeSettings(data) {
		try {
			const filePath = getSettingsFilePath();
			fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
		} catch (error) {
			console.error('Error writing settings:', error);
		}
	}

	function getValueAtPath(obj, path) {
		const keys = path.split('.');
		let current = obj;
		for (const key of keys) {
			if (current === undefined || current === null) return undefined;
			current = current[key];
		}
		return current;
	}

	function setValueAtPath(obj, path, value) {
		const keys = path.split('.');
		let current = obj;
		for (let i = 0; i < keys.length - 1; i++) {
			if (!(keys[i] in current)) {
				current[keys[i]] = {};
			}
			current = current[keys[i]];
		}
		current[keys[keys.length - 1]] = value;
	}

	const settings = {
		get: (keyPath, defaultValue = undefined) => {
			if (useIPC && window.electronAPI && window.electronAPI.settingsGet) {
				return window.electronAPI.settingsGet(keyPath, defaultValue);
			}
			// Fallback to direct file access
			const allSettings = readSettings();
			const value = getValueAtPath(allSettings, keyPath);
			return value !== undefined ? value : defaultValue;
		},
		set: (keyPath, value) => {
			if (useIPC && window.electronAPI && window.electronAPI.settingsSet) {
				return window.electronAPI.settingsSet(keyPath, value);
			}
			// Fallback to direct file access
			const allSettings = readSettings();
			setValueAtPath(allSettings, keyPath, value);
			writeSettings(allSettings);
		}
	};

	/**
	 * Ensures all default keys are set in the settings
	 * @internal
	 * @returns {void}
	 */
	function ensureDefaultKeys() {
		if (!settings.get("language")) {
			settings.set("language", getLanguage());
		}

		if (!settings.get("subdomain")) {
			settings.set("subdomain", "www");
		}

		if (!settings.get("download")) {
			settings.set("download", DownloadDefaultOptions);
		} else {
			// certifica que exista todas as propriedades
			Object.keys(DownloadDefaultOptions).forEach((key) => {
				const keyPath = `download.${key}`;
				if (settings.get(keyPath) === undefined) {
					settings.set(keyPath, DownloadDefaultOptions[key], { prettify: _prettify });
				}
			});
		}
	}

	/**
	 * Get navigator default language and set in settings "language"
	 *
	 * @returns defined language
	 */
	function getLanguage() {
		try {
			let language = settings.get("language");

			if (!language) {
				const navigatorLang = navigator.language.substring(0, 2);
				const meta = require("../locale/meta.json");

				language = Object.keys(meta).find((key) => meta[key] === (navigatorLang === "pt" ? "pt_BR.json" : `${navigatorLang}.json`));

				if (language) {
					settings.set("language", language, { prettify: _prettify });
				}
			}

			return language || "English";
		} catch (error) {
			console.error("Error_Settings getLanguage(): " + error);
			return "English";
		}
	}

	/**
	 * Get the download directory for a given course
	 * @param {string} courseName - The name of the course
	 * @returns {string} - The download directory path
	 */
	function downloadDirectory(courseName = "") {
		const download_dir = settings.get("download.path") || DownloadDefaultOptions.path;
		return path.join(download_dir, courseName);
	}

	// Initialize settings
	(function init() {
		console.log("Initialize settings");
		_prettify = process.env.PRETTIFY_SETTINGS || false;
		ensureDefaultKeys();
	})();

	return {
		DownloadType,
		DownloadDefaultOptions,
		/** @param {String, Object} */
		get: (keyPath, defaultValue = undefined) => settings.get(keyPath, defaultValue),
		/** @param {String, Object} */
		set: (keyPath, value) => settings.set(keyPath, value, { prettify: _prettify }),
		/** @type {string} */
		get language() {
			if (!_language) {
				_language = getLanguage();
			}
			return _language;
		},
		/** @type {string} */
		set language(value) {
			this.set("language", value || null);
			_language = value;
		},
		/** @type {string} */
		get subDomain() {
			return this.get("subdomain", "www");
		},
		/** @type {string} */
		set subDomain(value) {
			this.set("subdomain", value);
		},
		/** @type {string} */
		get accessToken() {
			return this.get("access_token");
		},
		/** @type {string} */
		set accessToken(value) {
			this.set("access_token", value || null);
		},
		/** @type {boolean} */
		get subscriber() {
			return Boolean(this.get("subscriber"));
		},
		/** @type {boolean} */
		set subscriber(value) {
			this.set("subscriber", value);
		},
		/** @type {DownloadSetting} */
		get download() {
			return this.get("download");
		},
		/** @type {DownloadSetting} */
		set download(value) {
			this.set("download", value);
		},
		/** @type {Array<DownloadHistory>} */
		get downloadHistory() {
			return this.get("downloadedHistory", []);
		},
		/** @type {Array<DownloadHistory>} */
		set downloadHistory(value) {
			this.set("downloadedHistory", value);
		},
		/** @type {Array<DownloadedCourses>} */
		get downloadedCourses() {
			return this.get("downloadedCourses");
		},
		/** @type {Array<DownloadedCourses>} */
		set downloadedCourses(value) {
			this.set("downloadedCourses", value);
		},
		/** @param {String} */
		downloadDirectory: (courseName) => downloadDirectory(courseName),
	};
})();

module.exports = Settings;
