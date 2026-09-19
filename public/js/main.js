/* ==========================================================================
   1. CONTROLADOR DE REPRODUCTOR DE AUDIO LOCAL
   ========================================================================== */
let audioActual = null;

// Función para pausar otros audios y reproducir el seleccionado al hacer clic
function reproducirAudio(tarjeta) {
    const audio = tarjeta.querySelector('audio');
    if (!audio) return;

    // Si hay otro audio sonando, lo pausa y reinicia
    if (audioActual && audioActual !== audio) {
        audioActual.pause();
        audioActual.currentTime = 0;
    }

    // Alterna entre reproducir y pausar
    if (audio.paused) {
        audio.play();
        audioActual = audio;
    } else {
        audio.pause();
    }
}

/* ==========================================================================
   2. CARGADOR DE ARCHIVOS PDF LOCALES
   ========================================================================== */
function cargarPDF() {
    const fileInput = document.getElementById('pdfFileInput');
    const iframe = document.getElementById('visorPdf');

    // Verifica si el usuario seleccionó un archivo
    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        // Crea un Blob URL temporal del archivo cargado para mostrarlo en el iframe
        const fileURL = URL.createObjectURL(file);
        iframe.src = fileURL;
    } else {
        alert('Por favor, selecciona un archivo PDF de tu equipo primero.');
    }
}

/* ==========================================================================
   3. PIZARRA DE DIBUJO CON HTML5 CANVAS (FANART STUDIO)
   ========================================================================== */
window.addEventListener('load', () => {
    const canvas = document.getElementById('pizarra');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Ajusta el ancho dinámicamente según el contenedor
    canvas.width = canvas.parentElement.clientWidth - 50;

    let dibujando = false;
    let herramienta = 'pen';

    // Captura de elementos del DOM de la barra de herramientas
    const colorPicker = document.getElementById('colorPicker');
    const sizePicker = document.getElementById('sizePicker');
    const toolPicker = document.getElementById('toolPicker');
    const clearBtn = document.getElementById('clearBtn');

    if (toolPicker) toolPicker.addEventListener('change', (e) => herramienta = e.target.value);
    if (clearBtn) clearBtn.addEventListener('click', () => ctx.clearRect(0, 0, canvas.width, canvas.height));

    // Obtiene las coordenadas exactas del cursor dentro del Canvas
    function obtenerPosicion(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    // Eventos del Mouse para el trazado
    canvas.addEventListener('mousedown', (e) => {
        dibujando = true;
        const pos = obtenerPosicion(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!dibujando) return;
        const pos = obtenerPosicion(e);

        ctx.lineWidth = sizePicker.value;
        ctx.lineCap = 'round';

        if (herramienta === 'pen') {
            ctx.strokeStyle = colorPicker.value;
        } else {
            ctx.strokeStyle = '#ffffff'; // Color blanco para efecto borrador
        }

        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    });

    canvas.addEventListener('mouseup', () => dibujando = false);
    canvas.addEventListener('mouseleave', () => dibujando = false);
});

/* ==========================================================================
   4. BLOQUEO DE DESPLAZAMIENTO (SCROLL) DE PANTALLA AL JUGAR
   ========================================================================== */
// Evita que presionar la barra espaciadora o las flechas mueva el scroll de la página web
window.addEventListener('keydown', function(e) {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) > -1) {
        e.preventDefault();
    }
}, false);


/* ==========================================================================
   5. FUNCIÓN DE PANTALLA COMPLETA PARA EL JUEGO
   ========================================================================== */
function pantallaCompleta() {
    const iframe = document.getElementById('marioIframe');
    if (!iframe) return;

    if (iframe.requestFullscreen) {
        iframe.requestFullscreen();
    } else if (iframe.webkitRequestFullscreen) { /* Safari */
        iframe.webkitRequestFullscreen();
    } else if (iframe.msRequestFullscreen) { /* IE11 */
        iframe.msRequestFullscreen();
    }
}

/* ==========================================================================
   CONTROLADOR DEL BOTÓN FLOTANTE DE AUDIO DE FONDO
   ========================================================================== */
const videoFondo = document.getElementById('videoFondo');

function mutearVideoFondo() {
    if (!videoFondo) return;
    const btn = document.getElementById('btnMuteFlotante');
    videoFondo.muted = !videoFondo.muted;
    
    if (videoFondo.muted) {
        btn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    } else {
        btn.innerHTML = '<i class="fas fa-volume-up"></i>';
    }
}

// Silenciar video de fondo automáticamente si suena otra pista
document.addEventListener('play', function(e) {
    if (e.target !== videoFondo && videoFondo) {
        videoFondo.muted = true;
        const btn = document.getElementById('btnMuteFlotante');
        if (btn) btn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    }
}, true);

