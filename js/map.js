/**
 * MAPA - PROMOCITY
 * Gerenciamento do mapa interativo com Leaflet
 */

const mapManager = {
    map: null,
    trackingMap: null,
    markers: [],
    userMarker: null,
    userLocation: null,

    /**
     * Inicializa o mapa
     * @param {string} containerId - ID do container do mapa (padrão: 'promo-map')
     */
    init(containerId = 'promo-map') {
        // Evita "Map container is already initialized" do Leaflet na 2ª visita
        if (this.map) {
            this.destroy();
        }
        
        const container = document.getElementById(containerId);
        if (!container) return null;

        // Centro aproximado de Ivaí-PR
        const defaultCenter = [-25.0114, -50.8576];
        
        try {
            this.map = L.map(containerId).setView(defaultCenter, 13);

            // Camada base do OpenStreetMap
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 19
            }).addTo(this.map);

            // Tenta pegar localização do usuário
            this.getUserLocation();

            // Adicionar botão de localização
            this.addLocateButton();

            // Força redimensionamento após inicialização
            setTimeout(() => {
                this.map.invalidateSize();
            }, 300);

            return this.map;
        } catch (error) {
            ui.showToast('Erro ao carregar mapa', 'error');
            return null;
        }
    },

    /**
     * Tenta obter a localização do usuário
     */
    getUserLocation() {
        if (!navigator.geolocation) {
            ui.showToast('Seu navegador não suporta geolocalização', 'warning');
            return;
        }

        ui.showToast('Buscando sua localização...', 'info', 2000);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // Remove marcador anterior se existir
                if (this.userMarker) {
                    this.map.removeLayer(this.userMarker);
                }

                // Ícone personalizado para o usuário
                const userIcon = L.divIcon({
                    className: 'user-location',
                    html: '<div style="background-color: #4285F4; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                });

                this.userMarker = L.marker([this.userLocation.lat, this.userLocation.lng], {
                    icon: userIcon,
                    zIndexOffset: 1000
                }).addTo(this.map)
                  .bindPopup('Você está aqui');

                // Centraliza no usuário (com zoom um pouco maior)
                this.map.setView([this.userLocation.lat, this.userLocation.lng], 14);
                
                ui.showToast('Localização encontrada!', 'success', 1500);
            },
            (error) => {
                let message = 'Não foi possível obter sua localização';
                if (error.code === 1) {
                    message = 'Permissão de localização negada';
                } else if (error.code === 2) {
                    message = 'Localização indisponível';
                } else if (error.code === 3) {
                    message = 'Tempo de busca excedido';
                }
                
                ui.showToast(message, 'warning', 3000);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    },

    /**
     * Adiciona botão para centralizar na localização do usuário
     */
    addLocateButton() {
        // Verifica se o botão já existe
        if (document.querySelector('.btn-locate')) return;

        const button = document.createElement('button');
        button.className = 'btn-locate';
        button.innerHTML = '<i class="fas fa-location-arrow"></i>';
        button.title = 'Centralizar na minha localização';
        
        button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (this.userLocation) {
                this.map.setView([this.userLocation.lat, this.userLocation.lng], 15);
                ui.showToast('Centralizado na sua localização', 'success', 1000);
            } else {
                this.getUserLocation();
            }
        };
        
        // Adicionar ao container do mapa
        const mapContainer = document.getElementById('promo-map').parentElement;
        mapContainer.appendChild(button);
    },

    /**
     * Adiciona marcadores de promoções no mapa - VERSÃO MELHORADA COM LOGS
     * @param {Array} promotions - Lista de promoções com coordenadas
     */
    addPromotionMarkers(promotions) {
        // Limpar marcadores antigos
        this.clearMarkers();

        if (!promotions || promotions.length === 0) {
            ui.renderMapPromoList([]);
            return;
        }

        let marcadoresAdicionados = 0;
        let marcadoresIgnorados = 0;

        // Ícone personalizado para promoções
        const promoIcon = L.divIcon({
            className: 'promo-marker',
            html: '<div style="background-color: var(--primary, #4361ee); width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;"><i class="fas fa-tag"></i></div>',
            iconSize: [42, 42],
            iconAnchor: [21, 21],
            popupAnchor: [0, -21]
        });

        promotions.forEach((promo) => {
            // Verifica se a promoção tem autor
            if (!promo.author) {
                marcadoresIgnorados++;
                return;
            }

            // Verifica se tem coordenadas
            if (!promo.author.latitude || !promo.author.longitude) {
                marcadoresIgnorados++;
                return;
            }

            const lat = parseFloat(promo.author.latitude);
            const lng = parseFloat(promo.author.longitude);
            
            // Validar coordenadas
            if (isNaN(lat) || isNaN(lng)) {
                marcadoresIgnorados++;
                return;
            }

            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                marcadoresIgnorados++;
                return;
            }

            const marker = L.marker([lat, lng], {
                icon: promoIcon
            }).addTo(this.map);

            // Criar conteúdo do popup aprimorado
            const popupContent = this.createPopupContent(promo);
            
            marker.bindPopup(popupContent, {
                maxWidth: 300,
                minWidth: 240,
                className: 'promo-popup'
            });

            marker.on('click', () => {
                this.highlightPromoInList(promo.id);
            });

            this.markers.push({
                id: promo.id,
                marker: marker,
                data: promo
            });

            marcadoresAdicionados++;
        });

        // Atualizar lista lateral
        ui.renderMapPromoList(promotions);
        
        // Ajustar zoom para mostrar todos os marcadores
        if (this.markers.length > 0) {
            this.fitBounds();
            setTimeout(() => this.map.invalidateSize(), 200);
        }
    },

    /**
     * Cria o conteúdo HTML do popup (versão aprimorada)
     * @param {Object} promo - Dados da promoção
     * @returns {string} HTML do popup
     */
    createPopupContent(promo) {
        const safeTitle = utils.sanitizeInput(promo.title || '');
        const imageUrl = promo.image_url || '';
        const storeName = promo.author?.business_name || promo.author?.name || 'Comerciante';
        const safeStoreName = utils.sanitizeInput(storeName);
        const price = utils.formatCurrency(promo.new_price);
        const phone = promo.author?.phone || '';
        const lat = promo.author.latitude;
        const lng = promo.author.longitude;
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        // JSON.stringify garante escape seguro para contexto JS inline (onclick)
        const titleForJs = JSON.stringify(promo.title || '');
        const phoneForJs = JSON.stringify(phone);

        return `
            <div class="map-popup">
                ${imageUrl ? `
                    <div class="popup-image-container">
                        <img src="${imageUrl}" 
                             alt="${safeTitle}" 
                             class="popup-image"
                             onerror="this.style.display='none'; this.parentElement.style.display='none';">
                    </div>
                ` : ''}
                <div class="popup-content">
                    <h4 class="popup-title">${safeTitle}</h4>
                    <div class="popup-store">${safeStoreName}</div>
                    <div class="popup-price">${price}</div>
                    <div class="popup-buttons">
                        ${phone ? `
                            <button class="popup-btn popup-whatsapp" onclick="app.openWhatsApp(${phoneForJs}, ${titleForJs})">
                                <i class="fab fa-whatsapp"></i> WhatsApp
                            </button>
                        ` : ''}
                        <a href="${mapsUrl}" target="_blank" class="popup-btn popup-route">
                            <i class="fas fa-route"></i> Rota
                        </a>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Destaca uma promoção na lista (rolar até ela)
     * @param {string} promoId - ID da promoção
     */
    highlightPromoInList(promoId) {
        const item = document.querySelector(`.map-promo-item[data-promo-id="${promoId}"]`);
        if (item) {
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            item.style.backgroundColor = '#f0f7ff';
            item.style.transition = 'background-color 0.3s';
            setTimeout(() => {
                item.style.backgroundColor = '';
            }, 1000);
        }
    },

    /**
     * Ajusta o zoom do mapa para mostrar todos os marcadores
     */
    fitBounds() {
        if (this.markers.length === 0) return;
        
        const bounds = L.latLngBounds(this.markers.map(m => m.marker.getLatLng()));
        
        // Se tiver localização do usuário, incluir no bounds
        if (this.userLocation) {
            bounds.extend([this.userLocation.lat, this.userLocation.lng]);
        }
        
        this.map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 15
        });
    },

    /**
     * Calcula distância entre dois pontos (fórmula de Haversine)
     * @param {number} lat1 - Latitude do ponto 1
     * @param {number} lon1 - Longitude do ponto 1
     * @param {number} lat2 - Latitude do ponto 2
     * @param {number} lon2 - Longitude do ponto 2
     * @returns {number} Distância em km
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return Number((R * c).toFixed(1));
    },

    /**
     * Limpa todos os marcadores do mapa
     */
    clearMarkers() {
        this.markers.forEach(item => {
            if (this.map && item.marker) {
                this.map.removeLayer(item.marker);
            }
        });
        this.markers = [];
    },

    /**
     * Redimensiona o mapa (útil quando a tela muda)
     */
    resize() {
        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
            }, 200);
        }
    },

    /**
     * Centraliza o mapa em uma localização específica
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} zoom - Nível de zoom
     */
    centerAt(lat, lng, zoom = 15) {
        if (this.map) {
            this.map.setView([lat, lng], zoom);
        }
    },

    /**
     * Remove o mapa (limpeza)
     */
    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
            this.markers = [];
            this.userMarker = null;
            this.userLocation = null;
        }
    },

    /**
     * Mapa de rastreio de entrega (retirada, destino, posição motoboy)
     */
    initDeliveryTrackingMap(delivery, locations) {
        const container = document.getElementById('delivery-tracking-map');
        if (!container) return null;
        if (this.trackingMap) {
            this.trackingMap.remove();
            this.trackingMap = null;
        }
        this.trackingMap = L.map('delivery-tracking-map').setView([-25.0114, -50.8576], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(this.trackingMap);
        const points = [];
        if (delivery.pickup_lat != null && delivery.pickup_lng != null) {
            const m = L.marker([delivery.pickup_lat, delivery.pickup_lng]).addTo(this.trackingMap);
            m.bindPopup('<strong>Retirada</strong><br>' + utils.sanitizeInput(delivery.pickup_address || ''));
            points.push([delivery.pickup_lat, delivery.pickup_lng]);
        }
        if (delivery.delivery_lat != null && delivery.delivery_lng != null) {
            const m = L.marker([delivery.delivery_lat, delivery.delivery_lng]).addTo(this.trackingMap);
            m.bindPopup('<strong>Entrega</strong><br>' + utils.sanitizeInput(delivery.delivery_address || ''));
            points.push([delivery.delivery_lat, delivery.delivery_lng]);
        }
        const lastLoc = locations && locations.length ? locations[locations.length - 1] : null;
        if (lastLoc && lastLoc.lat != null && lastLoc.lng != null) {
            const motoboyIcon = L.divIcon({ className: 'motoboy-marker', html: '<i class="fas fa-motorcycle"></i>', iconSize: [24, 24] });
            L.marker([lastLoc.lat, lastLoc.lng], { icon: motoboyIcon }).addTo(this.trackingMap).bindPopup('Motoboy');
            points.push([lastLoc.lat, lastLoc.lng]);
        }
        if (points.length > 0) {
            const bounds = L.latLngBounds(points);
            this.trackingMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        }
        setTimeout(() => this.trackingMap?.invalidateSize(), 300);
        return this.trackingMap;
    }
};

// Exportação global
window.mapManager = mapManager;