window.addEventListener('load', () => {
    const canvas = document.getElementById('juegoCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Configuración de controles
    const teclas = { izquierda: false, derecha: false, arriba: false };

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a') teclas.izquierda = true;
        if (e.key === 'ArrowRight' || e.key === 'd') teclas.derecha = true;
        if (e.key === ' ' || e.key === 'ArrowUp') {
            if (!jugador.enElAire) {
                jugador.vy = -jugador.fuerzaSalto;
                jugador.enElAire = true;
            }
            teclas.arriba = true;
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a') teclas.izquierda = false;
        if (e.key === 'ArrowRight' || e.key === 'd') teclas.derecha = false;
        if (e.key === ' ' || e.key === 'ArrowUp') teclas.arriba = false;
    });

    // Estado del Jugador (Mario)
    const jugador = {
        x: 50,
        y: 300,
        ancho: 30,
        alto: 40,
        vx: 0,
        vy: 0,
        velocidad: 4,
        fuerzaSalto: 11,
        gravedad: 0.5,
        enElAire: false,
        monedas: 0
    };

    // Plataformas
    const plataformas = [
        { x: 0, y: 360, ancho: 800, alto: 40 },       // Suelo principal
        { x: 150, y: 270, ancho: 120, alto: 15 },
        { x: 340, y: 210, ancho: 140, alto: 15 },
        { x: 550, y: 270, ancho: 120, alto: 15 }
    ];

    // Monedas
    const monedas = [
        { x: 180, y: 230, radio: 8, recolectada: false },
        { x: 220, y: 230, radio: 8, recolectada: false },
        { x: 380, y: 170, radio: 8, recolectada: false },
        { x: 420, y: 170, radio: 8, recolectada: false },
        { x: 590, y: 230, radio: 8, recolectada: false }
    ];

    // Bucle Principal del Juego
    function actualizar() {
        // Movimiento Horizontal
        if (teclas.izquierda) jugador.vx = -jugador.velocidad;
        else if (teclas.derecha) jugador.vx = jugador.velocidad;
        else jugador.vx = 0;

        jugador.x += jugador.vx;
        jugador.vy += jugador.gravedad;
        jugador.y += jugador.vy;

        // Límites laterales de la pantalla
        if (jugador.x < 0) jugador.x = 0;
        if (jugador.x + jugador.ancho > canvas.width) jugador.x = canvas.width - jugador.ancho;

        // Colisión con Plataformas
        jugador.enElAire = true;
        plataformas.forEach(p => {
            if (
                jugador.x < p.x + p.ancho &&
                jugador.x + jugador.ancho > p.x &&
                jugador.y + jugador.alto >= p.y &&
                jugador.y + jugador.alto <= p.y + p.alto + jugador.vy
            ) {
                jugador.y = p.y - jugador.alto;
                jugador.vy = 0;
                jugador.enElAire = false;
            }
        });

        // Recolección de Monedas
        monedas.forEach(m => {
            if (!m.recolectada) {
                const dist = Math.hypot((jugador.x + jugador.ancho / 2) - m.x, (jugador.y + jugador.alto / 2) - m.y);
                if (dist < m.radio + 15) {
                    m.recolectada = true;
                    jugador.monedas += 100;
                }
            }
        });
    }

    function dibujar() {
        // Fondo Cielo
        ctx.fillStyle = '#5c94fc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Nubes decorativas
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(100, 80, 20, 0, Math.PI * 2);
        ctx.arc(120, 70, 25, 0, Math.PI * 2);
        ctx.arc(140, 80, 20, 0, Math.PI * 2);
        ctx.fill();

        // Dibujar Plataformas (Ladrillo Retro)
        plataformas.forEach(p => {
            ctx.fillStyle = '#c84c0c';
            ctx.fillRect(p.x, p.y, p.ancho, p.alto);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x, p.y, p.ancho, p.alto);
        });

        // Dibujar Monedas
        monedas.forEach(m => {
            if (!m.recolectada) {
                ctx.fillStyle = '#ffcc00';
                ctx.beginPath();
                ctx.arc(m.x, m.y, m.radio, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#b38f00';
                ctx.stroke();
            }
        });

        // Dibujar Jugador (Mario Sprite Simple)
        ctx.fillStyle = '#e60012'; // Gorra/Camiseta
        ctx.fillRect(jugador.x, jugador.y, jugador.ancho, jugador.alto / 2);
        ctx.fillStyle = '#0072ce'; // Overol Azul
        ctx.fillRect(jugador.x, jugador.y + jugador.alto / 2, jugador.ancho, jugador.alto / 2);

        // Marcador de Puntuación
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`Monedas: ${jugador.monedas}`, 20, 30);
    }

    function loop() {
        actualizar();
        dibujar();
        requestAnimationFrame(loop);
    }

    loop();
});

