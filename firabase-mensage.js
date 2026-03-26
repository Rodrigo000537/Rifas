importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDHeBEyvJBv3C9WqvDV_9bTotvS6rGI1CM",
  authDomain: "rifas-e4d89.firebaseapp.com",
  projectId: "rifas-e4d89",
  messagingSenderId: "619504019052",
  appId: "1:619504019052:web:1b846e22a4a3600b12da49"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
  });
});
