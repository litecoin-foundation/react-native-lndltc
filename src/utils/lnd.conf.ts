/* Allows the conf to be kept in one place and passed to the native modules when lnd is started */

import { ENetworks, TLndConf, TLndConfSection } from './types';

const defaultRegtestConf = {
	'Application Options': {
		debuglevel: 'info',
		nolisten: true,
		tlsdisableautofill: true,
		norest: true
	},
	Routing: {
		'routing.assumechanvalid': true
	},
	Litecoin: {
		'litecoin.active': true,
		'litecoin.regtest': true,
		'litecoin.node': 'litecoind'
	},
	watchtower: {
		'watchtower.active': false
	},
	Litecoind: {
		'litecoind.rpchost': '127.0.0.1',
		'litecoind.rpcuser': 'username',
		'litecoind.rpcpass': 'password',
		'litecoind.zmqpubrawblock': 'tcp://127.0.0.1:29334',
		'litecoind.zmqpubrawtx': 'tcp://127.0.0.1:29335'
	}
};

const defaultTestnetLitecoindConf = {
	'Application Options': {
		debuglevel: 'info',
		maxbackoff: '2s',
		nolisten: true,
		tlsdisableautofill: true,
		norest: true
	},
	Routing: {
		'routing.assumechanvalid': true
	},
	Litecoin: {
		'litecoin.active': true,
		'litecoin.testnet': true,
		'litecoin.node': 'neutrino'
	},
	Neutrino: {
		'neutrino.connect': '178.62.46.1955:19333'
	}
};

const defaultMainnetLitecoindConf = {
	'Application Options': {
		debuglevel: 'info',
		maxbackoff: '2s',
		nolisten: true,
		tlsdisableautofill: true,
		norest: true
	},
	Routing: {
		'routing.assumechanvalid': true
	},
	Litecoin: {
		'litecoin.active': true,
		'litecoin.mainnet': true,
		'litecoin.node': 'neutrino',
		'litecoin.dnsseed': 'lseed.lightning.loshan.co.uk'
	},
	Neutrino: {
		'neutrino.connect': '178.62.46.195:9333'
	}
};

class LndConf {
	readonly network: ENetworks;
	readonly customFields: TLndConf;

	constructor(network: ENetworks, customFields: TLndConf = {}) {
		this.network = network;
		this.customFields = customFields;
	}

	private mergeConf(conf1: TLndConf, conf2: TLndConf): TLndConf {
		const mergedConf: TLndConf = {};
		Object.keys(conf1).forEach((heading) => {
			const section: TLndConfSection = conf1[heading];
			let customSectionFields: TLndConfSection = {};

			if (conf2[heading]) {
				customSectionFields = conf2[heading];
			}

			mergedConf[heading] = { ...section, ...customSectionFields };
		});

		// Merge headings that didn't exist in conf1 but exist in conf2
		Object.keys(conf2).forEach((heading) => {
			if (!mergedConf[heading]) {
				mergedConf[heading] = conf2[heading];
			}
		});

		return mergedConf;
	}

	private getDefaultConf(): TLndConf {
		let defaultConfObj: TLndConf;

		switch (this.network) {
			case ENetworks.regtest: {
				defaultConfObj = defaultRegtestConf;
				break;
			}
			case ENetworks.testnet: {
				defaultConfObj = defaultTestnetLitecoindConf;
				break;
			}
			case ENetworks.mainnet: {
				defaultConfObj = defaultMainnetLitecoindConf;
				break;
			}
		}

		return defaultConfObj;
	}

	build(): string {
		const defaultConfObj = this.getDefaultConf();
		const mergedConf = this.mergeConf(defaultConfObj, this.customFields);

		// Build lnd.conf string
		let confContent = '';
		Object.keys(mergedConf).forEach((heading) => {
			confContent += `[${heading}]\n`;

			const section: TLndConfSection = mergedConf[heading];
			Object.keys(section).forEach((key: string) => {
				const value = section[key];

				// If it's an array then add multi line items
				if (Array.isArray(value)) {
					value.forEach((valueItem) => {
						confContent += `${key}=${valueItem}\n`;
					});
				} else {
					confContent += `${key}=${String(value)}\n`;
				}
			});

			confContent += '\n';
		});

		return confContent;
	}
}

export default LndConf;
