# react-native-lndltc

### Description
This library simplies React Native apps adding [LNDltc](https://github.com/ltcsuite/lnd) integration.

## Getting started

```bash
bun i @litecoinfoundation/react-native-lndltc
````

### iOS installation
```bash
cd ios && pod install && cd ../
````

### Android installation

open `android/app/build.gradle` and add the below line to `dependencies`

`implementation files("../../lightning/Lndmobile.aar")`

## Usage
```javascript
import lnd, {
    ENetworks,
    LndConf,
	ss_lnrpc
} from '@litecoinfoundation/react-native-lndltc';

const lndConf = new LndConf(ENetworks.regtest);
```

```javascript
const res = await lnd.start(lndConf);
if (res.isErr()) {
    //Lnd failed to start
    console.error(res.error)
}

//LND state changes
lnd.stateService.subscribeToStateChanges(
	(res: Result<ss_lnrpc.WalletState>) => {
		if (res.isOk()) {
			setLndState(res.value);
		}
	},
	() => {
        //Subscription has ended
    },
);


//Subscribe to LND logs
const logListener = lnd.addLogListener((message) => {
    console.log(message);
});

//Unsubscribe if listening component is unmounted
lnd.removeLogListener(logListener);

//All function results can be checked with res.isOk() or res.isErr()
const res = await lnd.getInfo();
if (res.isErr()) {
    console.log(res.error.message);
}

if (res.isOk()) {
    console.log(res.value);
}

//Use subscribeToOnChainTransactions/subscribeToInvoices for real time transaction updates
lnd.subscribeToOnChainTransactions(
    (res) => {
        if (res.isOk()) {
            const { amount, blockHeight, numConfirmations } = res.value;
            
            alert(`Received ${amount} sats on chain in block ${blockHeight}`)
        }
    },
    (res) => {
        //If this fails ever then we need to subscribe again
        console.error(res);
    },
);


```

### Using neutrino headers cache
Initial neutrino sync times can take a while for first time users. This is a trusted setup that allows the app to download a cached pre-synced archive of the neutrino headers. This speeds up the time it takes for LND to become usable as syncing doesn't need to start from scratch.
```bash
#Add these dependencies to your app
bun i react-native-fs react-native-zip-archive   

cd ios && pod install && cd ../
````

Using it:

```javascript
import lndCache from '@litecoinfoundation/react-native-lndltc/dist/utils/neutrino-cache';
```

```javascript
lndCache.addStateListener(
    (state: ICachedNeutrinoDBDownloadState) => {
      setMessage(JSON.stringify(state));
    },
);

await lndCache.downloadCache(ENetworks.testnet);
await startLnd();
```