window.addEventListener('load', () => {
    const canvas = document.getElementById('juegoCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Bloquear el movimiento de la página web al presionar teclas
    window.addEventListener('keydown', (e) => {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }
        if (e.key === 'ArrowLeft' || e.key === 'a') teclas.izquierda = true;
        if (e.key === 'ArrowRight' || e.key === 'd') teclas.derecha = true;
        if ((e.key === ' ' || e.key === 'ArrowUp') && !jugador.enElAire) {
            jugador.vy = -jugador.fuerzaSalto;
            jugador.enElAire = true;
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a') teclas.izquierda = false;
        if (e.key === 'ArrowRight' || e.key === 'd') teclas.derecha = false;
    });

    const teclas = { izquierda: false, derecha: false };

    // Cargar imagen de sprites real de Super Mario NES
    const marioSprite = new Image();
    marioSprite.src = 'https://raw.githubusercontent.com/mario-html5/mario-html5/master/images/mario-sprites.png';

    const jugador = {
        x: 50,
        y: 320,
        ancho: 32,
        alto: 32,
        vx: 0,
        vy: 0,
        velocidad: 4,
        fuerzaSalto: 12,
        gravedad: 0.6,
        enElAire: false,
        puntos: 0
    };

    const plataformas = [
        { x: 0, y: 384, ancho: 512, alto: 64 }, // Suelo
        { x: 120, y: 280, ancho: 96, alto: 32 },  // Ladrillos
        { x: 280, y: 220, ancho: 128, alto: 32 }
    ];

    function actualizar() {
        if (teclas.izquierda) jugador.vx = -jugador.velocidad;
        else if (teclas.derecha) jugador.vx = jugador.velocidad;
        else jugador.vx = 0;

        jugador.x += jugador.vx;
        jugador.vy += jugador.gravedad;
        jugador.y += jugador.vy;

        if (jugador.x < 0) jugador.x = 0;
        if (jugador.x + jugador.ancho > canvas.width) jugador.x = canvas.width - jugador.ancho;

        jugador.enElAire = true;
        plataformas.forEach(p => {
            if (
                jugador.x < p.x + p.ancho &&
                jugador.x + jugador.ancho > p.x &&
                jugador.y + jugador.alto >= p.y &&
                jugador.y + jugador.alto <= p.y + p.alto + jugador.vy
            ) {
                jugador.y = p.y - jugador.alto;
                jugador.vy = 0;
                jugador.enElAire = false;
            }
        });
    }

    function dibujar() {
        // Cielo
        ctx.fillStyle = '#5c94fc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dibujar bloques de suelo/ladrillos estilo NES
        plataformas.forEach(p => {
            ctx.fillStyle = '#d84800';
            ctx.fillRect(p.x, p.y, p.ancho, p.alto);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x, p.y, p.ancho, p.alto);
        });

        // Dibujar a Mario usando el sprite o el personaje 2D retro
        if (marioSprite.complete && marioSprite.naturalWidth !== 0) {
            ctx.drawImage(marioSprite, 0, 0, 16, 16, jugador.x, jugador.y, jugador.ancho, jugador.alto);
        } else {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(jugador.x, jugador.y, jugador.ancho, jugador.alto);
        }

        // HUD Texto NES
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('MARIO', 20, 30);
        ctx.fillText('WORLD 1-1', 200, 30);
    }

    function loop() {
        actualizar();
        dibujar();
        requestAnimationFrame(loop);
    }

    loop();
});