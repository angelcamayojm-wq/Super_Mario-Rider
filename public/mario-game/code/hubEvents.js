(function () {
    function emit(type, payload) {
        if (window.parent === window) return;
        window.parent.postMessage({
            source: 'mario-game',
            type,
            payload: payload || {}
        }, window.location.origin);
    }

    window.MarioHubGame = {
        started: function () { emit('game_started'); },
        coin: function (coins) { emit('coin_collected', { coins: coins }); },
        score: function (score) { emit('score_updated', { score: score }); }
    };
})();
