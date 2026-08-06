importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDk41B6pVQfYrm6KDkIoL32QKGxNzwmseM",
  authDomain: "spendova-1252.firebaseapp.com",
  projectId: "spendova-1252",
  storageBucket: "spendova-1252.firebasestorage.app",
  messagingSenderId: "600416942612",
  appId: "1:600416942612:web:e51021d51bf636f7344501"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background data message ', payload);
  
  if (payload.data && payload.data.title) {
    const notificationTitle = payload.data.title;
    const notificationOptions = {
      body: payload.data.body,
      icon: '/favicon.png',
      data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});