/* ==========================================================================
   FUNCIÓN PARA CAMBIAR DE PESTAÑA DINÁMICAMENTE
   ========================================================================== */
function mostrarPestana(idPestana, boton) {
    // Oculta todas las pestañas
    const pestanas = document.querySelectorAll('.contenido-tab');
    pestanas.forEach(p => p.classList.remove('activa'));

    // Quita la clase activa de todos los botones
    const botones = document.querySelectorAll('.btn-tab');
    botones.forEach(b => b.classList.remove('activa'));

    // Muestra la pestaña seleccionada
    const pestanaSeleccionada = document.getElementById(idPestana);
    if (pestanaSeleccionada) {
        pestanaSeleccionada.classList.add('activa');
    }

    // Marca el botón presionado como activo
    if (boton) {
        boton.classList.add('activa');
    }
}

/* ==========================================================================
   LÓGICA DE LA PIZARRA Y CONTROLES
   ========================================================================== */
function seleccionarColor(color) {
    const colorPicker = document.getElementById('colorPicker');
    if (colorPicker) colorPicker.value = color;
}

function guardarDibujo() {
    const canvas = document.getElementById('pizarra');
    if (!canvas) return;
    const enlace = document.createElement('a');
    enlace.download = 'mi-fanart-mario.png';
    enlace.href = canvas.toDataURL();
    enlace.click();
}

function cargarPDF() {
    const fileInput = document.getElementById('pdfFileInput');
    const visor = document.getElementById('visorPdf');
    if (fileInput.files && fileInput.files[0]) {
        const fileURL = URL.createObjectURL(fileInput.files[0]);
        visor.src = fileURL;
    }
}

/* Cargar PDF y ocultar la portada previa */
function cargarPDF() {
    const fileInput = document.getElementById('pdfFileInput');
    const visor = document.getElementById('visorPdf');
    const placeholder = document.getElementById('pdfPlaceholder');
    const labelNombre = document.getElementById('nombreArchivoPdf');

    if (fileInput.files && fileInput.files[0]) {
        const archivo = fileInput.files[0];
        const fileURL = URL.createObjectURL(archivo);
        
        visor.src = fileURL;
        visor.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        if (labelNombre) labelNombre.textContent = archivo.name;
    }
}

/* ==========================================================================
   LÓGICA DEL EDITOR DE NIVELES Y DIBUJO DE FIGURAS
   ========================================================================== */
const canvas = document.getElementById('pizarra');
if (canvas) {
    const ctx = canvas.getContext('2d');
    let dibujando = false;
    let startX = 0;
    let startY = 0;
    let snapshot;

    function iniciarDibujo(e) {
        dibujando = true;
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    function dibujar(e) {
        if (!dibujando) return;
        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const tool = document.getElementById('toolPicker').value;
        const color = document.getElementById('colorPicker').value;
        const size = document.getElementById('sizePicker').value;

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';

        if (tool === 'pen' || tool === 'eraser') {
            ctx.strokeStyle = tool === 'eraser' ? '#0f111a' : color;
            ctx.lineTo(currentX, currentY);
            ctx.stroke();
        } else {
            ctx.putImageData(snapshot, 0, 0);
            ctx.beginPath();
            if (tool === 'rect') {
                ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
            } else if (tool === 'circle') {
                const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
                ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
                ctx.stroke();
            } else if (tool === 'line') {
                ctx.moveTo(startX, startY);
                ctx.lineTo(currentX, currentY);
                ctx.stroke();
            }
        }
    }

    function detenerDibujo() {
        dibujando = false;
        ctx.beginPath();
    }

    canvas.addEventListener('mousedown', iniciarDibujo);
    canvas.addEventListener('mousemove', dibujar);
    canvas.addEventListener('mouseup', detenerDibujo);

    document.getElementById('clearBtn')?.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
}

function cambiarFondoLienzo(color) {
    const contenedor = document.querySelector('.contenedor-lienzo-pro');
    if (contenedor) contenedor.style.backgroundColor = color;
}

function cargarPDFDemo(url, nombre) {
    const visor = document.getElementById('visorPdf');
    const placeholder = document.getElementById('pdfPlaceholder');
    const labelNombre = document.getElementById('nombreArchivoPdf');

    if (visor && placeholder) {
        visor.src = url;
        visor.style.display = 'block';
        placeholder.style.display = 'none';
        if (labelNombre) labelNombre.textContent = nombre;
    }
}

function toggleRadio() {
    const audio = document.getElementById('audioEmisora');
    const icono = document.getElementById('iconoRadio');
    const ecualizador = document.getElementById('ecualizador');

    if (audio.paused) {
        audio.play();
        icono.className = 'fas fa-pause';
        ecualizador.classList.add('sonando');
    } else {
        audio.pause();
        icono.className = 'fas fa-play';
        ecualizador.classList.remove('sonando');
    }
}