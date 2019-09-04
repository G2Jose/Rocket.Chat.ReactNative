import { InteractionManager } from 'react-native';
import { sanitizedRaw } from '@nozbe/watermelondb/RawRecord';
import { Q } from '@nozbe/watermelondb';

import buildMessage from './helpers/buildMessage';
import database from '../realm';
import log from '../../utils/log';
import watermelondb from '../database';
import updateMessages from './updateMessages';

// TODO: move to utils
const assignSub = (sub, newSub) => {
	Object.assign(sub, newSub);
};

async function load({ rid: roomId, latest, t }) {
	let params = { roomId, count: 50 };
	if (latest) {
		params = { ...params, latest: new Date(latest).toISOString() };
	}
	// RC 0.48.0
	const data = await this.sdk.get(`${ this.roomTypeToApiType(t) }.history`, params);
	if (!data || data.status === 'error') {
		return [];
	}
	return data.messages;
}

export default function loadMessagesForRoom(args) {
	return new Promise(async(resolve, reject) => {
		try {
			const data = await load.call(this, args);

			if (data && data.length) {
				InteractionManager.runAfterInteractions(async() => {
					await updateMessages(args.rid, data);
					return resolve(data);
				});
			} else {
				return resolve([]);
			}
		} catch (e) {
			log(e);
			reject(e);
		}
	});
}
