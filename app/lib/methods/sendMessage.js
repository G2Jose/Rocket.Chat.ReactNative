import { sanitizedRaw } from '@nozbe/watermelondb/RawRecord';

import messagesStatus from '../../constants/messagesStatus';
import buildMessage from './helpers/buildMessage';
import database from '../realm';
import watermelondb from '../database';
import log from '../../utils/log';
import random from '../../utils/random';

export const getMessage = async(rid, msg = '', tmid, user) => {
	const _id = random(17);
	const { id, username } = user;
	try {
		const watermelon = watermelondb.database;
		const msgCollection = watermelon.collections.get('messages');
		let message;
		await watermelon.action(async() => {
			message = await msgCollection.create((m) => {
				m._raw = sanitizedRaw({ id: _id }, msgCollection.schema);
				m.subscription.id = rid;
				m.msg = msg;
				m.tmid = tmid;
				m.ts = new Date();
				m._updatedAt = new Date();
				m.status = messagesStatus.TEMP;
				m.u = {
					_id: id || '1',
					username
				};
			});
		});
		return message;
	} catch (error) {
		console.warn('getMessage', error);
	}
};

export async function sendMessageCall(message) {
	const {
		id: _id, subscription: { id: rid }, msg, tmid
	} = message;
	// RC 0.60.0
	const data = await this.sdk.post('chat.sendMessage', {
		message: {
			_id, rid, msg, tmid
		}
	});
	return data;
}

export default async function(rid, msg, tmid, user) {
	try {
		const message = await getMessage(rid, msg, tmid, user);
		if (!message) {
			return;
		}
		// const [room] = database.objects('subscriptions').filtered('rid == $0', rid);

		// if (room) {
		// 	database.write(() => {
		// 		room.draftMessage = null;
		// 	});
		// }
		const watermelon = watermelondb.database;
		try {
			await sendMessageCall.call(this, message);
		} catch (e) {
			await watermelon.action(async() => {
				await message.update((m) => {
					m.status = messagesStatus.ERROR;
				});
			});
		}
	} catch (e) {
		log(e);
	}
}
