import { NativeModules, NativeModulesStatic } from 'react-native';
import base64 from 'base64-js';
import GrpcAction from './grpc';
import { err, ok, Result } from './utils/result';
import {
	EGrpcStreamMethods,
	EGrpcSyncMethods,
	ENetworks,
	EStreamEventTypes,
	TLogListener
} from './utils/types';
import { lnrpc } from './protos/rpc';
import LndConf from './utils/lnd.conf';
import { bytesToHexString, hexStringToBytes, stringToBytes } from './utils/helpers';
import { ss_lnrpc } from './index';
import StateService from './services/stateservice';
import WalletUnlocker from './services/walletunlocker';
import WatchtowerClient from './services/wtclient';

class LND {
	private readonly grpc: GrpcAction;
	private readonly lnd: NativeModulesStatic;
	private currentConf?: LndConf = undefined;
	readonly stateService: StateService;
	readonly walletUnlocker: WalletUnlocker;
	readonly watchtowerClient: WatchtowerClient;

	/**
	 * Array of callbacks to be fired off when a new log entry arrives.
	 * Developers are responsible for adding and removing listeners.
	 *
	 * @type {TLogListener[]}
	 */
	private readonly logListeners: TLogListener[];

	constructor() {
		this.lnd = NativeModules.ReactNativeLightning;
		this.grpc = new GrpcAction(this.lnd);
		this.stateService = new StateService(this.grpc);
		this.walletUnlocker = new WalletUnlocker(this.grpc);
		this.watchtowerClient = new WatchtowerClient(this.grpc);
		this.logListeners = [];

		this.grpc.lndEvent.addListener(EStreamEventTypes.Logs, this.processLogListeners.bind(this));
	}

