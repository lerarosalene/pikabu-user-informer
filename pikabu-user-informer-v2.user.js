// ==UserScript==
// @name         Pikabu User Info On Demand
// @namespace    pikabu
// @version      0.6
// @description  ���������� �������� � �������� ������������ ��� ��������� ���� �� ��� 
// @author       FraidZZ
// @match        http*://pikabu.ru/*
// @grant        none
// @run-at       document-end
// ==/UserScript==


(function() {
    'use strict';

    var Core = (function ( ) {
        var scope = new WeakMap( );

        function Core(downloader, doc) {
            scope[this] = { };

            scope[this].document = doc || document;
            scope[this].downloader = downloader;
            scope[this].profileCache = { };
            scope[this].nodeCache = { };

            scope[this].getProfileDOM = function (user) {
                var self = this;
                return new Promise((resolve, reject) => {
                    var cache = scope[self].profileCache;
                    if (cache[user] !== undefined) {
                        return resolve(cache[user]);
                    }				

                    scope[this].downloader.download(`/profile/${user}`).then(data => {
                        cache[user] = (new DOMParser( )).parseFromString(data, 'text/html');
                        resolve(cache[user]);
                    });
                });
            };

            scope[this].profileHasNote = function (profile) {
                return new Promise(function (resolve, reject) {
                    scope[this].getProfileDOM(profile).
                    then(function (profileDocument) {
                        resolve(profileDocument.querySelector('#usr-note-text') && profileDocument.querySelector('#usr-note-text').value !== '');
                    });
                });
            };

            scope[this].profileGetNode = function (profile) {
                var self = this;

                return new Promise(function (resolve, reject) {
                    scope[self].getProfileDOM(profile).
                    then(function (profileDocument) {
                        try {
                            var note = profileDocument.querySelector('#usr-note-text') ? profileDocument.querySelector('#usr-note-text').value : '';

                            var imported = scope[self].document.importNode(profileDocument.querySelector('.b-user-profile'), true);
                            Array.from(imported.querySelectorAll('[data-action^=ignore], .b-button, td:nth-child(3)')).forEach(item => item.parentElement.removeChild(item));

                            var noteSpan = scope[self].document.createElement('p' /* don't ever ask me, why span */);
                            noteSpan.appendChild(scope[self].document.createTextNode(note));
                            imported.querySelector('.b-user-profile__label').parentElement.appendChild(noteSpan);

                            resolve(imported);
                        } catch (ex) {
                            reject(ex);
                        }
                    });
                });
            };

            scope[this].addNoteSym = function (userSpan, color) {
                color = color || 'red';
                var noteSpan = document.createElement   ('a');
                var noteSym  = document.createTextNode('*');
                noteSpan.appendChild(noteSym);
                noteSpan.href = '#';
                noteSpan.style.color = color;
                noteSpan.style.margin = '0px 2px 0px 0px';

                if (userSpan.tagName.toLowerCase() == 'span') {
                    var bCommentUser = userSpan.parentElement.parentElement;
                    bCommentUser.insertBefore(noteSpan, bCommentUser.children[1]);
                } else {
                    var bTitleLine = userSpan.parentElement;
                    noteSpan.style.textDecoration = 'none';
                    bTitleLine.insertBefore(noteSpan, bTitleLine.querySelector('.story__date'));
                }
            };

            scope[this].pause = function (delay) {
                return new Promise((resolve) => setTimeout(resolve, delay));
            };
        }


        Core.prototype = {
            highlightAll: function ( ) {
                var self = this;

                var userSpans = [].slice.call(document.querySelectorAll('.b-comment__user > a > span:not(.userscript-rendered), .story__author:not(.userscript-rendered)')); // i should refactor this some year...
                userSpans.forEach((userSpan) => {
                    userSpan.setAttribute('class', (userSpan.getAttribute('class') ? userSpan.getAttribute('class') : '') + ' userscript-rendered');
                    userSpan.setAttribute('title', '��������...');

                    var nick = userSpan.textContent;
                    var placeData = {
                        clientX: 0,
                        clientY: 0,
                        hover: false
                    };

                    userSpan.addEventListener('mouseover', evt => {
                        placeData.clientX = evt.clientX;
                        placeData.clientY = evt.clientY;
                        placeData.hover = true;

                        if (scope[self].nodeCache[nick] !== undefined) {
                            var box = scope[self].nodeCache[nick];

                            if (box.status === undefined) {
                                userSpan.removeAttribute('title');
                                box.style.display = 'block';
                                box.style.left = (evt.clientX + 5) + 'px';
                                box.style.top = (evt.clientY + 5) + 'px';
                            }

                            return;
                        }

                        scope[self].nodeCache[nick] = { status: 'loading' };
                        scope[self].profileGetNode(nick).then(node => {
                            node.style.position = 'fixed';
                            node.style.marginLeft = '0px';
                            node.style.marginTop = '0px';
                            node.style.border = '1px solid black';
                            node.style.zIndex = '1000';

                            scope[self].nodeCache[nick] = node;
                            userSpan.removeAttribute('title');

                            scope[self].document.body.appendChild(node);

                            if (placeData.hover) {
                                node.style.display = 'block';
                                node.style.left = (placeData.clientX + 5) + 'px';
                                node.style.top  = (placeData.clientY + 5) + 'px';
                            }
                        });
                    });

                    userSpan.addEventListener('mouseout', evt => {
                        placeData.hover = false;
                        var nCache = scope[self].nodeCache;

                        if (nCache[nick] !== undefined && nCache[nick].status === undefined) {
                            nCache[nick].style.display = 'none';
                        }
                    });
                });
            },

            clearCache: function ( ) {
                scope[this].profileCache = { };
                scope[this].nodeCache = { };
            }
        };

        return Core;
    })( );
    
    var DownloadManager = (function ( ) {
        var scope = new WeakMap( );


        function DownloadManager(delay) {
            scope[this] = { };

            scope[this].downloadQueue = [ ];
            scope[this].instant = true;
            scope[this].cache = { };
            scope[this].delay = delay || 200;

            scope[this].downloadNext = function ( ) {
                var task = scope[this].downloadQueue[0];
                if (task === undefined) 
                    return scope[this].instant = true;

                scope[this].download(task.address, task.callback, task.error);
            };

            scope[this].download = function (addr, res, error) {	
                var self = this;

                if (scope[this].cache[addr] !== undefined) {
                    return setTimeout(function ( ) {
                        scope[self].downloadQueue = scope[self].downloadQueue.slice(1);
                        scope[self].downloadNext( );
                        res(scope[self].cache[addr]);
                    }, 0);
                }

                var xhr = new XMLHttpRequest( );
                xhr.open('GET', addr, true);

                xhr.onreadystatechange = function ( ) {
                    if (xhr.readyState == 4) {
                        scope[self].downloadQueue = scope[self].downloadQueue.slice(1);
                        if (xhr.status == 200) {
                            scope[self].cache[addr] = xhr.responseText;
                        }
                        scope[self].downloadNext( );

                        if (xhr.status == 200) {
                            res(xhr.responseText);
                        } else {
                            error(new Error(`Response has status code ${xhr.status} (${xhr.statusText})`));
                        }
                    }
                };

                xhr.onerror = function (err) {
                    scope[self].downloadQueue = scope[self].downloadQueue.slice(1);
                    scope[self].downloadNext( );
                    error(err);
                };

                setTimeout(( ) => xhr.send(null), scope[this].delay);
            };
        }

        DownloadManager.prototype = {
            download: function (url) {
                var queue = scope[this].downloadQueue;
                var self = this;

                return new Promise((resolve, reject) => {
                    queue.push({
                        address: url,
                        callback: resolve,
                        error: reject
                    });

                    if (scope[self].instant) {
                        scope[self].instant = false;
                        scope[self].downloadNext( );
                    }
                });
            },

            setDelay: function (delay) {
                scope[this].delay = delay;
            },

            getDelay: function (delay) {
                return scope[this].delay;
            },

            getCache: function ( ) {
                var cacheCopy = { };
                for (var key in scope[this].cache)
                    cacheCopy[key] = scope[this].cache[key];

                return cacheCopy;
            },

            clearCache: function ( ) {
                scope[this].cache = { };
            }
        };

        return DownloadManager;
    })( );
    
    var dm = new DownloadManager();
    var core = new Core(dm);
    
    setInterval(( ) => {
        core.highlightAll();
    }, 2000);
})();