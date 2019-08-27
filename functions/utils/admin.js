const admin = require('firebase-admin');
//const key = require('../../servicekey.json');

//{
//credential: admin.credential.cert(key),
//databaseURL: 'https://socialapi-92b96.firebaseio.com',
//storageBucket: 'gs://socialapi-92b96.appspot.com',
//}

admin.initializeApp();

const db = admin.firestore();

module.exports = { admin, db };
