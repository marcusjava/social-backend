const { db, admin } = require('../utils/admin');

const config = require('../utils/config');

const firebase = require('firebase');

const { validateLoginData, validateSignupData, reduceUserDetails } = require('../utils/validators');

firebase.initializeApp(config);

exports.signup = (req, res) => {
	const newUser = {
		email: req.body.email,
		password: req.body.password,
		confirmPassword: req.body.confirmPassword,
		handle: req.body.handle,
	};

	const { valid, errors } = validateSignupData(newUser);

	if (!valid) return res.status(400).json(errors);

	//validando se o usuario já existe
	let token, userId;
	const noImg = 'no-img.png';
	db.doc(`/users/${newUser.handle}`)
		.get()
		.then(doc => {
			if (doc.exists) {
				return res.status(400).json({ handle: 'this handle already taken' });
			} else {
				return firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password);
			}
		})
		.then(data => {
			userId = data.user.uid;
			return data.user.getIdToken();
		})
		.then(idToken => {
			token = idToken;
			const userCredentials = {
				userId,
				email: newUser.email,
				handle: newUser.handle,
				imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
				createdAt: new Date().toISOString(),
			};
			//Inserindo no documento users e retirnando promise para o próximo then
			return db.doc(`/users/${newUser.handle}`).set(userCredentials);
		})
		.then(result => {
			return res.status(201).json({ token });
		})
		.catch(error => {
			console.log(error);
			if (error.code === 'auth/email-already-in-use') {
				return res.status(400).json({ email: 'Email already in use' });
			} else {
				return res.status(500).json({ error: 'Something goes wrong' });
			}
		});
};

exports.login = (req, res) => {
	const user = {
		email: req.body.email,
		password: req.body.password,
	};

	const { errors, valid } = validateLoginData(user);
	if (!valid) return res.status(400).json(errors);

	firebase
		.auth()
		.signInWithEmailAndPassword(user.email, user.password)
		.then(data => data.user.getIdToken())
		.then(token => {
			return res.json({ token });
		})
		.catch(errors => {
			console.error(errors);
			return res.status(403).json({ general: 'Wrong cedential please try again' });
		});
};

// Upload a profile image for user
exports.uploadImage = (req, res) => {
	const BusBoy = require('busboy');
	const path = require('path');
	const os = require('os');
	const fs = require('fs');

	const busboy = new BusBoy({ headers: req.headers });

	let imageToBeUploaded = {};
	let imageFileName;

	busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
		if (mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
			return res.status(400).json({ error: 'Wrong file type submitted' });
		}
		// my.image.png => ['my', 'image', 'png']
		const imageExtension = filename.split('.')[filename.split('.').length - 1];
		// 32756238461724837.png
		imageFileName = `${Math.round(Math.random() * 1000000000000).toString()}.${imageExtension}`;
		const filepath = path.join(os.tmpdir(), imageFileName);
		imageToBeUploaded = { filepath, mimetype };
		file.pipe(fs.createWriteStream(filepath));
	});
	busboy.on('finish', () => {
		admin
			.storage()
			.bucket()
			.upload(imageToBeUploaded.filepath, {
				resumable: false,
				metadata: {
					metadata: {
						contentType: imageToBeUploaded.mimetype,
					},
				},
			})
			.then(() => {
				const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${
					config.storageBucket
				}/o/${imageFileName}?alt=media`;
				return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
			})
			.then(() => {
				return res.json({ message: 'image uploaded successfully' });
			})
			.catch(err => {
				console.error(err);
				return res.status(500).json({ error: 'something went wrong' });
			});
	});
	busboy.end(req.rawBody);
};

exports.addUserDetails = (req, res) => {
	let userDetails = reduceUserDetails(req.body);
	db.doc(`/users/${req.user.handle}`)
		.update(userDetails)
		.then(() => {
			return res.json({ message: 'Details added successfully ' });
		})
		.catch(err => {
			console.error('Something goes wrong');
			return res.status(500).json({ error: err.code });
		});
};

exports.getAuthenticatedUser = (req, res) => {
	let userData = {};
	db.doc(`/users/${req.user.handle}`)
		.get()
		.then(doc => {
			if (doc.exists) {
				userData.credentials = doc.data();
				return db
					.collection('likes')
					.where('userHandle', '==', req.user.handle)
					.get();
			}
		})
		.then(likes => {
			userData.likes = [];
			likes.forEach(doc => {
				userData.likes.push(doc.data());
			});
			return db
				.collection('notifications')
				.where('recipient', '==', req.user.handle)
				.orderBy('createdAt', 'desc')
				.limit(10)
				.get();
		})
		.then(data => {
			userData.notifications = [];
			data.forEach(doc => {
				userData.notifications.push({
					notificationId: doc.id,
					recipient: doc.data().recipient,
					sender: doc.data().sender,
					createdAt: doc.data().createdAt,
					screamId: doc.data().screamId,
					type: doc.data().type,
					read: doc.data().read,
				});
			});
			return res.json(userData);
		})
		.catch(error => {
			console.error(error);
			return res.status(500).json({ error: error.code });
		});
};

exports.markNotificationsRead = (req, res) => {
	let batch = db.batch();
	req.body.forEach(notificationId => {
		const notification = db.doc(`/notifications/${notificationId}`);
		batch.update(notification, { read: true });
	});
	batch
		.commit()
		.then(() => {
			return res.json({ message: 'Notification marked as read successfully' });
		})
		.catch(error => {
			console.error(error);
			return res.status(500).json({ error: error });
		});
};

exports.getUserDetails = (req, res) => {
	let userData = {};
	db.doc(`/users/${req.params.handle}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'User not found' });
			}
			userData.user = doc.data();
			return db
				.collection('screams')
				.where('userHandle', '==', req.params.handle)
				.orderBy('createdAt', 'desc')
				.get();
		})
		.then(data => {
			userData.screams = [];
			data.forEach(doc => {
				userData.screams.push({
					screamId: doc.id,
					body: doc.data().body,
					createdAt: doc.data().createdAt,
					userHandle: doc.data().body,
					userImage: doc.data().userImage,
					likeCount: doc.data().likeCount,
					commentCount: doc.data().commentCount,
				});
			});
			return res.json(userData);
		})
		.catch(error => {
			console.error(error);
			return res.status(500).json({ error: error.code });
		});
};