	/**
	 * Starts the LND service
	 * @return {Promise<Err<unknown> | Ok<string>>}
	 * @param conf
	 */
	async start(conf: LndConf): Promise<Result<string>> {
		const stateRes = await this.stateService.getState();
		if (stateRes.isErr()) {
			return err(stateRes.error);
		}

		if (stateRes.value !== ss_lnrpc.WalletState.WAITING_TO_START) {
			return ok('LND already running');
		}

		try {
			const res = await this.lnd.start(conf.build(), conf.network);
			this.currentConf = conf;
			return ok(res);
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * Callback passed though will get triggered for each LND log item
	 * @param callback
	 * @returns {string}
	 */
	addLogListener(callback: (log: string) => void): string {
		const id = new Date().valueOf().toString() + Math.random().toString();
		this.logListeners.push({ id, callback });
		return id; // Developer needs to use this ID to unsubscribe later
	}

	/**
	 * Removes a log listener once dev no longer wants to receive updates.
	 * e.g. When a component has been unmounted
	 * @param id
	 */
	removeLogListener(id: string): void {
		let removeIndex = -1;
		this.logListeners.forEach((listener, index) => {
			if (listener.id === id) {
				removeIndex = index;
			}
		});

		if (removeIndex > -1) {
			this.logListeners.splice(removeIndex, 1);
		}
	}

	/**
	 * Triggers every listener that has subscribed
	 * @param log
	 */
	private processLogListeners(log: string): void {
		if (!log) {
			return;
		}

		if (__DEV__) {
			console.log(log);
		}

		this.logListeners.forEach((listener) => listener.callback(log));
	}

	/**
	 * Gets LND log file content
	 * @param limit
	 * @returns {Promise<Err<unknown> | Ok<string[]>>}
	 */
	async getLogFileContent(limit: number = 100): Promise<Result<string[]>> {
		let network = this.currentConf?.network;
		if (!network) {
			// return err(new Error('Current network not set. LND must be running first.'));
			network = ENetworks.testnet;
		}

		try {
			const content: string[] = await this.lnd.logFileContent(network, limit);
			return ok(content);
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * Determines if a wallet has already been initialized for the network specified.
	 * @return {Promise<Ok<boolean> | Err<unknown>>}
	 * @param network
	 */
	async walletExists(network: ENetworks): Promise<Result<boolean>> {
		try {
			const exists = await this.lnd.walletExists(network);
			return ok(exists);
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND GetInfo
	 * @returns {Promise<Ok<lnrpc.GetInfoResponse> | Err<unknown>>}
	 */
	async getInfo(): Promise<Result<lnrpc.GetInfoResponse>> {
		try {
			const message = lnrpc.GetInfoRequest.create();
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.GetInfo,
				lnrpc.GetInfoRequest.encode(message).finish()
			);

			return ok(lnrpc.GetInfoResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND GetAddress
	 * @returns {Promise<Ok<lnrpc.NewAddressResponse> | Err<unknown>>}
	 * @param type
	 */
	async getAddress(type?: lnrpc.AddressType): Promise<Result<lnrpc.NewAddressResponse>> {
		try {
			const message = lnrpc.NewAddressRequest.create({ type });
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.NewAddress,
				lnrpc.NewAddressRequest.encode(message).finish()
			);

			return ok(lnrpc.NewAddressResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND GetWalletBalance
	 * @returns {Promise<Err<unknown> | Ok<lnrpc.WalletBalanceResponse>>}
	 */
	async getWalletBalance(): Promise<Result<lnrpc.WalletBalanceResponse>> {
		try {
			const message = lnrpc.WalletBalanceRequest.create();
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.WalletBalance,
				lnrpc.WalletBalanceRequest.encode(message).finish()
			);

			return ok(lnrpc.WalletBalanceResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND GetChannelBalance
	 * @returns {Promise<Err<unknown> | Ok<lnrpc.ChannelBalanceResponse>>}
	 */
	async getChannelBalance(): Promise<Result<lnrpc.ChannelBalanceResponse>> {
		try {
			const message = lnrpc.ChannelBalanceRequest.create();
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.ChannelBalance,
				lnrpc.ChannelBalanceRequest.encode(message).finish()
			);

			return ok(lnrpc.ChannelBalanceResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND ConnectPeer with pubkey and host
	 * @returns {Promise<Ok<lnrpc.ConnectPeerResponse> | Err<unknown>>}
	 * @param host
	 * @param pubkey
	 */
	async connectPeer(pubkey: string, host: string): Promise<Result<lnrpc.ConnectPeerResponse>> {
		try {
			const message = lnrpc.ConnectPeerRequest.create();
			message.addr = lnrpc.LightningAddress.create({ pubkey, host });
			message.perm = true;
			message.timeout = 10;

			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.ConnectPeer,
				lnrpc.ConnectPeerRequest.encode(message).finish()
			);

			return ok(lnrpc.ConnectPeerResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND ConnectPeer from single URI string
	 * @returns {Promise<Ok<lnrpc.ConnectPeerResponse> | Err<unknown>>}
	 * @param host
	 * @param pubkey
	 */
	async connectPeerFromUri(uri: string): Promise<Result<lnrpc.ConnectPeerResponse>> {
		const params = uri.split('@');
		if (params.length !== 2) {
			return err('Invalid URI');
		}

		return await this.connectPeer(params[0], params[1]);
	}

	/**
	 * LND OpenChannelSync
	 * @returns {Promise<Err<unknown, Error> | Ok<lnrpc.ChannelPoint, Error> | Err<unknown, any>>}
	 * @param fundingAmount
	 * @param nodePubkey
	 * @param closeAddress
	 */
	async openChannel(
		fundingAmount: number,
		nodePubkey: string,
		closeAddress: string | undefined = undefined
	): Promise<Result<lnrpc.ChannelPoint>> {
		try {
			const message = lnrpc.OpenChannelRequest.create();
			message.localFundingAmount = fundingAmount;

			// Create a new address for closing of channel if one wasn't provided
			if (closeAddress === undefined) {
				const newAddressRes = await this.getAddress();
				if (newAddressRes.isErr()) {
					return err(newAddressRes.error);
				}
				message.closeAddress = newAddressRes.value.address;
			} else {
				message.closeAddress = closeAddress;
			}

			message.nodePubkeyString = nodePubkey;
			message.pushSat = 0;

			// //TODO have the below config driven maybe
			message.minConfs = 2;
			message.targetConf = 2;
			message.spendUnconfirmed = false;

			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.OpenChannelSync,
				lnrpc.OpenChannelRequest.encode(message).finish()
			);

			return ok(lnrpc.ChannelPoint.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	private generatePendingChannelId(): Uint8Array {
		const result = new Uint8Array(32);

		const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const count = numbers.length;
		for (let i = 0; i < 32; i++) {
			result.set([Math.floor(Math.random() * count)], i);
		}

		return result;
	}

	/**
	 * Starts the channel opening process for external channel funding.
	 * fundingStateStep() needs to be used to progress the state.
	 * @param fundingAmount
	 * @param nodePubkey
	 * @param closeAddress
	 * @param onUpdate
	 * @param onDone
	 * @returns {Uint8Array}
	 */
	openChannelStream(
		fundingAmount: number,
		nodePubkey: string,
		closeAddress: string,
		onUpdate: (res: Result<lnrpc.OpenStatusUpdate>) => void,
		onDone: (res: Result<boolean>) => void
	): Uint8Array {
		const pendingChanId = this.generatePendingChannelId();

		try {
			// Decode the response before sending update back
			const onStateUpdate = (res: Result<Uint8Array>): void => {
				if (res.isErr()) {
					onUpdate(err(res.error));
					return;
				}

				onUpdate(ok(lnrpc.OpenStatusUpdate.decode(res.value)));
			};

			const message = lnrpc.OpenChannelRequest.create();

			message.localFundingAmount = fundingAmount;
			message.closeAddress = closeAddress;
			message.nodePubkey = hexStringToBytes(nodePubkey);

			message.fundingShim = lnrpc.FundingShim.create({
				psbtShim: lnrpc.PsbtShim.create({ pendingChanId })
			});

			this.grpc.sendStreamCommand(
				EGrpcStreamMethods.OpenChannel,
				lnrpc.OpenChannelRequest.encode(message).finish(),
				onStateUpdate,
				onDone
			);
		} catch (e) {
			onUpdate(err(e));
		}

		return pendingChanId;
	}

	/**
	 * Progress the state of a channel opening by providing a PSBT for
	 * verification (containing funding input), for finalization (signed inputs) or
	 * canceling a channel funding process.
	 * @param pendingChanId
	 * @param psbt
	 * @param step
	 * @returns {Promise<Err<unknown> | Ok<lnrpc.FundingStateStepResp>>}
	 */
	async fundingStateStep(
		pendingChanId: Uint8Array,
		psbt: string,
		step: 'verify' | 'finalize' | 'cancel'
	): Promise<Result<lnrpc.FundingStateStepResp>> {
		try {
			const message = lnrpc.FundingTransitionMsg.create();

			switch (step) {
				case 'verify': {
					message.psbtVerify = lnrpc.FundingPsbtVerify.create({
						pendingChanId,
						fundedPsbt: base64.toByteArray(psbt)
					});
					break;
				}
				case 'finalize': {
					message.trigger = 'psbtFinalize';
					message.psbtFinalize = lnrpc.FundingPsbtFinalize.create({
						pendingChanId,
						signedPsbt: base64.toByteArray(psbt)
					});
					break;
				}
				case 'cancel': {
					message.shimCancel = lnrpc.FundingShimCancel.create({
						pendingChanId
					});
					break;
				}
			}

			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.FundingStateStep,
				lnrpc.FundingTransitionMsg.encode(message).finish()
			);

			return ok(lnrpc.FundingStateStepResp.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND CloseChannel
	 * @returns {Promise<Err<unknown> | Ok<lnrpc.ClosedChannelsResponse, Error>>}
	 * @param channel
	 * @param onUpdate
	 * @param onDone
	 */
	closeChannelStream(
		channel: lnrpc.IChannel,
		onUpdate: (res: Result<lnrpc.ClosedChannelsResponse>) => void,
		onDone: (res: Result<boolean>) => void
	): void {
		const channelPoint = channel.channelPoint;
		if (!channelPoint) {
			onDone(err(new Error('Missing channel point')));
			return;
		}

		try {
			const message = lnrpc.CloseChannelRequest.create();

			// Recreate ChannelPoint obj from string found in channel
			const point = lnrpc.ChannelPoint.create();
			point.fundingTxid = 'fundingTxidStr';
			const [txid, txIndex] = channelPoint.split(':');
			point.outputIndex = Number(txIndex);
			point.fundingTxidStr = txid;
			message.channelPoint = point;

			// Decode the response before sending update back
			const onStateUpdate = (res: Result<Uint8Array>): void => {
				if (res.isErr()) {
					onUpdate(err(res.error));
					return;
				}

				onUpdate(ok(lnrpc.ClosedChannelsResponse.decode(res.value)));
			};

			this.grpc.sendStreamCommand(
				EGrpcStreamMethods.CloseChannel,
				lnrpc.CloseChannelRequest.encode(message).finish(),
				onStateUpdate,
				onDone
			);
		} catch (e) {
			onDone(err(e));
		}
	}

	/**
	 * LND subscribe to any changes to on-chain transaction states
	 * @param onUpdate
	 * @param onDone
	 */
	subscribeToOnChainTransactions(
		onUpdate: (res: Result<lnrpc.Transaction>) => void,
		onDone: (res: Result<boolean>) => void
	): void {
		try {
			// Decode the response before sending update back
			const onStateUpdate = (res: Result<Uint8Array>): void => {
				if (res.isErr()) {
					onUpdate(err(res.error));
					return;
				}

				onUpdate(ok(lnrpc.Transaction.decode(res.value)));
			};

			const message = lnrpc.GetTransactionsRequest.create();

			this.grpc.sendStreamCommand(
				EGrpcStreamMethods.SubscribeTransactions,
				lnrpc.GetTransactionsRequest.encode(message).finish(),
				onStateUpdate,
				onDone
			);
		} catch (e) {
			onUpdate(err(e));
		}
	}

	/**
	 * LND getTransactions
	 * Gets all known transactions relevant to wallet
	 * @param startHeight
	 * @param endHeight
	 * @param account
	 * @returns {Promise<Ok<lnrpc.TransactionDetails || Err<unknown>>}
	 */
	async getTransactions(
		startHeight?: number,
		endHeight?: number,
		account?: string
	): Promise<Result<lnrpc.TransactionDetails>> {
		try {
			const message = lnrpc.GetTransactionsRequest.create();

			if (startHeight) {
				message.startHeight = startHeight;
			}
			if (endHeight) {
				message.endHeight = endHeight;
			}
			if (account) {
				message.account = account;
			}

			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.GetTransactions,
				lnrpc.GetTransactionsRequest.encode(message).finish()
			);

			return ok(lnrpc.TransactionDetails.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND subscribe to any changes in invoice states
	 * @param onUpdate
	 * @param onDone
	 */
	subscribeToInvoices(
		onUpdate: (res: Result<lnrpc.Invoice>) => void,
		onDone: (res: Result<boolean>) => void
	): void {
		try {
			const message = lnrpc.ListInvoiceRequest.create();

			// Decode the response before sending update back
			const onStateUpdate = (res: Result<Uint8Array>): void => {
				if (res.isErr()) {
					onUpdate(err(res.error));
					return;
				}

				onUpdate(ok(lnrpc.Invoice.decode(res.value)));
			};

			this.grpc.sendStreamCommand(
				EGrpcStreamMethods.SubscribeInvoices,
				lnrpc.ListInvoiceRequest.encode(message).finish(),
				onStateUpdate,
				onDone
			);
		} catch (e) {
			onUpdate(err(e));
		}
	}

	/**
	 * LND ListPayments
	 * @returns {Promise<Err<unknown> | Ok<lnrpc.ListPaymentsResponse>>}
	 */
	async listPayments(): Promise<Result<lnrpc.ListPaymentsResponse>> {
		try {
			const message = lnrpc.ListPaymentsRequest.create();
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.ListPayments,
				lnrpc.ListPaymentsRequest.encode(message).finish()
			);

			return ok(lnrpc.ListPaymentsResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND ListChannels
	 * @returns {Promise<Ok<lnrpc.ListChannelsResponse> | Err<unknown>>}
	 */
	async listChannels(): Promise<Result<lnrpc.ListChannelsResponse>> {
		try {
			const message = lnrpc.ListChannelsRequest.create();
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.ListChannels,
				lnrpc.ListChannelsRequest.encode(message).finish()
			);

			return ok(lnrpc.ListChannelsResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND DecodePaymentRequest (Invoice)
	 * @param invoice
	 * @returns {Promise<Ok<lnrpc.PayReq> | Err<unknown>>}
	 */
	async decodeInvoice(invoice: string): Promise<Result<lnrpc.PayReq>> {
		try {
			const message = lnrpc.PayReqString.create();
			message.payReq = invoice;
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.DecodePayReq,
				lnrpc.PayReqString.encode(message).finish()
			);

			return ok(lnrpc.PayReq.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND PayInvoice
	 * @param invoice
	 * @returns {Promise<Ok<lnrpc.SendResponse> | Err<unknown>>}
	 */
	async payInvoice(invoice: string): Promise<Result<lnrpc.SendResponse>> {
		try {
			const message = lnrpc.SendRequest.create();
			message.paymentRequest = invoice;
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.SendPaymentSync,
				lnrpc.SendRequest.encode(message).finish()
			);

			return ok(lnrpc.SendResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND CreateInvoice
	 * @param value
	 * @param memo
	 * @param expiry
	 * @returns {Promise<Err<unknown> | Ok<lnrpc.AddInvoiceResponse>>}
	 */
	async createInvoice(
		value: number,
		memo: string,
		expiry: number = 172800
	): Promise<Result<lnrpc.AddInvoiceResponse>> {
		try {
			const message = lnrpc.Invoice.create();
			message.value = value;
			message.memo = memo;
			message.expiry = expiry;
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.AddInvoice,
				lnrpc.Invoice.encode(message).finish()
			);

			return ok(lnrpc.AddInvoiceResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND ListInvoices
	 * @returns {Promise<Ok<lnrpc.ListInvoiceResponse> | Err<unknown>>}
	 * @param indexOffset
	 * @param numMaxInvoices
	 * @param pendingOnly
	 * @param reversed
	 */
	async listInvoices(
		indexOffset = 0,
		numMaxInvoices = -1,
		pendingOnly = false,
		reversed = false
	): Promise<Result<lnrpc.ListInvoiceResponse>> {
		try {
			const message = lnrpc.ListInvoiceRequest.create();
			message.indexOffset = indexOffset;
			if (numMaxInvoices > 0) {
				message.numMaxInvoices = numMaxInvoices;
			}

			message.pendingOnly = pendingOnly;
			message.reversed = reversed;

			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.ListInvoices,
				lnrpc.ListInvoiceRequest.encode(message).finish()
			);

			return ok(lnrpc.ListInvoiceResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND ListPeers
	 * @returns {Promise<Err<unknown> | Ok<lnrpc.ListPeersResponse>>}
	 */
	async listPeers(): Promise<Result<lnrpc.ListPeersResponse>> {
		try {
			const message = lnrpc.ListPeersRequest.create();
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.ListPeers,
				lnrpc.ListPeersRequest.encode(message).finish()
			);

			return ok(lnrpc.ListPeersResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND FeeEstimate
	 * @returns {Promise<Err<unknown> | Ok<lnrpc.EstimateFeeResponse>>}
	 * @param address
	 * @param amount
	 * @param targetConf
	 */
	async feeEstimate(
		address: string,
		amount: number,
		targetConf = 1
	): Promise<Result<lnrpc.EstimateFeeResponse>> {
		try {
			const message = lnrpc.EstimateFeeRequest.create();
			message.targetConf = targetConf;
			message.AddrToAmount = { [address]: amount };
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.EstimateFee,
				lnrpc.EstimateFeeRequest.encode(message).finish()
			);

			return ok(lnrpc.EstimateFeeResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND SignMessage
	 * @returns {Promise<Err<unknown> | Ok<lnrpc.SignMessageResponse>>}
	 * @param msg
	 */
	async sign(msg: string): Promise<Result<lnrpc.SignMessageResponse>> {
		try {
			const message = lnrpc.SignMessageRequest.create();

			message.msg = stringToBytes(msg);
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.SignMessage,
				lnrpc.SignMessageRequest.encode(message).finish()
			);

			return ok(lnrpc.SignMessageResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * Stop the LND daemon
	 * @returns {Promise<Err<unknown> | Ok<lnrpc.StopResponse>>}
	 */
	async stop(): Promise<Result<lnrpc.StopResponse>> {
		try {
			const message = lnrpc.StopRequest.create();
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.StopDaemon,
				lnrpc.StopRequest.encode(message).finish()
			);

			return ok(lnrpc.StopResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND subscribe to any changes in backup snapshot
	 * @param onUpdate
	 * @param onDone
	 */
	subscribeToBackups(
		onUpdate: (res: Result<lnrpc.ChanBackupSnapshot>) => void,
		onDone: (res: Result<boolean>) => void
	): void {
		try {
			// Decode the response before sending update back
			const onBackupUpdate = (res: Result<Uint8Array>): void => {
				if (res.isErr()) {
					onUpdate(err(res.error));
					return;
				}

				onUpdate(ok(lnrpc.ChanBackupSnapshot.decode(res.value)));
			};

			const message = lnrpc.ExportChannelBackupRequest.create();

			this.grpc.sendStreamCommand(
				EGrpcStreamMethods.SubscribeChannelBackups,
				lnrpc.ExportChannelBackupRequest.encode(message).finish(),
				onBackupUpdate,
				onDone
			);
		} catch (e) {
			onUpdate(err(e));
		}
	}

	/**
	 * LND ExportAllChannelBackups
	 * @returns {Promise<Err<unknown> | Ok<string>>}
	 */
	async exportAllChannelBackups(): Promise<Result<string>> {
		try {
			const message = lnrpc.ExportChannelBackupRequest.create();
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.ExportAllChannelBackups,
				lnrpc.ExportChannelBackupRequest.encode(message).finish()
			);

			return ok(
				bytesToHexString(
					lnrpc.ChanBackupSnapshot.decode(serializedResponse).multiChanBackup?.multiChanBackup ??
						new Uint8Array()
				)
			);
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND VerifyChanBackup
	 * Verifies a full ChanBackupSnapshot object
	 * @param backupSnapshot
	 * @returns {Promise<Err<unknown> | Ok<lnrpc.VerifyChanBackupResponse>>}
	 */
	async verifyChannelBackupSnapshot(
		backupSnapshot: lnrpc.ChanBackupSnapshot
	): Promise<Result<lnrpc.VerifyChanBackupResponse>> {
		try {
			const message = lnrpc.ChanBackupSnapshot.create();
			message.multiChanBackup = backupSnapshot.multiChanBackup;
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.VerifyChanBackup,
				lnrpc.ChanBackupSnapshot.encode(message).finish()
			);

			return ok(lnrpc.VerifyChanBackupResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND VerifyChanBackup
	 * Verifies just a multiChanBackup Uint8Array
	 * @returns {Promise<Ok<boolean> | Err<unknown>>}
	 * @param multiChanBackup
	 */
	async verifyMultiChannelBackup(multiChanBackup: string): Promise<Result<boolean>> {
		try {
			const message = lnrpc.ChanBackupSnapshot.create({
				multiChanBackup: lnrpc.MultiChanBackup.create({
					multiChanBackup: hexStringToBytes(multiChanBackup)
				})
			});

			await this.grpc.sendCommand(
				EGrpcSyncMethods.VerifyChanBackup,
				lnrpc.ChanBackupSnapshot.encode(message).finish()
			);

			return ok(true);
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND DescribeGraph
	 * @returns {Promise<Ok<lnrpc.ChannelGraph> | Err<unknown>>}
	 */
	async describeGraph(): Promise<Result<lnrpc.ChannelGraph>> {
		try {
			const message = lnrpc.ChannelGraphRequest.create();
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.DescribeGraph,
				lnrpc.ChannelGraphRequest.encode(message).finish()
			);

			return ok(lnrpc.ChannelGraph.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND SendCoins
	 * Send onchain transaction to a single output
	 * @param address
	 * @param amount
	 * @param targetConf
	 * @param feeRate
	 * @param sendAll
	 * @param label
	 * @returns {Promise<Ok<lnrpc.SendCoinsResponse> | Err<unknown>>}
	 */
	async sendCoins(
		address: string,
		amount: number,
		targetConf?: number,
		feeRate?: number,
		sendAll?: boolean,
		label?: string
	): Promise<Result<lnrpc.SendCoinsResponse>> {
		try {
			const message = lnrpc.SendCoinsRequest.create();

			message.addr = address;
			message.amount = amount;

			if (targetConf) {
				message.targetConf = targetConf;
			}
			if (feeRate) {
				message.satPerVbyte = feeRate;
			}
			if (sendAll) {
				message.sendAll = sendAll;
			}
			if (label) {
				message.label = label;
			}

			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.SendCoins,
				lnrpc.SendCoinsRequest.encode(message).finish()
			);

			return ok(lnrpc.SendCoinsResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}
}

export default new LND();
