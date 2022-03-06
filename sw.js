let cacheName = "cache_v0.5.0";
let cachedFiles = [
    "./img/arrowLeft.svg",
    "./img/arrowRight.svg",
    "./img/failed.svg",
    "./img/gap.svg",
    "./img/icon192x192.png",
    "./img/icon512x512.png",
    "./img/intersection.svg",
    "./img/obstacle.svg",
    "./img/pause.svg",
    "./img/ramp.svg",
    "./img/speedbump.svg",
    "./img/start.svg",
    "./img/successful.svg",
    "./img/undo.svg",
    "./favicon32x32.png",
    "./index.html",
    "./main.js",
    "./pwa.js",
    "./site.webmanifest",
    "./style.css"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(cacheName)
        .then((cache) => {
            return cache.addAll(cachedFiles);
        })
        .then(() => {
            return self.skipWaiting();
        })
        .catch((error) => {
            console.log(error);
        })
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
        .then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== cacheName) {
                    return caches.delete(key);
                }
            }));
        })
    );
    return self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request)
        .then((response) => {
            return response || fetch(event.request)
                .then((response) => {
                    return caches.open(cacheName).then((cache) => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                });
        })
    );
});