import GrpcAction from '../grpc';
import { err, ok, Result } from '../utils/result';
import { EGrpcSyncMethods } from '../utils/types';
import { stringToBytes } from '../utils/helpers';
import { wtclientrpc } from '../protos/wtclient';

class WatchtowerClient {
	private readonly grpc: GrpcAction;

	constructor(grpc: GrpcAction) {
		this.grpc = grpc;
	}

	/**
	 * LND WatchtowerClient
	 * AddTower adds a new watchtower reachable at the given address and considers
	 * it for new sessions. If the watchtower already exists, then any new addresses
	 * included will be considered when dialing it for session negotiations and backups.
	 * @returns {Promise<Err<unknown>> | Ok<wtclientrpc.AddTowerResponse>}
	 * @param pubkey The identifying public key of the watchtower to add.
	 * @param address A network address the watchtower is reachable over.
	 */
	async addTower(pubkey: string, address: string): Promise<Result<wtclientrpc.AddTowerResponse>> {
		const message = wtclientrpc.AddTowerRequest.create();
		message.pubkey = stringToBytes(pubkey);
		message.address = address;

		try {
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.AddTower,
				wtclientrpc.AddTowerRequest.encode(message).finish()
			);

			return ok(wtclientrpc.AddTowerResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND WatchtowerClient
	 * GetTowerInfo retrieves information for a registered watchtower.
	 * @returns {Promise<Err<unknown>> | Ok<wtclientrpc.Tower>}
	 * @param pubkey The identifying public key of the watchtower to retrieve information for.
	 * @param includeSessions Whether we should include sessions with the watchtower in the response.
	 */
	async getTowerInfo(pubkey: string, includeSessions: boolean): Promise<Result<wtclientrpc.Tower>> {
		const message = wtclientrpc.GetTowerInfoRequest.create();
		message.pubkey = stringToBytes(pubkey);
		message.includeSessions = includeSessions;

		try {
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.GetTowerInfo,
				wtclientrpc.GetTowerInfoRequest.encode(message).finish()
			);

			return ok(wtclientrpc.Tower.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND WatchtowerClient
	 * ListTowers returns the list of watchtowers registered with the client.
	 * @returns {Promise<Err<unknown>> | Ok<wtclientrpc.ListTowersResponse>}
	 * @param includeSessions Whether we should include sessions with the watchtower in the response.
	 */
	async listTowers(includeSessions: boolean): Promise<Result<wtclientrpc.ListTowersResponse>> {
		const message = wtclientrpc.ListTowersRequest.create();
		message.includeSessions = includeSessions;

		try {
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.ListTowers,
				wtclientrpc.ListTowersRequest.encode(message).finish()
			);

			return ok(wtclientrpc.ListTowersResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND WatchtowerClient
	 * RemoveTower removes a watchtower from being considered for future session negotiations
	 * and from being used for any subsequent backups until it's added again. If an address
	 * is provided, then this RPC only serves as a way of removing the address from the
	 * watchtower instead.
	 * @returns {Promise<Err<unknown>> | Ok<wtclientrpc.RemoveTowerResponse>}
	 * @param pubkey The identifying public key of the watchtower to remove.
	 * @param address If set, then the record for this address will be removed, indicating
	 * 				  that is is stale. Otherwise, the watchtower will no longer be used for
	 * 				  future session negotiations and backups.
	 */
	async removeTower(
		pubkey: string,
		address?: string
	): Promise<Result<wtclientrpc.RemoveTowerResponse>> {
		const message = wtclientrpc.RemoveTowerRequest.create();
		message.pubkey = stringToBytes(pubkey);

		if (address) {
			message.address = address;
		}

		try {
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.RemoveTower,
				wtclientrpc.RemoveTowerRequest.encode(message).finish()
			);

			return ok(wtclientrpc.RemoveTowerResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}

	/**
	 * LND WatchtowerClient
	 * Stats returns the in-memory statistics of the client since startup.
	 * @returns {Promise<Err<unknown>> | Ok<wtclientrpc.StatsResponse>}
	 */
	async getStats(): Promise<Result<wtclientrpc.StatsResponse>> {
		const message = wtclientrpc.StatsRequest.create();

		try {
			const serializedResponse = await this.grpc.sendCommand(
				EGrpcSyncMethods.Stats,
				wtclientrpc.StatsRequest.encode(message).finish()
			);

			return ok(wtclientrpc.StatsResponse.decode(serializedResponse));
		} catch (e) {
			return err(e);
		}
	}
}

export default WatchtowerClient;
