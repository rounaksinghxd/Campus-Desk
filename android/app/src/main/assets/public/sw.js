/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "378217f8d4822498763ef89ce44a7dfb"
  }, {
    "url": "pwa-512x512.png",
    "revision": "b58a55c4be1d9817b3234a6534292fca"
  }, {
    "url": "pwa-192x192.png",
    "revision": "e41ec5c4162c6045d7c6a3d292726ac5"
  }, {
    "url": "maskable-icon.svg",
    "revision": "1f4dfb81d3a84d425dcd829bae1880ac"
  }, {
    "url": "index.html",
    "revision": "d61482fca1d8d566c5030ac6b8a90c66"
  }, {
    "url": "icon.svg",
    "revision": "d9ca644ab817d3e8e24f32b1bc92479d"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "53ccc67a8795c0f5d5a7488dbf38e9be"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/web-CRggTY-m.js",
    "revision": null
  }, {
    "url": "assets/web-C0BFq7BQ.js",
    "revision": null
  }, {
    "url": "assets/web-BcwbEFsu.js",
    "revision": null
  }, {
    "url": "assets/index-Bxp6RW1a.css",
    "revision": null
  }, {
    "url": "assets/index-BY9uivbT.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "53ccc67a8795c0f5d5a7488dbf38e9be"
  }, {
    "url": "icon.svg",
    "revision": "d9ca644ab817d3e8e24f32b1bc92479d"
  }, {
    "url": "maskable-icon.svg",
    "revision": "1f4dfb81d3a84d425dcd829bae1880ac"
  }, {
    "url": "pwa-192x192.png",
    "revision": "e41ec5c4162c6045d7c6a3d292726ac5"
  }, {
    "url": "pwa-512x512.png",
    "revision": "b58a55c4be1d9817b3234a6534292fca"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "378217f8d4822498763ef89ce44a7dfb"
  }, {
    "url": "manifest.webmanifest",
    "revision": "fa797aedd32640c9c3ae856ae5f55643"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//]
  }));

}));
