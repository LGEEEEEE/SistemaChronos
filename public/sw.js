// Arquivo: public/sw.js

self.addEventListener('push', function(event) {
    if (event.data) {
        const data = event.data.json();
        const title = data.title || 'Aviso do Chronos';
        const options = {
            body: data.body,
            icon: data.icon || '/caminho/para/seu/icone.png', 
            badge: data.badge || '/caminho/para/seu/badge.png',
            vibrate: [200, 100, 200]
        };
        
        event.waitUntil(self.registration.showNotification(title, options));
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/') // Redireciona o usuário quando ele clica na notificação
    );
});