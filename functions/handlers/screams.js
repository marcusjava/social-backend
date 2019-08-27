const { db } = require('../utils/admin');

exports.getAllScreams = (request, response) => {
	db.collection('screams')
		.orderBy('createdAt', 'desc')
		.get()
		.then(data => {
			let screams = [];
			data.forEach(doc => {
				screams.push({
					screamId: doc.id,
					body: doc.data().body,
					userHandle: doc.data().userHandle,
					createdAt: doc.data().createdAt,
					commentCount: doc.data().commentCount,
					likeCount: doc.data().likeCount,
					userImage: doc.data().userImage,
				});
			});
			return response.json(screams);
		})
		.catch(error => console.error(error));
};

exports.postOneScream = (request, response) => {
	const newScream = {
		body: request.body.body,
		userHandle: request.user.handle,
		userImage: request.user.imageUrl,
		createdAt: new Date().toISOString(),
		likeCount: 0,
		commentCount: 0,
	};
	db.collection('screams')
		.add(newScream)
		.then(doc => {
			const resScream = newScream;
			resScream.screamId = doc.id;
			response.json(resScream);
		})
		.catch(error => response.status(500).json({ error: `Ocorreu um error ${error}` }));
};

exports.getScream = (req, res) => {
	let screamData = {};
	db.doc(`/screams/${req.params.screamId}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'Scream not found' });
			}
			screamData = doc.data();
			screamData.screamId = doc.id;
			return db
				.collection('comments')
				.orderBy('createdAt', 'desc')
				.where('screamId', '==', req.params.screamId)
				.get();
		})
		.then(data => {
			screamData.comments = [];
			data.forEach(doc => {
				screamData.comments.push(doc.data());
			});
			return res.json(screamData);
		})
		.catch(error => {
			console.error(error);
			return res.status(500).json({ error: error.code });
		});
};

exports.commentOnScream = (req, res) => {
	if (req.body.body.trim() === '') res.status(400).json({ comment: 'Comment is not be empty' });
	const newComment = {
		screamId: req.params.screamId,
		body: req.body.body,
		createdAt: new Date().toISOString(),
		userHandle: req.user.handle,
		userImage: req.user.imageUrl,
	};

	db.doc(`/screams/${req.params.screamId}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'Scream not found' });
			}
			return doc.ref.update({ commentCount: doc.data().commentCount + 1 });
		})
		.then(() => {
			return db.collection('comments').add(newComment);
		})
		.then(() => {
			return res.status(201).json(newComment);
		})
		.catch(error => {
			console.error(error);
			return res.status(500).json({ error: 'Something goes wrong' });
		});
};

exports.likeScream = (req, res) => {
	const likeDoc = db
		.collection('likes')
		.where('userHandle', '==', req.user.handle)
		.where('screamId', '==', req.params.screamId)
		.limit(1);

	const screamDoc = db.doc(`/screams/${req.params.screamId}`);

	let screamData;
	screamDoc
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'Scream not found' });
			}
			screamData = doc.data();
			screamData.screamId = doc.id;
			return likeDoc.get();
		})
		.then(data => {
			if (data.empty) {
				return db
					.collection('likes')
					.add({
						screamId: req.params.screamId,
						userHandle: req.user.handle,
					})
					.then(() => {
						screamData.likeCount++;
						return screamDoc.update({ likeCount: screamData.likeCount });
					})
					.then(() => {
						return res.json(screamData);
					});
			} else {
				return res.status(400).json({ error: 'Scream already liked' });
			}
		})
		.catch(error => {
			console.error(error);
			return res.status(500).json({ error: 'Something goes wrong' });
		});
};

exports.unlikeScream = (req, res) => {
	const likeDoc = db
		.collection('likes')
		.where('userHandle', '==', req.user.handle)
		.where('screamId', '==', req.params.screamId)
		.limit(1);

	const screamDoc = db.doc(`/screams/${req.params.screamId}`);

	let screamData;
	screamDoc
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'Scream not found' });
			}
			screamData = doc.data();
			screamData.screamId = doc.id;
			return likeDoc.get();
		})
		.then(data => {
			if (data.empty) {
				return res.status(400).json({ error: 'Scream not liked' });
			} else {
				return db
					.doc(`/likes/${data.docs[0].id}`)
					.delete()
					.then(() => {
						screamData.likeCount--;
						return screamDoc.update({ likeCount: screamData.likeCount });
					})
					.then(() => {
						return res.json(screamData);
					});
			}
		})
		.catch(error => {
			console.error(error);
			return res.status(500).json({ error: 'Something goes wrong' });
		});
};

exports.deleteScream = (req, res) => {
	const document = db.doc(`/screams/${req.params.screamId}`);
	document
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'Scream not found' });
			}
			if (doc.data().userHandle !== req.user.handle) {
				return res.status(403).json({ error: 'You not created this scream' });
			} else {
				return document.delete();
			}
		})
		.then(() => {
			return res.json({ message: 'Scream deleted successfully' });
		})
		.catch(error => {
			console.error(error);
			return res.status(500).json({ error: 'Something goes wrong' });
		});
};
