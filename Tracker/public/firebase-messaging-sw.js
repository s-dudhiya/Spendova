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
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Firebase automatically shows a notification if the payload has a 'notification' object.
  // We don't need to manually call self.registration.showNotification() here, 
  // otherwise the user will get two duplicate notifications!
});
