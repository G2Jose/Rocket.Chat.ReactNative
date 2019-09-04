import { sanitizedRaw } from '@nozbe/watermelondb/RawRecord';

import database from '../realm';
import watermelondb from '../database';
import log from '../../utils/log';

const uploadQueue = {};

export function isUploadActive(path) {
	return !!uploadQueue[path];
}

export async function cancelUpload(item) {
	if (uploadQueue[item.path]) {
		uploadQueue[item.path].abort();
		try {
			await watermelondb.database.action(async() => {
				await item.destroyPermanently();
			});
		} catch (e) {
			log(e);
		}
		delete uploadQueue[item.path];
	}
}

export function sendFileMessage(rid, fileInfo, tmid, server, user) {
	return new Promise(async(resolve, reject) => {
		try {
			// FIXME: change after watermelon is configured for serversDB
			const { serversDB } = database.databases;
			const { FileUpload_MaxFileSize, id: Site_Url } = serversDB.objectForPrimaryKey('servers', server);
			const { id, token } = user;

			// -1 maxFileSize means there is no limit
			if (FileUpload_MaxFileSize > -1 && fileInfo.size > FileUpload_MaxFileSize) {
				return reject({ error: 'error-file-too-large' }); // eslint-disable-line
			}

			const uploadUrl = `${ Site_Url }/api/v1/rooms.upload/${ rid }`;

			const xhr = new XMLHttpRequest();
			const formData = new FormData();

			fileInfo.rid = rid;

			const watermelon = watermelondb.database;
			const uploadsCollection = watermelon.collections.get('uploads');
			let uploadRecord;
			try {
				uploadRecord = await uploadsCollection.find(fileInfo.path);
			} catch (error) {
				try {
					await watermelon.action(async() => {
						uploadRecord = await uploadsCollection.create((u) => {
							u._raw = sanitizedRaw({ id: fileInfo.path }, uploadsCollection.schema);
							Object.assign(u, fileInfo);
							u.subscription.id = rid;
						});
					});
				} catch (e) {
					return log(e);
				}
			}

			uploadQueue[fileInfo.path] = xhr;
			xhr.open('POST', uploadUrl);

			formData.append('file', {
				uri: fileInfo.path,
				type: fileInfo.type,
				name: fileInfo.name || 'fileMessage'
			});

			if (fileInfo.description) {
				formData.append('description', fileInfo.description);
			}

			if (tmid) {
				formData.append('tmid', tmid);
			}

			xhr.setRequestHeader('X-Auth-Token', token);
			xhr.setRequestHeader('X-User-Id', id);

			xhr.upload.onprogress = async({ total, loaded }) => {
				try {
					await watermelon.action(async() => {
						await uploadRecord.update((u) => {
							u.progress = Math.floor((loaded / total) * 100);
						});
					});
				} catch (e) {
					log(e);
				}
			};

			xhr.onload = async() => {
				if (xhr.status >= 200 && xhr.status < 400) { // If response is all good...
					try {
						await watermelon.action(async() => {
							await uploadRecord.destroyPermanently();
						});
						const response = JSON.parse(xhr.response);
						resolve(response);
					} catch (e) {
						log(e);
					}
				} else {
					try {
						await watermelon.action(async() => {
							await uploadRecord.update((u) => {
								u.error = true;
							});
						});
					} catch (e) {
						log(e);
					}
					const response = JSON.parse(xhr.response);
					reject(response);
				}
			};

			xhr.onerror = async(error) => {
				try {
					await watermelon.action(async() => {
						await uploadRecord.update((u) => {
							u.error = true;
						});
					});
				} catch (e) {
					log(e);
				}
				reject(error);
			};

			xhr.send(formData);
		} catch (e) {
			log(e);
		}
	});
}
