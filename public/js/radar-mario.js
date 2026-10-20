(function () {
    'use strict';

    var mapa;
    var controlRuta;
    var origenMarker;
    var destinoMarker;
    var rutaLayer;
    var rutaDetalle;
    var vehiculoMarker;
    var animacionVehiculo;
    var listaSismos = [];
    var siguientePunto = 'origen';
    var puntosSeleccionados = 0;
    var temporizadorDireccion;

    var origenInicial = [2.4419, -76.6063];

    function crearIconoMario(color, simbolo) {
        return L.divIcon({
            className: 'marcador-mario',
            html: '<span style="background:' + color + '">' + simbolo + '</span>',
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -17]
        });
    }

    function crearIconoLuigi() {
        return L.divIcon({
            className: 'marcador-luigi',
            html: '<span><b>L</b></span>',
            iconSize: [38, 38],
            iconAnchor: [19, 19],
            popupAnchor: [0, -19]
        });
    }

    function crearIconoVehiculo() {
        return L.divIcon({
            className: 'marcador-vehiculo',
            html: '<span><i class="fas fa-car-side"></i></span>',
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });
    }

    function actualizarEstado(id, texto) {
        var elemento = document.getElementById(id);
        if (elemento) elemento.textContent = texto;
    }

    function actualizarCoordenadas() {
        var salida = origenMarker.getLatLng();
        if (!destinoMarker) {
            actualizarEstado('stat-coordenadas',
                salida.lat.toFixed(4) + ', ' + salida.lng.toFixed(4) + ' → selecciona destino');
            return;
        }
        var destino = destinoMarker.getLatLng();
        actualizarEstado('stat-coordenadas',
            salida.lat.toFixed(4) + ', ' + salida.lng.toFixed(4) + ' → ' +
            destino.lat.toFixed(4) + ', ' + destino.lng.toFixed(4));
    }

    function geocodificar(direccion) {
        var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=es&q=' +
            encodeURIComponent(direccion);
        return fetch(url, {
            headers: { Accept: 'application/json' }
        }).then(function (respuesta) {
            if (!respuesta.ok) throw new Error('No se pudo consultar la dirección');
            return respuesta.json();
        }).then(function (resultados) {
            if (!resultados.length) throw new Error('Dirección no encontrada');
            return [parseFloat(resultados[0].lat), parseFloat(resultados[0].lon)];
        });
    }

    function trazarRuta() {
        var origen = document.getElementById('origen-input').value.trim();
        var destino = document.getElementById('destino-input').value.trim();
        if (!origen) {
            actualizarEstado('stat-estado', 'Escribe el punto de salida');
            return;
        }
        if (!destino) {
            actualizarEstado('stat-estado', 'Selecciona o escribe el destino');
            return;
        }

        actualizarEstado('stat-estado', 'Buscando mundos...');
        Promise.all([geocodificar(origen), geocodificar(destino)])
            .then(function (coordenadas) {
                origenMarker.setLatLng(coordenadas[0]);
                crearOActualizarDestino(coordenadas[1]);
                dibujarRuta();
            })
            .catch(function () {
                actualizarEstado('stat-estado', 'No encontramos una ubicación');
            });
    }

    function actualizarAyuda(texto) {
        var ayuda = document.getElementById('ayuda-ruta');
        if (ayuda) ayuda.innerHTML = '<i class="fas fa-circle-info"></i> ' + texto;
    }

    function programarRutaPorTexto() {
        clearTimeout(temporizadorDireccion);
        temporizadorDireccion = setTimeout(function () {
            var origen = document.getElementById('origen-input').value.trim();
            var destino = document.getElementById('destino-input').value.trim();
            if (origen.length >= 4 && destino.length >= 4) trazarRuta();
        }, 900);
    }

    function crearOActualizarDestino(coordenadas) {
        if (!destinoMarker) {
            destinoMarker = L.marker(coordenadas, {
                draggable: true,
                icon: crearIconoLuigi()
            }).addTo(mapa).setZIndexOffset(700).bindPopup('Punto destino');

            destinoMarker.on('dragend', function () {
                actualizarDireccion(destinoMarker.getLatLng(), 'destino-input');
                actualizarCoordenadas();
                dibujarRuta();
            });
        } else {
            destinoMarker.setLatLng(coordenadas);
        }
    }

    function actualizarDireccion(coordenadas, id) {
        var url = 'https://nominatim.openstreetmap.org/reverse?format=json&accept-language=es&lat=' +
            coordenadas.lat + '&lon=' + coordenadas.lng;
        fetch(url).then(function (respuesta) {
            if (!respuesta.ok) throw new Error('No se pudo obtener la dirección');
            return respuesta.json();
        }).then(function (datos) {
            var campo = document.getElementById(id);
            if (campo && datos.display_name) campo.value = datos.display_name.split(',').slice(0, 3).join(',');
        }).catch(function () {
            actualizarEstado('stat-estado', 'Punto seleccionado en el mapa');
        });
    }

    function seleccionarPuntoEnMapa(evento) {
        if (siguientePunto === 'origen') {
            origenMarker.setLatLng(evento.latlng);
            actualizarDireccion(evento.latlng, 'origen-input');
            siguientePunto = 'destino';
            puntosSeleccionados = 1;
            if (controlRuta) {
                mapa.removeControl(controlRuta);
                controlRuta = null;
            }
            if (rutaLayer) {
                mapa.removeLayer(rutaLayer);
                rutaLayer = null;
            }
            if (rutaDetalle) {
                mapa.removeLayer(rutaDetalle);
                rutaDetalle = null;
            }
            actualizarEstado('stat-distancia', '--');
            actualizarEstado('stat-tiempo', '--');
            if (vehiculoMarker) {
                mapa.removeLayer(vehiculoMarker);
                vehiculoMarker = null;
            }
            actualizarEstado('stat-coordenadas', evento.latlng.lat.toFixed(4) + ', ' + evento.latlng.lng.toFixed(4) + ' → selecciona destino');
            actualizarEstado('stat-estado', 'Salida seleccionada');
            document.getElementById('resumen-ruta').textContent = 'Salida lista. Selecciona ahora el destino.';
            actualizarAyuda('Ahora toca el destino en el mapa.');
            return;
        }

        crearOActualizarDestino(evento.latlng);
        actualizarDireccion(evento.latlng, 'destino-input');
        siguientePunto = 'origen';
        puntosSeleccionados = 2;
        actualizarAyuda('Ruta lista. Puedes arrastrar los marcadores para ajustarla.');
        dibujarRuta();
    }

    function dibujarRuta() {
        var inicio = origenMarker.getLatLng();
        if (!origenMarker || !destinoMarker) {
            actualizarEstado('stat-estado', 'Selecciona el destino para crear la ruta');
            return;
        }
        var fin = destinoMarker.getLatLng();
        var url = 'https://router.project-osrm.org/route/v1/driving/' +
            inicio.lng + ',' + inicio.lat + ';' + fin.lng + ',' + fin.lat +
            '?overview=full&geometries=geojson&steps=true';

        actualizarEstado('stat-estado', 'Calculando ruta...');
        document.getElementById('resumen-ruta').textContent = 'Buscando el camino más rápido...';
        fetch(url).then(function (respuesta) {
            if (!respuesta.ok) throw new Error('Servicio de rutas no disponible');
            return respuesta.json();
        }).then(function (datos) {
            if (!datos.routes || !datos.routes.length) throw new Error('Ruta no encontrada');
            var ruta = datos.routes[0];
            if (rutaLayer) mapa.removeLayer(rutaLayer);
            if (rutaDetalle) mapa.removeLayer(rutaDetalle);
            rutaLayer = L.geoJSON(ruta.geometry, {
                style: { color: '#ffcc00', weight: 11, opacity: 0.35 }
            }).addTo(mapa);
            rutaLayer.bringToBack();
            rutaDetalle = L.geoJSON(ruta.geometry, {
                style: { color: '#e60012', weight: 6, opacity: 1, dashArray: '1 0' }
            }).addTo(mapa);
            mapa.fitBounds(rutaLayer.getBounds(), { padding: [30, 30] });

            actualizarEstado('stat-distancia', (ruta.distance / 1000).toFixed(1) + ' km');
            actualizarEstado('stat-tiempo', Math.max(1, Math.round(ruta.duration / 60)) + ' min');
            actualizarEstado('stat-estado', 'Ruta lista para jugar');
            actualizarCoordenadas();
            pintarPasosRuta(ruta);
            animarVehiculo(ruta.geometry.coordinates);
        }).catch(function () {
            if (rutaLayer) {
                mapa.removeLayer(rutaLayer);
                rutaLayer = null;
            }
            if (rutaDetalle) {
                mapa.removeLayer(rutaDetalle);
                rutaDetalle = null;
            }
            if (vehiculoMarker) {
                mapa.removeLayer(vehiculoMarker);
                vehiculoMarker = null;
            }
            actualizarEstado('stat-distancia', '--');
            actualizarEstado('stat-tiempo', '--');
            actualizarEstado('stat-estado', 'No se pudo calcular la ruta');
            document.getElementById('resumen-ruta').textContent =
                'No encontramos una carretera entre esos puntos. Prueba con direcciones más completas.';
            document.getElementById('pasos-ruta').innerHTML = '<li>Comprueba las direcciones e inténtalo de nuevo.</li>';
        });
    }

    function animarVehiculo(coordenadas) {
        if (animacionVehiculo) cancelAnimationFrame(animacionVehiculo);
        if (vehiculoMarker) mapa.removeLayer(vehiculoMarker);
        vehiculoMarker = L.marker([coordenadas[0][1], coordenadas[0][0]], {
            icon: crearIconoVehiculo(),
            zIndexOffset: -100
        }).addTo(mapa).bindTooltip('Mario va en camino', { direction: 'top' });

        var indice = 0;
        function avanzar() {
            if (!vehiculoMarker || indice >= coordenadas.length) return;
            var punto = coordenadas[indice];
            vehiculoMarker.setLatLng([punto[1], punto[0]]);
            indice += Math.max(1, Math.floor(coordenadas.length / 180));
            animacionVehiculo = requestAnimationFrame(avanzar);
        }
        avanzar();
    }

    function pintarPasosRuta(ruta) {
        var resumen = document.getElementById('resumen-ruta');
        var pasos = document.getElementById('pasos-ruta');
        var instrucciones = [];
        (ruta.legs || []).forEach(function (tramo) {
            (tramo.steps || []).forEach(function (paso) {
                if (paso.maneuver && paso.maneuver.instruction) {
                    instrucciones.push(paso.maneuver.instruction);
                }
            });
        });
        resumen.textContent = 'Ruta de ' + (ruta.distance / 1000).toFixed(1) +
            ' km · aproximadamente ' + Math.round(ruta.duration / 60) + ' min';
        pasos.innerHTML = (instrucciones.slice(0, 6).map(function (instruccion) {
            return '<li>' + textoSeguro(instruccion) + '</li>';
        }).join('')) || '<li>Sigue la línea roja hasta la bandera.</li>';
    }

    function configurarMapa() {
        var contenedor = document.getElementById('mapa-mario');
        if (!contenedor || typeof L === 'undefined') return;

        mapa = L.map(contenedor).setView(origenInicial, 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapa);

        origenMarker = L.marker(origenInicial, {
            draggable: true,
            icon: crearIconoMario('#e60012', 'M')
        }).addTo(mapa).bindPopup('Punto de salida');

        // 🔥 EVENTO CORREGIDO PARA EL MARCADOR M (ORIGEN)
        origenMarker.on('dragend', function () {
            actualizarDireccion(origenMarker.getLatLng(), 'origen-input');
            actualizarCoordenadas();
            if (destinoMarker) {
                actualizarEstado('stat-estado', 'Recalculando ruta...');
                actualizarAyuda('Ruta actualizada desde la nueva salida.');
                dibujarRuta();
            } else {
                actualizarEstado('stat-estado', 'Popayán listo: selecciona el destino');
                actualizarAyuda('Toca el mapa o escribe el destino para comenzar.');
            }
        });

        document.getElementById('btn-ruta').addEventListener('click', trazarRuta);
        document.getElementById('origen-input').addEventListener('input', programarRutaPorTexto);
        document.getElementById('destino-input').addEventListener('input', programarRutaPorTexto);
        document.getElementById('origen-input').addEventListener('keydown', function (evento) {
            if (evento.key === 'Enter') trazarRuta();
        });
        document.getElementById('destino-input').addEventListener('keydown', function (evento) {
            if (evento.key === 'Enter') trazarRuta();
        });
        document.getElementById('btn-intercambiar').addEventListener('click', function () {
            if (!destinoMarker) {
                actualizarEstado('stat-estado', 'Primero selecciona un destino');
                return;
            }
            var salida = origenMarker.getLatLng();
            origenMarker.setLatLng(destinoMarker.getLatLng());
            destinoMarker.setLatLng(salida);
            var origenInput = document.getElementById('origen-input');
            var destinoInput = document.getElementById('destino-input');
            var texto = origenInput.value;
            origenInput.value = destinoInput.value;
            destinoInput.value = texto;
            actualizarCoordenadas();
            dibujarRuta();
        });
        document.getElementById('btn-ubicacion').addEventListener('click', usarMiUbicacion);
        mapa.on('click', seleccionarPuntoEnMapa);
        actualizarCoordenadas();
        dibujarRuta();
    }

    function usarMiUbicacion() {
        if (!navigator.geolocation) {
            actualizarEstado('stat-estado', 'Tu navegador no permite geolocalización');
            return;
        }
        actualizarEstado('stat-estado', 'Solicitando tu ubicación...');
        navigator.geolocation.getCurrentPosition(function (posicion) {
            var punto = [posicion.coords.latitude, posicion.coords.longitude];
            origenMarker.setLatLng(punto);
            mapa.setView(punto, 14);
            actualizarDireccion({ lat: punto[0], lng: punto[1] }, 'origen-input');
            actualizarAyuda('Ubicación actual usada como salida.');
            actualizarCoordenadas();
            dibujarRuta();
        }, function () {
            actualizarEstado('stat-estado', 'No se pudo obtener tu ubicación');
            actualizarAyuda('Permite el acceso a la ubicación o escribe la dirección manualmente.');
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    }

    function textoSeguro(texto) {
        return String(texto || '').replace(/[&<>"']/g, function (caracter) {
            return {
                '&': '&amp;', '<': '&lt;', '>': '&gt;',
                '"': '&quot;', "'": '&#039;'
            }[caracter];
        });
    }

    function claseMagnitud(magnitud) {
        if (magnitud >= 4.5) return { color: '#ef4444', texto: 'Peligroso' };
        if (magnitud >= 3) return { color: '#eab308', texto: 'Moderado' };
        return { color: '#22c55e', texto: 'Leve' };
    }

    function abrirDetalleSismo(indice) {
        var sismo = listaSismos[indice];
        if (!sismo) return;
        var propiedades = sismo.properties;
        var coordenadas = sismo.geometry.coordinates;
        var modal = document.getElementById('modal-sismo-mario');
        var contenido = document.getElementById('detalle-sismo-mario');
        contenido.innerHTML =
            '<p><strong>Magnitud:</strong> ' + textoSeguro(propiedades.mag || 'N/D') + ' ML</p>' +
            '<p><strong>Ubicación:</strong> ' + textoSeguro(propiedades.place || 'Desconocida') + '</p>' +
            '<p><strong>Fecha:</strong> ' + new Date(propiedades.time).toLocaleString('es-CO') + '</p>' +
            '<p><strong>Profundidad:</strong> ' + textoSeguro(coordenadas[2]) + ' km</p>' +
            '<p><strong>Tsunami:</strong> ' + (propiedades.tsunami === 1 ? 'Alerta activa' : 'Sin alerta') + '</p>';
        modal.classList.add('visible');
    }

    function cargarSismos() {
        var url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
        fetch(url).then(function (respuesta) {
            if (!respuesta.ok) throw new Error('USGS no disponible');
            return respuesta.json();
        }).then(function (datos) {
            listaSismos = datos.features || [];
            var grid = document.getElementById('sismos-grid');
            if (!grid) return;
            if (!listaSismos.length) {
                grid.innerHTML = '<p class="estado-sismos">No hay señales sísmicas recientes.</p>';
                return;
            }
            grid.innerHTML = listaSismos.slice(0, 9).map(function (sismo, indice) {
                var magnitud = Number(sismo.properties.mag);
                var nivel = claseMagnitud(magnitud);
                var icono = magnitud >= 4.5 ? 'fa-triangle-exclamation' : magnitud >= 3 ? 'fa-fire' : 'fa-star';
                return '<article class="sismo-card" style="border-color:' + nivel.color + '" data-sismo="' + indice + '">' +
                    '<div class="sismo-icono-flotante"><i class="fas ' + icono + '"></i></div>' +
                    '<div class="sismo-cabecera"><span class="sismo-magnitud" style="background:' + nivel.color + '"><i class="fas fa-bolt"></i> Mag ' +
                    (Number.isFinite(magnitud) ? magnitud.toFixed(1) : 'N/D') + ' · ' + nivel.texto + '</span>' +
                    '<time class="sismo-hora">' + new Date(sismo.properties.time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) + '</time></div>' +
                    '<p class="sismo-lugar">📍 ' + textoSeguro(sismo.properties.place || 'Ubicación desconocida') + '</p>' +
                    '<p class="sismo-pie">Profundidad: ' + textoSeguro(sismo.geometry.coordinates[2]) + ' km · Ver ficha ➜</p></article>';
            }).join('');
            actualizarEstado('total-sismos', listaSismos.length);
            var magnitudes = listaSismos.map(function (evento) { return Number(evento.properties.mag); }).filter(Number.isFinite);
            actualizarEstado('mayor-sismo', magnitudes.length ? Math.max.apply(null, magnitudes).toFixed(1) : '--');
            actualizarEstado('actualizado-sismos', new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
            grid.querySelectorAll('[data-sismo]').forEach(function (tarjeta) {
                tarjeta.addEventListener('click', function () {
                    abrirDetalleSismo(Number(tarjeta.dataset.sismo));
                });
            });
        }).catch(function () {
            var grid = document.getElementById('sismos-grid');
            if (grid) grid.innerHTML = '<p class="estado-sismos">⚠️ El detector no pudo conectar con USGS.</p>';
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        configurarMapa();
        cargarSismos();
        setInterval(cargarSismos, 300000);

        var modal = document.getElementById('modal-sismo-mario');
        document.getElementById('cerrar-modal-sismo').addEventListener('click', function () {
            modal.classList.remove('visible');
        });
        modal.addEventListener('click', function (evento) {
            if (evento.target === modal) modal.classList.remove('visible');
        });
    });

    window.invalidateMarioMap = function () {
        if (mapa) setTimeout(function () { mapa.invalidateSize(); }, 200);
    };
}());